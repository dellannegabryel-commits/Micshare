//! Contratos compartilhados: portas, constantes e tipos do protocolo.

pub mod audio;
pub mod ctrl;

use serde::{Deserialize, Serialize};

pub use audio::{AudioCodec, AudioFrameHeader, FrameError};
pub use ctrl::{CODEC_OPUS, CODEC_PCM16, CTRL_VERSION, CtrlMessage};

/// Porta do beacon UDP de descoberta (broadcast na rede local).
pub const DISCOVERY_PORT: u16 = 41234;

/// Porta do servidor UDP de áudio (stream de um via).
pub const AUDIO_PORT: u16 = 41235;

/// Porta do servidor WebSocket de controle.
pub const CONTROL_PORT: u16 = 41236;

/// Bind genérico para os sockets.
pub const BIND_ADDR: &str = "0.0.0.0";

/// Tamanho fixo do cabeçalho binário Big-Endian (16 bytes).
pub use audio::HEADER_LEN;

/// Identificador da aplicação no beacon (descoberta).
pub const APP_ID: &str = "micshare";

/// Versão do protocolo de descoberta.
pub const PROTOCOL_VERSION: u8 = 1;

/// Limite de tamanho do beacon em bytes (docs/arquitetura.md §6).
pub const BEACON_MAX_BYTES: usize = 200;

/// Beacon JSON de descoberta (≤ 200 B), conforme `docs/arquitetura.md` §6.
///
/// Serializado como:
/// `{"app":"micshare","v":1,"name":"DESKTOP-GABRY","audioPort":41235,
///   "ctrlPort":41236,"pair":false,"code":""}`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Beacon {
    /// Sempre `micshare` — permite filtrar outras aplicações na mesma porta.
    pub app: String,
    /// Versão do protocolo de descoberta.
    pub v: u8,
    /// Nome do PC (hostname), usado pelo app para deduplicar e exibir.
    pub name: String,
    /// Porta UDP de áudio que o celular deve enviar frames.
    pub audio_port: u16,
    /// Porta WebSocket de controle.
    pub ctrl_port: u16,
    /// Pareamento por código ativo (fora do MVP, mas reservado no wire format).
    pub pair: bool,
    /// Código de pareamento; vazio enquanto `pair` for `false`.
    pub code: String,
}

impl Beacon {
    /// Cria o beacon deste host para as portas dadas.
    #[must_use]
    pub fn new(
        name: impl Into<String>,
        audio_port: u16,
        ctrl_port: u16,
        pairing_code: Option<String>,
    ) -> Self {
        let code = pairing_code.unwrap_or_default();
        Self {
            app: APP_ID.to_owned(),
            v: PROTOCOL_VERSION,
            name: name.into(),
            audio_port,
            ctrl_port,
            pair: !code.is_empty(),
            code,
        }
    }
}

/// Requisição de descoberta enviada pelo celular quando o broadcast não chega.
///
/// Serializada como `{"t":"probe"}`. O PC responde com o beacon.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum DiscoveryRequest {
    /// "probe" — o celular pede a identificação do PC.
    Probe,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn beacon_cabe_no_limite_de_200_bytes() {
        let beacon = Beacon::new("DESKTOP-GABRY", AUDIO_PORT, CONTROL_PORT, None);
        let json = serde_json::to_string(&beacon).unwrap();
        assert!(
            json.len() <= BEACON_MAX_BYTES,
            "beacon excedeu o limite: {json}"
        );
    }

    #[test]
    fn beacon_usa_o_formato_do_docs() {
        let beacon = Beacon::new("DESKTOP-GABRY", AUDIO_PORT, CONTROL_PORT, None);
        let json = serde_json::to_string(&beacon).unwrap();
        assert_eq!(
            json,
            r#"{"app":"micshare","v":1,"name":"DESKTOP-GABRY","audioPort":41235,"ctrlPort":41236,"pair":false,"code":""}"#
        );
    }

    #[test]
    fn beacon_com_codigo_marca_pareamento_ativo() {
        let beacon = Beacon::new("PC", AUDIO_PORT, CONTROL_PORT, Some("123456".into()));
        assert!(beacon.pair);
        assert_eq!(beacon.code, "123456");
    }

    #[test]
    fn beacon_faz_roundtrip() {
        let beacon = Beacon::new("PC-TESTE", AUDIO_PORT, CONTROL_PORT, None);
        let json = serde_json::to_string(&beacon).unwrap();
        let parsed: Beacon = serde_json::from_str(&json).unwrap();
        assert_eq!(beacon, parsed);
    }

    #[test]
    fn probe_serializa_como_t_probe() {
        let json = serde_json::to_string(&DiscoveryRequest::Probe).unwrap();
        assert_eq!(json, r#"{"t":"probe"}"#);
    }

    #[test]
    fn probe_faz_roundtrip() {
        let parsed: DiscoveryRequest = serde_json::from_str(r#"{"t":"probe"}"#).unwrap();
        assert_eq!(parsed, DiscoveryRequest::Probe);
    }
}
