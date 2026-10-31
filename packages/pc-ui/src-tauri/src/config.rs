//! Configuração do servidor, compartilhada entre Rust e a UI (React).

use serde::{Deserialize, Serialize};

/// Codec do payload de áudio.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Codec {
    /// PCM 16-bit little-endian (MVP).
    Pcm,
    /// Opus (Fase 2) — default da UI.
    #[default]
    Opus,
}

/// Configuração serializável, espelhando `ServerConfig` no frontend.
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
    /// Codec preferido no payload de áudio.
    pub default_codec: Codec,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            audio_port: crate::protocol::AUDIO_PORT,
            ctrl_port: crate::protocol::CONTROL_PORT,
            device_substring: None,
            name: None,
            default_codec: Codec::default(),
        }
    }
}
