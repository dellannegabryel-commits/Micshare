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

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};
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

/// Volume "unity gain" em fixed-point: 1000 = 100%.
pub const VOLUME_UNITY: u32 = 1000;

/// Volume máximo em fixed-point: 4000 = 400% (limite do slider da UI).
pub const VOLUME_MAX: u32 = 4000;

/// Controles de reprodução do PC (mute/volume), aplicados no callback RT do sink.
///
/// O estado vive em átomos compartilhados entre a thread de comando (UI) e a
/// thread de tempo real do `cpal` — nenhum lock, nenhuma alocação no caminho
/// quente. É controle **local do PC**, distinto do mute/volume que o celular
/// envia pelo canal de controle (WebSocket).
#[derive(Debug, Clone)]
pub struct AudioControls {
    mute: Arc<AtomicBool>,
    volume: Arc<AtomicU32>,
}

impl Default for AudioControls {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioControls {
    /// Cria os controles com mute desligado e volume em 100%.
    #[must_use]
    pub fn new() -> Self {
        Self {
            mute: Arc::new(AtomicBool::new(false)),
            volume: Arc::new(AtomicU32::new(VOLUME_UNITY)),
        }
    }

    /// Liga ou desliga o mute da reprodução.
    pub fn set_mute(&self, muted: bool) {
        self.mute.store(muted, Ordering::Relaxed);
    }

    /// `true` se a reprodução está mutada.
    #[must_use]
    pub fn muted(&self) -> bool {
        self.mute.load(Ordering::Relaxed)
    }

    /// Define o volume (fixed-point `0..=VOLUME_MAX`; acima é limitado).
    pub fn set_volume(&self, volume: u32) {
        self.volume.store(volume.min(VOLUME_MAX), Ordering::Relaxed);
    }

    /// Volume atual (fixed-point: 1000 = 100%).
    #[must_use]
    pub fn volume(&self) -> u32 {
        self.volume.load(Ordering::Relaxed)
    }
}

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
    /// Nome do dispositivo de saída em uso (legível para a UI).
    device_name: RwLock<String>,
    /// Handle da task receptora, tomado no `shutdown` para aguardar a liberação
    /// do socket UDP antes de retornar (evita `portInUse` no restart).
    receiver: AsyncMutex<Option<JoinHandle<()>>>,
    /// Sink ativo; trocado em quente por [`AudioPipeline::set_output_device`].
    sink: Mutex<SinkHandle>,
    controls: AudioControls,
    /// Último dispositivo solicitado (substring; `None` = padrão do sistema).
    /// Guardado para rollback quando a troca falha.
    requested_device: Mutex<Option<String>>,
}

