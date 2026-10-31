//! Protocolo de controle (WebSocket, JSON) — `docs/arquitetura.md` §5.
//!
//! `t` é o discriminador. Cliente → servidor: `hello`, `mute`, `volume`, `bye`.
//! Servidor → cliente: `welcome`, `stats`, `error`.

use serde::{Deserialize, Serialize};

/// Versão do protocolo de controle.
pub const CTRL_VERSION: u8 = 1;

/// Codec do payload de áudio, no formato de texto do protocolo.
pub const CODEC_PCM16: &str = "pcm16";

/// Codec Opus (Fase 2).
pub const CODEC_OPUS: &str = "opus";

/// Mensagem do canal de controle.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum CtrlMessage {
    /// Abertura de sessão, enviada pelo celular logo após o handshake WS.
    Hello {
        /// Versão do protocolo.
        v: u8,
        /// Token de pareamento (vazio no MVP).
        token: String,
        /// Taxa de amostragem do celular (Hz).
        sample_rate: u32,
        /// Número de canais do áudio enviado.
        channels: u8,
        /// Codec preferido (`pcm16` ou `opus`).
        codec: String,
        /// Duração do frame de áudio em ms (10 no MVP).
        frame_ms: u16,
    },

    /// Resposta do servidor aceitando a sessão.
    Welcome {
        /// Identificador da sessão (usado pelo servidor para stats).
        session_id: String,
        /// Porta UDP onde o celular deve enviar o áudio.
        audio_port: u16,
        /// Profundidade alvo do jitter buffer, em ms.
        target_buffer_ms: u16,
        /// Codec efetivamente negociado.
        codec: String,
    },

    /// Liga/desliga o mute no servidor.
    Mute {
        /// `true` descarta o áudio recebido.
        value: bool,
    },

    /// Define o ganho de volume.
    Volume {
        /// Multiplicador, clampado em `[0.0, 4.0]` pelo servidor.
        value: f32,
    },

    /// Encerramento gracioso da sessão.
    Bye,

    /// Métricas de diagnóstico, enviadas a 1 Hz.
    Stats {
        /// Percentual de frames perdidos.
        loss_pct: f32,
        /// Profundidade atual do jitter buffer, em ms.
        buffer_ms: u32,
        /// Quantidade de lacunas de sequência detectadas.
        seq_gaps: u32,
        /// Quantidade de reconexões.
        reconnects: u32,
    },

    /// Erro do servidor (ou recusa de pareamento).
    Error {
        /// Código estável do erro (ex.: `bad_message`, `unauthorized`).
        code: String,
        /// Descrição legível.
        message: String,
    },
}

impl CtrlMessage {
    /// `true` se a mensagem é de erro.
    #[must_use]
    pub fn is_error(&self) -> bool {
        matches!(self, Self::Error { .. })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hello_deserializa_do_formato_do_docs() {
        let json = r#"{"t":"hello","v":1,"token":"","sampleRate":48000,"channels":1,"codec":"pcm16","frameMs":10}"#;
        let msg: CtrlMessage = serde_json::from_str(json).unwrap();
        assert_eq!(
            msg,
            CtrlMessage::Hello {
                v: 1,
                token: String::new(),
                sample_rate: 48000,
                channels: 1,
                codec: CODEC_PCM16.to_owned(),
                frame_ms: 10,
            }
        );
    }

    #[test]
    fn welcome_serializa_no_formato_do_docs() {
        let msg = CtrlMessage::Welcome {
            session_id: "c1f0".into(),
            audio_port: 41235,
            target_buffer_ms: 30,
            codec: CODEC_PCM16.into(),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["t"], "welcome");
        assert_eq!(json["sessionId"], "c1f0");
        assert_eq!(json["audioPort"], 41235);
        assert_eq!(json["targetBufferMs"], 30);
        assert_eq!(json["codec"], "pcm16");
    }

    #[test]
    fn bye_serializa_sem_campos() {
        let json = serde_json::to_string(&CtrlMessage::Bye).unwrap();
        assert_eq!(json, r#"{"t":"bye"}"#);
    }

    #[test]
    fn mute_e_volume_roundtrip() {
        let mute: CtrlMessage = serde_json::from_str(r#"{"t":"mute","value":true}"#).unwrap();
        assert_eq!(mute, CtrlMessage::Mute { value: true });

        let volume: CtrlMessage = serde_json::from_str(r#"{"t":"volume","value":1.2}"#).unwrap();
        assert_eq!(volume, CtrlMessage::Volume { value: 1.2 });
    }

    #[test]
    fn error_serializa_codigo_e_mensagem() {
        let json = serde_json::to_value(CtrlMessage::Error {
            code: "bad_message".into(),
            message: "mensagem inválida".into(),
        })
        .unwrap();
        assert_eq!(json["t"], "error");
        assert_eq!(json["code"], "bad_message");
        assert_eq!(json["message"], "mensagem inválida");
    }
}
