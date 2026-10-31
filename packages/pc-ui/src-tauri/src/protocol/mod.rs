//! Contratos compartilhados: portas, constantes e tipos do protocolo binário.

use serde::{Deserialize, Serialize};

/// Porta do beacon UDP de descoberta (broadcast na rede local).
pub const DISCOVERY_PORT: u16 = 41234;

/// Porta do servidor UDP de áudio (stream de um via).
pub const AUDIO_PORT: u16 = 41235;

/// Porta do servidor WebSocket de controle.
pub const CONTROL_PORT: u16 = 41236;

/// Bind genérico para os sockets.
pub const BIND_ADDR: &str = "0.0.0.0";

/// Tamanho fixo do cabeçalho binário Big-Endian (16 bytes).
pub const HEADER_LEN: usize = 16;

/// Beacon JSON enviado/recebido na porta UDP de descoberta.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Beacon {
    pub app: String,
    pub version: String,
    pub control_port: u16,
    pub audio_port: u16,
}
