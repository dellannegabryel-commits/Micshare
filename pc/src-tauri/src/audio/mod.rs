//! Captura e reprodução do áudio do celular.
//!
//! Topologia (3 portas assíncronas):
//! - **UDP 41235**: o celular envia frames (header binário Big-Endian de 16
//!   bytes + payload PCM s16le) — ver `docs/arquitetura.md` §3.2.
//! - **Jitter buffer**: reordena, conta perda e preenche lacunas com silêncio.
//! - **cpal**: reproduz no dispositivo de saída do PC.

pub mod jitter;
pub mod latency;
pub mod resample;
pub mod sink;

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use cpal::traits::StreamTrait;
use tokio::net::UdpSocket;
use tokio::sync::Mutex as AsyncMutex;
use tokio::task::JoinHandle;

use crate::protocol::{AudioCodec, AudioFrameHeader, BIND_ADDR, HEADER_LEN};

pub use jitter::{JitterBuffer, JitterMetrics};
pub use latency::{ClockOffset, LatencyTracker};
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

/// Ganho aplicado no ingest (mute/volume do celular, via WS).
///
/// Distinto do [`AudioControls`] (mute/volume **local do PC**), que é aplicado
/// no callback RT do sink. Aplicar o ganho remoto aqui — no caminho que já
/// trata a flag `FLAG_MUTED` — evita tocar no caminho de tempo real; os dois
/// ganhos se multiplicam.
#[derive(Debug)]
pub struct RemoteGain {
    mute: AtomicBool,
    volume: AtomicU32,
}

impl Default for RemoteGain {
    /// Mesmos valores de [`RemoteGain::new`] — o `derive(Default)` colocaria
    /// `volume = 0` (silêncio absoluto).
    fn default() -> Self {
        Self::new()
    }
}

impl RemoteGain {
    /// Cria o ganho com mute desligado e volume em 100%.
    #[must_use]
    pub fn new() -> Self {
        Self {
            mute: AtomicBool::new(false),
            volume: AtomicU32::new(VOLUME_UNITY),
        }
    }

    /// Liga ou desliga o mute do celular.
    pub fn set_mute(&self, muted: bool) {
        self.mute.store(muted, Ordering::Relaxed);
    }

    /// `true` se o mute do celular está ligado.
    #[must_use]
    pub fn muted(&self) -> bool {
        self.mute.load(Ordering::Relaxed)
    }

    /// Define o volume (fixed-point `0..=VOLUME_MAX`).
    pub fn set_volume(&self, volume: u32) {
        self.volume.store(volume.min(VOLUME_MAX), Ordering::Relaxed);
    }

    /// Volume atual (fixed-point: `1000` = 100%).
    #[must_use]
    pub fn volume(&self) -> u32 {
        self.volume.load(Ordering::Relaxed)
    }
}

/// Origens autorizadas a enviar áudio.
///
/// Sem uma sessão de controle ativa, **qualquer** host da LAN pode injetar
/// áudio no microfone do usuário. A allowlist é alimentada pelo servidor de
/// controle (o IP do celular que abriu a sessão) e consultada no ingest: um
/// datagrama de outra origem é descartado e contado em
/// `JitterMetrics::rejected`.
///
/// O IP sai da lista quando a **última** sessão daquele IP fecha — duas
/// sessões do mesmo celular (reconexão em paralelo) não se cancelam.
#[derive(Debug, Clone, Default)]
pub struct AllowedSources {
    /// IP → número de sessões de controle ativas.
    ips: Arc<Mutex<HashMap<IpAddr, u32>>>,
}

impl AllowedSources {
    /// Libera um IP para enviar áudio (uma sessão a mais).
    pub fn allow(&self, ip: IpAddr) {
        if let Ok(mut ips) = self.ips.lock() {
            *ips.entry(ip).or_insert(0) += 1;
        }
    }

