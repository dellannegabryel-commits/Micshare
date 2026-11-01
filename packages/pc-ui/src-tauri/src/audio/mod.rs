//! Captura e reprodução do áudio do celular.
//!
//! Topologia (3 portas assíncronas):
//! - **UDP 41235**: o celular envia frames (header binário Big-Endian de 16
//!   bytes + payload PCM s16le) — ver `docs/arquitetura.md` §3.2.
//! - **Jitter buffer**: reordena, conta perda e preenche lacunas com silêncio.
//! - **cpal**: reproduz no dispositivo de saída do PC.

pub mod jitter;
pub mod resample;
pub mod sink;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::net::UdpSocket;
use tokio::sync::Mutex as AsyncMutex;
use tokio::task::JoinHandle;

use crate::protocol::{AudioCodec, AudioFrameHeader, BIND_ADDR, HEADER_LEN};

pub use jitter::{JitterBuffer, JitterMetrics};
pub use sink::OutputDevice;

type DynError = Box<dyn std::error::Error + Send + Sync>;

/// Taxa de amostragem do pipeline de áudio.
pub const SAMPLE_RATE: u32 = 48_000;

/// Canais do pipeline de áudio (mono).
pub const CHANNELS: u8 = 1;

/// Duração do frame de áudio em ms (10 ms = 480 amostras a 48 kHz).
pub const FRAME_MS: u16 = 10;

/// Amostras por frame (480 = 10 ms a 48 kHz mono).
pub const FRAME_SAMPLES: usize = 480;

/// Bytes de payload PCM por frame (480 amostras × 2 bytes).
pub const FRAME_PAYLOAD_LEN: u16 = (FRAME_SAMPLES * 2) as u16;

/// Profundidade máxima do jitter buffer (ms).
pub const MAX_BUFFER_MS: u32 = 100;

/// Configuração do pipeline de áudio.
#[derive(Debug, Clone)]
pub struct AudioConfig {
    /// Porta UDP onde os frames são recebidos.
    pub port: u16,
    /// Substring do dispositivo de saída (ex.: `CABLE Input`).
    pub device_substring: Option<String>,
    /// Profundidade alvo do jitter buffer (ms).
    pub target_buffer_ms: u16,
}

/// Pipeline de áudio: recebe os frames do celular e reproduz no PC.
pub struct AudioPipeline {
    buffer: Arc<Mutex<JitterBuffer>>,
    device_name: String,
    /// Handle da task receptora, tomado no `shutdown` para aguardar a liberação
    /// do socket UDP antes de retornar (evita `portInUse` no restart).
    receiver: AsyncMutex<Option<JoinHandle<()>>>,
    sink: SinkHandle,
}

/// Mantém o stream do `cpal` vivo em uma thread dedicada.
///
/// O `Stream` do cpal não é `Sync`; a thread apenas o segura até o pipeline
/// parar, e o `Drop` sinaliza a saída.
struct SinkHandle {
    stop: Arc<AtomicBool>,
}

impl Drop for SinkHandle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

impl AudioPipeline {
    /// Sobe o pipeline: bind no socket UDP e inicia a reprodução.
    pub async fn start(config: AudioConfig) -> Result<Self, DynError> {
        let socket = UdpSocket::bind((BIND_ADDR, config.port)).await?;

        let buffer = Arc::new(Mutex::new(JitterBuffer::new(
            FRAME_SAMPLES,
            u32::from(FRAME_MS),
            u32::from(config.target_buffer_ms),
            MAX_BUFFER_MS,
        )));

        let (stream, device_name) = sink::start_output(
            config.device_substring.as_deref(),
            Arc::clone(&buffer),
            FRAME_SAMPLES,
        )?;

        // O stream vive em uma thread dedicada: o `Stream` do cpal não é
        // `Sync`, e a thread apenas o mantém vivo até o pipeline parar.
        let stop = Arc::new(AtomicBool::new(false));
        let sink_stop = Arc::clone(&stop);
        std::thread::spawn(move || {
            while !sink_stop.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(100));
            }
            drop(stream);
        });

        let receiver = tokio::spawn(receive_frames(socket, Arc::clone(&buffer)));

        Ok(Self {
            buffer,
            device_name,
            receiver: AsyncMutex::new(Some(receiver)),
            sink: SinkHandle { stop },
        })
    }

    /// Nome do dispositivo de saída em uso.
    #[must_use]
    pub fn device_name(&self) -> &str {
        &self.device_name
    }

    /// Métricas do jitter buffer.
    #[must_use]
    pub fn metrics(&self) -> JitterMetrics {
        self.buffer
            .lock()
            .map(|guard| guard.metrics())
            .unwrap_or_default()
    }

    /// Frames reproduzidos por segundo.
    #[must_use]
    pub fn fps(&self) -> f32 {
        self.buffer
            .lock()
            .map(|guard| guard.fps())
            .unwrap_or_default()
    }

    /// Percentual de frames perdidos (duplicados + lacunas).
    #[must_use]
    pub fn loss_pct(&self) -> f32 {
        let metrics = self.metrics();
        if metrics.received == 0 {
            return 0.0;
        }
        let lost = metrics.lost + metrics.gaps;
        (lost as f32 / metrics.received as f32) * 100.0
    }

    /// Esvazia o jitter buffer (troca de sessão).
    pub fn flush(&self) {
        if let Ok(mut guard) = self.buffer.lock() {
            guard.flush();
        }
    }

    /// Encerra o pipeline aguardando a liberação do socket UDP.
    ///
    /// `abort()` cancela a task, mas o future (e o socket que ela detém) só é
    /// dropado no próximo tick do scheduler. Ao fazer `await` no `JoinHandle`,
    /// garantimos que a task terminou e o socket foi fechado **antes** de
    /// retornar — essencial para o restart não cair em `portInUse`.
    pub async fn stop(&self) {
        let handle = self.receiver.lock().await.take();
        if let Some(handle) = handle {
            handle.abort();
            // Aguarda o drop real do future (socket liberado).
            let _ = handle.await;
        }
        self.sink.stop.store(true, Ordering::Relaxed);
    }
}

