//! Protocolo de controle (WebSocket, JSON) — `docs/arquitetura.md` §5.
//!
//! `t` é o discriminador. Cliente → servidor: `hello`, `mute`, `volume`, `bye`,
//! `ping`. Servidor → cliente: `welcome`, `stats`, `error`, `pong`.

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
        /// Mute atualmente aplicado pelo servidor (para o celular ressincronizar).
        muted: bool,
        /// Volume atualmente aplicado pelo servidor (`1.0` = 100%).
        volume: f32,
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

    /// Sondagem de latência (celular → PC).
    Ping {
        /// Identificador do ping (eco).
        id: u32,
        /// Timestamp de origem no relógio do celular (ms, domínio do `capture_ts`).
        t0_ms: f64,
        /// Offset entre o relógio do celular e o do PC (ms), medido no ping
        /// anterior. Ausente no primeiro ping.
        offset_ms: Option<f64>,
    },

    /// Resposta do servidor à sondagem.
    Pong {
        /// Identificador do ping (eco).
        id: u32,
        /// Timestamp de origem, ecoado.
        t0_ms: f64,
        /// Timestamp do servidor ao receber o ping (ms).
        t1_ms: f64,
    },

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
        /// Latência de rede mediana (capture → chegada no PC), em ms.
        latency_ms: f64,
        /// Latência de rede p95, em ms.
        latency_p95_ms: f64,
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
            muted: false,
            volume: 1.0,
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["t"], "welcome");
        assert_eq!(json["sessionId"], "c1f0");
        assert_eq!(json["audioPort"], 41235);
        assert_eq!(json["targetBufferMs"], 30);
        assert_eq!(json["codec"], "pcm16");
        assert_eq!(json["muted"], false);
        assert_eq!(json["volume"], 1.0);
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

    #[test]
    fn stats_serializa_latencia() {
        let json = serde_json::to_value(CtrlMessage::Stats {
            loss_pct: 1.5,
            buffer_ms: 30,
            seq_gaps: 2,
            reconnects: 1,
            latency_ms: 12.5,
            latency_p95_ms: 27.0,
        })
        .unwrap();

        assert_eq!(json["t"], "stats");
        assert_eq!(json["latencyMs"], 12.5);
        assert_eq!(json["latencyP95Ms"], 27.0);
    }

    #[test]
    fn ping_e_pong_roundtrip() {
        let ping: CtrlMessage =
            serde_json::from_str(r#"{"t":"ping","id":7,"t0Ms":1000.5,"offsetMs":-250.25}"#)
                .unwrap();
        assert_eq!(
            ping,
            CtrlMessage::Ping {
                id: 7,
                t0_ms: 1000.5,
                offset_ms: Some(-250.25),
            }
        );

        // Primeiro ping: ainda não há offset medido.
        let first: CtrlMessage =
            serde_json::from_str(r#"{"t":"ping","id":1,"t0Ms":10.0}"#).unwrap();
        assert_eq!(
            first,
            CtrlMessage::Ping {
                id: 1,
                t0_ms: 10.0,
                offset_ms: None,
            }
        );

        let pong: CtrlMessage =
            serde_json::from_str(r#"{"t":"pong","id":7,"t0Ms":1000.5,"t1Ms":1010.0}"#).unwrap();
        assert_eq!(
            pong,
            CtrlMessage::Pong {
                id: 7,
                t0_ms: 1000.5,
                t1_ms: 1010.0,
            }
        );
    }
}