    /// Revoga o acesso de um IP (uma sessão a menos; sai quando não resta nenhuma).
    pub fn revoke(&self, ip: IpAddr) {
        if let Ok(mut ips) = self.ips.lock() {
            match ips.get_mut(&ip) {
                Some(count) if *count > 1 => *count -= 1,
                Some(_) => {
                    ips.remove(&ip);
                }
                None => {}
            }
        }
    }

    /// `true` se o IP pode enviar áudio.
    #[must_use]
    pub fn contains(&self, ip: IpAddr) -> bool {
        self.ips
            .lock()
            .map(|ips| ips.contains_key(&ip))
            .unwrap_or(false)
    }
}

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
    /// Ganho commanded pelo celular (mute/volume), aplicado no ingest.
    remote_gain: Arc<RemoteGain>,
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
    pub async fn start(
        config: AudioConfig,
        controls: AudioControls,
        remote_gain: Arc<RemoteGain>,
        allowed: Arc<AllowedSources>,
        latency: Option<Arc<LatencyTracker>>,
    ) -> Result<Self, DynError> {
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

        let receiver = tokio::spawn(receive_frames(
            socket,
            Arc::clone(&buffer),
            Some(Arc::clone(&remote_gain)),
            Arc::clone(&allowed),
            latency,
        ));

        Ok(Self {
            buffer,
            device_name: RwLock::new(device_name),
            receiver: AsyncMutex::new(Some(receiver)),
            sink: Mutex::new(sink_handle),
            controls,
            remote_gain,
            requested_device: Mutex::new(config.device_substring.clone()),
        })
    }

    /// Ganho commanded pelo celular (mute/volume).
    #[must_use]
    pub fn remote_gain(&self) -> &RemoteGain {
        &self.remote_gain
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
    /// A troca é transacional e nunca deixa dois streams tocando:
    /// 1. **Constrói** o stream do novo dispositivo, ainda pausado — se a
    ///    abertura falhar (dispositivo inexistente, formato não suportado), o
    ///    dispositivo atual continua tocando intacto.
    /// 2. Derruba o sink antigo com `stop_and_join` (aguarda o drop do
    ///    `cpal::Stream` e a liberação do endpoint no WASAPI).
    /// 3. **Inicia** (`play`) o novo stream. Se o `play` falhar, reabre o
    ///    dispositivo anterior (rollback) para o áudio não ficar mudo.
    ///
    /// O novo stream consome do **mesmo** `Arc<Mutex<JitterBuffer>>` alimentado
    /// pela task UDP — o servidor não reinicia e os frames continuam
    /// enfileirando durante a troca (o jitter buffer absorve a janela).
    pub fn set_output_device(&self, device_substring: Option<&str>) -> Result<String, DynError> {
        // 1) Constrói o novo stream (pausado — ainda não consome o buffer).
        let (new_stream, new_name) = sink::build_output(
            device_substring,
            Arc::clone(&self.buffer),
            self.controls.clone(),
        )
        .map_err(|err| format!("falha ao abrir o dispositivo '{device_substring:?}': {err}"))?;

        // 2) Libera o dispositivo antigo de forma determinística (o endpoint
        //    precisa estar livre antes de o novo stream tocar).
        if let Ok(mut sink) = self.sink.lock() {
            sink.stop_and_join();
        }

        // 3) Inicia o novo stream.
        if let Err(err) = new_stream.play() {
            eprintln!("[áudio] falha ao iniciar '{new_name}': {err}; restaurando o anterior");

            // Rollback: reabre o dispositivo anterior para o áudio não ficar mudo.
            let previous = self
                .requested_device
                .lock()
                .ok()
                .and_then(|guard| guard.clone())
                .or_else(|| Some(self.device_name()))
                .filter(|name| !name.is_empty());

            if let Some(previous) = previous {
                if let Ok((old_stream, old_name)) = sink::build_output(
                    Some(&previous),
                    Arc::clone(&self.buffer),
                    self.controls.clone(),
                ) {
                    if old_stream.play().is_ok() {
                        let handle = SinkHandle::spawn(old_stream);
                        if let Ok(mut sink) = self.sink.lock() {
                            *sink = handle;
                        }
                        if let Ok(mut name) = self.device_name.write() {
                            *name = old_name;
                        }
                        return Err(format!(
                            "falha ao iniciar '{new_name}': {err} (dispositivo anterior restaurado)"
                        )
                        .into());
                    }
                }
            }

            return Err(format!("falha ao iniciar '{new_name}': {err}").into());
        }

        // 4) Assume o novo stream.
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

    /// Percentual de frames perdidos (lacunas de sequência sobre o total esperado).
    ///
    /// `lost` (frames duplicados ou que chegaram tarde demais) **não** entra
    /// na conta: esses frames foram recebidos — já estão no denominador — e
    /// somá-los de novo no numerador inflava a perda artificialmente.
    #[must_use]
    pub fn loss_pct(&self) -> f32 {
        let metrics = self.metrics();
        let expected = metrics.received + metrics.gaps;
        if expected == 0 {
            return 0.0;
        }
        (metrics.gaps as f32 / expected as f32) * 100.0
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
///
/// `allowed` restringe o ingest aos IPs com sessão de controle: um datagrama
/// de outro host da LAN é descartado e contado em `JitterMetrics::rejected`.
///
/// `latency` mede a latência de rede (capture → chegada): sem offset
/// publicado pelo celular a medição é ignorada.
pub async fn receive_frames(
    socket: UdpSocket,
    buffer: Arc<Mutex<JitterBuffer>>,
    remote_gain: Option<Arc<RemoteGain>>,
    allowed: Arc<AllowedSources>,
    latency: Option<Arc<LatencyTracker>>,
) {
    let mut datagram =
        vec![0_u8; HEADER_LEN + usize::from(crate::protocol::audio::MAX_PAYLOAD_LEN)];

    loop {
        let Ok((len, peer)) = socket.recv_from(&mut datagram).await else {
            break;
        };

        if !allowed.contains(peer.ip()) {
            if let Ok(mut guard) = buffer.lock() {
                guard.note_rejected();
            }
            continue;
        }

        let Ok((header, payload)) = AudioFrameHeader::decode(&datagram[..len]) else {
            continue;
        };

        if header.codec != AudioCodec::Pcm16 || header.channels != CHANNELS {
            continue;
        }

        // Latência de rede: do capture (no relógio do celular) até a chegada
        // aqui (no relógio do PC).
        if let Some(latency) = &latency {
            latency.observe(header.capture_ts);
        }

        // Frame mutado: mantemos a sequência (inserindo silêncio) para evitar
        // buracos de seq e inflação artificial da perda.
        let samples: Vec<i16> = if header.is_muted() {
            vec![0; payload.len() / 2]
        } else if let Some(gain) = &remote_gain {
            if gain.muted() {
                vec![0; payload.len() / 2]
            } else {
                let vol = gain.volume();
                if vol == VOLUME_UNITY {
                    payload
                        .chunks_exact(2)
                        .map(|pair| i16::from_le_bytes([pair[0], pair[1]]))
                        .collect()
                } else {
                    payload
                        .chunks_exact(2)
                        .map(|pair| {
                            let s = i16::from_le_bytes([pair[0], pair[1]]);
                            let v = (s as i32 * vol as i32 / VOLUME_UNITY as i32)
                                .clamp(i16::MIN as i32, i16::MAX as i32);
                            v as i16
                        })
                        .collect()
                }
            }
        } else {
            payload
                .chunks_exact(2)
                .map(|pair| i16::from_le_bytes([pair[0], pair[1]]))
                .collect()
        };

        // Decode/ganho fora do lock: minimiza contenção com o callback RT do sink.
        if let Ok(mut guard) = buffer.lock() {
            guard.push_with_ts(header.seq, header.capture_ts, samples);
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