/// Mantém o stream do `cpal` vivo em uma thread dedicada.
///
/// O `Stream` do cpal não é `Sync`; a thread apenas o segura até o pipeline
/// parar. `stop_and_join` aguarda a thread dropar o stream — essencial no
/// hot-swap, para que o dispositivo antigo seja **liberado** antes de abrir
/// o novo (WASAPI falha se o endpoint ainda estiver em uso).
struct SinkHandle {
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl SinkHandle {
    /// Cria o handle e mova o `stream` para a thread dedicada.
    fn spawn(stream: cpal::Stream) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&stop);
        let thread = std::thread::spawn(move || {
            while !flag.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(50));
            }
            // Só aqui o stream é dropado → dispositivo liberado.
            drop(stream);
        });
        Self {
            stop,
            thread: Some(thread),
        }
    }

    /// Sinaliza a parada e aguarda a thread dropar o stream.
    fn stop_and_join(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for SinkHandle {
    fn drop(&mut self) {
        // Melhor esforço: sinaliza a thread (que dropa o stream ao ver o flag).
        // Não faz `join` no Drop para nunca bloquear o descarte; o caminho
        // determinístico (stop/hot-swap) usa `stop_and_join`.
        self.stop.store(true, Ordering::Relaxed);
    }
}

impl AudioPipeline {
    /// Sobe o pipeline: bind no socket UDP e inicia a reprodução.
    ///
    /// `controls` é compartilhado com o callback do sink (mute/volume aplicados
    /// em tempo real) e pode ser criado pelo dono para sobreviver a restarts
    /// do pipeline.
    pub async fn start(config: AudioConfig, controls: AudioControls) -> Result<Self, DynError> {
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
            controls.clone(),
            FRAME_SAMPLES,
        )?;

        // O stream vive em uma thread dedicada: o `Stream` do cpal não é
        // `Sync`, e a thread apenas o mantém vivo até o pipeline parar.
        let sink_handle = SinkHandle::spawn(stream);

        let receiver = tokio::spawn(receive_frames(socket, Arc::clone(&buffer)));

        Ok(Self {
            buffer,
            device_name: RwLock::new(device_name),
            receiver: AsyncMutex::new(Some(receiver)),
            sink: Mutex::new(sink_handle),
            controls,
            requested_device: Mutex::new(config.device_substring.clone()),
        })
    }

    /// Controles de mute/volume da reprodução (compartilhados com o sink).
    #[must_use]
    pub fn controls(&self) -> &AudioControls {
        &self.controls
    }

    /// Nome do dispositivo de saída em uso.
    #[must_use]
    pub fn device_name(&self) -> String {
        self.device_name
            .read()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    /// Troca o dispositivo de saída **em quente**, preservando o jitter buffer.
    ///
    /// A troca é transacional:
    /// 1. Abre o stream no novo dispositivo **antes** de derrubar o antigo —
    ///    se falhar, o dispositivo atual continua tocando (nada muda).
    /// 2. Só então para o sink antigo com `stop_and_join` (aguarda o drop do
    ///    stream e a liberação do endpoint no WASAPI).
    /// 3. Inicia o novo stream e atualiza o nome exposto na UI.
    ///
    /// O novo stream consome do **mesmo** `Arc<Mutex<JitterBuffer>>` alimentado
    /// pela task UDP — sem reiniciar o servidor nem perder frames no meio da
    /// troca (o buffer continua enfileirando enquanto o swap acontece).
    pub fn set_output_device(&self, device_substring: Option<&str>) -> Result<String, DynError> {
        // 1) Abre o novo stream primeiro (o antigo segue tocando em paralelo
        //    durante a abertura; só o novo consome do buffer após o play).
        let opened = sink::start_output(
            device_substring,
            Arc::clone(&self.buffer),
            self.controls.clone(),
            FRAME_SAMPLES,
        );

        let (new_stream, new_name) = match opened {
            Ok(opened) => opened,
            Err(err) => {
                // Falhou abrir o novo: o sink antigo nunca foi tocado — a UI
                // recebe o erro estruturado e o áudio continua no dispositivo
                // atual.
                return Err(
                    format!("falha ao abrir o dispositivo '{device_substring:?}': {err}").into(),
                );
            }
        };

        // 2) Libera o dispositivo antigo de forma determinística.
        if let Ok(mut sink) = self.sink.lock() {
            sink.stop_and_join();
        }

        // 3) Assume o novo stream.
        let new_handle = SinkHandle::spawn(new_stream);
        if let Ok(mut sink) = self.sink.lock() {
            *sink = new_handle;
        }
        if let Ok(mut name) = self.device_name.write() {
            *name = new_name.clone();
        }
        if let Ok(mut requested) = self.requested_device.lock() {
            *requested = device_substring.map(str::to_owned);
        }

        Ok(new_name)
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
        if let Ok(mut sink) = self.sink.lock() {
            sink.stop_and_join();
        }
    }
}

impl Drop for AudioPipeline {
    fn drop(&mut self) {
        // Melhor esforço: sinaliza a thread do sink e aborta a task receptora.
        // Não podemos aguardar aqui (Drop não é async), mas o caminho de
        // restart usa `stop().await`, que é determinístico.
        if let Ok(mut guard) = self.receiver.try_lock() {
            if let Some(handle) = guard.take() {
                handle.abort();
            }
        }
        // O Drop do SinkHandle sinaliza a thread do stream.
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
