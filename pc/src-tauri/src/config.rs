//! Configuração do servidor, compartilhada entre Rust e a UI (React).

use serde::{Deserialize, Serialize};

/// Configuração serializável, espelhando `ServerConfig` no frontend.
///
/// O codec do payload de áudio é fixo em PCM s16le (16 bytes de header +
/// payload little-endian). A negociação de Opus foi removida: o receptor
/// (`audio::receive_frames`) aceita apenas PCM e descarta o resto. O byte
/// `codec` do header (0 = PCM, 1 = Opus) permanece reservado no wire format
/// para uma futura fase — ver `protocol::audio::AudioCodec`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    /// Porta UDP de áudio.
    pub audio_port: u16,
    /// Porta WebSocket de controle.
    pub ctrl_port: u16,
    /// Substring do dispositivo de saída (ex.: `CABLE Input`).
    pub device_substring: Option<String>,
    /// Nome anunciado no beacon; `None` = usa o hostname do PC.
    pub name: Option<String>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            audio_port: crate::protocol::AUDIO_PORT,
            ctrl_port: crate::protocol::CONTROL_PORT,
            device_substring: None,
            name: None,
        }
    }
}