impl Drop for AudioPipeline {
    fn drop(&mut self) {
        // Melhor esforço: sinaliza a thread do sink e aborta a task receptora.
        // Não podemos aguardar aqui (Drop não é async), mas o caminho de
        // restart usa `stop().await`, que é determinístico.
        self.sink.stop.store(true, Ordering::Relaxed);
        if let Ok(mut guard) = self.receiver.try_lock() {
            if let Some(handle) = guard.take() {
                handle.abort();
            }
        }
    }
}

/// Recebe frames UDP, valida o header e alimenta o jitter buffer.
///
/// Fica em loop até o socket ser fechado ou a task ser abortada.
pub async fn receive_frames(socket: UdpSocket, buffer: Arc<Mutex<JitterBuffer>>) {
    let mut datagram =
        vec![0_u8; HEADER_LEN + usize::from(crate::protocol::audio::MAX_PAYLOAD_LEN)];

    loop {
        let Ok((len, _peer)) = socket.recv_from(&mut datagram).await else {
            break;
        };

        let Ok((header, payload)) = AudioFrameHeader::decode(&datagram[..len]) else {
            continue;
        };

        if header.codec != AudioCodec::Pcm16 || header.channels != CHANNELS {
            continue;
        }

        // Frame mutado: o PC não reproduz áudio silenciado pelo celular.
        if header.is_muted() {
            continue;
        }

        let samples: Vec<i16> = payload
            .chunks_exact(2)
            .map(|pair| i16::from_le_bytes([pair[0], pair[1]]))
            .collect();

        if let Ok(mut guard) = buffer.lock() {
            guard.push(header.seq, samples);
        }
    }
}

/// Monta o datagrama de áudio: header Big-Endian + payload PCM.
///
/// O payload PCM é little-endian (PCM s16le), enquanto o header é
/// big-endian — ver `docs/arquitetura.md` §3.
#[must_use]
pub fn build_frame(seq: u32, capture_ts_ms: u32, pcm: &[i16]) -> Vec<u8> {
    let payload_len = u16::try_from(pcm.len() * 2).unwrap_or(FRAME_PAYLOAD_LEN);
    let header = AudioFrameHeader::new(seq, capture_ts_ms, payload_len, AudioCodec::Pcm16);

    let mut datagram = Vec::with_capacity(HEADER_LEN + usize::from(payload_len));
    datagram.extend_from_slice(&header.encode());
    datagram.extend(pcm.iter().flat_map(|sample| sample.to_le_bytes()));
    datagram
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::AudioFrameHeader;

    #[test]
    fn frame_tem_header_e_payload() {
        let pcm = vec![0_i16; FRAME_SAMPLES];
        let datagram = build_frame(7, 1_000, &pcm);

        assert_eq!(datagram.len(), HEADER_LEN + usize::from(FRAME_PAYLOAD_LEN));

        let (header, payload) = AudioFrameHeader::decode(&datagram).unwrap();
        assert_eq!(header.seq, 7);
        assert_eq!(header.capture_ts, 1_000);
        assert_eq!(header.channels, CHANNELS);
        assert_eq!(header.codec, AudioCodec::Pcm16);
        assert_eq!(payload.len(), usize::from(FRAME_PAYLOAD_LEN));
    }

    #[test]
    fn payload_pcm_e_little_endian() {
        let pcm = vec![1_i16, -1_i16];
        let datagram = build_frame(0, 0, &pcm);
        let payload = &datagram[HEADER_LEN..];

        assert_eq!(payload[0], 1);
        assert_eq!(payload[1], 0);
        assert_eq!(payload[2], 0xFF);
        assert_eq!(payload[3], 0xFF);
    }

    #[test]
    fn frame_de_10ms_cabe_no_mtu() {
        // 976 B < 1472 B úteis do MTU de Wi-Fi.
        let pcm = vec![0_i16; FRAME_SAMPLES];
        let datagram = build_frame(0, 0, &pcm);
        assert!(
            datagram.len() <= 1472,
            "frame estourou o MTU: {}",
            datagram.len()
        );
    }
}
