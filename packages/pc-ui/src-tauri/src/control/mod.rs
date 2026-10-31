//! Canal de controle via WebSocket (JSON) — `docs/arquitetura.md` §5.
//!
//! O celular abre a sessão com `hello`; o PC responde `welcome` com o
//! `sessionId` e a porta de áudio. Depois, o celular envia `mute`/`volume`
//! e recebe `stats` a 1 Hz.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime};

use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio::sync::{RwLock, mpsc};
use tokio_tungstenite::tungstenite::Message;

use crate::protocol::{CODEC_OPUS, CODEC_PCM16, CtrlMessage};

/// Tamanho máximo de uma mensagem de controle (docs §10: 1 KB).
pub const MAX_MESSAGE_LEN: usize = 1024;

/// Intervalo de envio das métricas (`stats`).
pub const STATS_INTERVAL: Duration = Duration::from_secs(1);

type DynError = Box<dyn std::error::Error + Send + Sync>;

/// Configuração do servidor de controle.
#[derive(Debug, Clone)]
pub struct ControlConfig {
    /// Porta WebSocket.
    pub port: u16,
    /// Porta UDP de áudio anunciada no `welcome`.
    pub audio_port: u16,
    /// Profundidade alvo do jitter buffer (ms).
    pub target_buffer_ms: u16,
    /// Token de pareamento exigido; `None` = sem pareamento (MVP).
    pub pairing_token: Option<String>,
}

/// Dados de uma sessão ativa.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    /// Identificador da sessão.
    pub id: String,
    /// IP do celular.
    pub ip: String,
    /// Codec negociado.
    pub codec: String,
    /// Momento da conexão.
    pub connected_at: SystemTime,
}

/// Métricas enviadas ao celular via `stats`.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct ControlStats {
    /// Percentual de frames perdidos.
    pub loss_pct: f32,
    /// Profundidade do jitter buffer (ms).
    pub buffer_ms: u32,
    /// Lacunas de sequência detectadas.
    pub seq_gaps: u32,
    /// Reconexões.
    pub reconnects: u32,
}

/// Estado compartilhado do canal de controle.
#[derive(Debug)]
pub struct ControlState {
    /// Métricas atuais do pipeline de áudio.
    pub stats: ControlStats,
    /// Estado de mute aplicado pelo celular.
    pub muted: bool,
    /// Ganho de volume aplicado pelo celular.
    pub volume: f32,
}

impl Default for ControlState {
    fn default() -> Self {
        Self {
            stats: ControlStats::default(),
            muted: false,
            volume: 1.0,
        }
    }
}

/// Sessão ativa: dados públicos + canal de envio assíncrono.
#[derive(Debug, Clone)]
struct SessionEntry {
    info: SessionInfo,
    tx: mpsc::UnboundedSender<CtrlMessage>,
}

/// Servidor de controle WebSocket.
pub struct ControlServer {
    listener: TcpListener,
    config: ControlConfig,
    sessions: Arc<RwLock<HashMap<String, SessionEntry>>>,
    state: Arc<RwLock<ControlState>>,
    session_seq: AtomicU64,
    reconnects: AtomicU64,
}

impl ControlServer {
    /// Faz bind no socket TCP de controle.
    pub async fn bind(config: ControlConfig) -> std::io::Result<Self> {
        let listener = TcpListener::bind((crate::protocol::BIND_ADDR, config.port)).await?;
        Ok(Self {
            listener,
            config,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            state: Arc::new(RwLock::new(ControlState::default())),
            session_seq: AtomicU64::new(0),
            reconnects: AtomicU64::new(0),
        })
    }

    /// Porta efetivamente vinculada.
    pub fn local_addr(&self) -> std::io::Result<SocketAddr> {
        self.listener.local_addr()
    }

    /// Snapshot das sessões ativas.
    pub async fn sessions(&self) -> Vec<SessionInfo> {
        self.sessions
            .read()
            .await
            .values()
            .map(|entry| entry.info.clone())
            .collect()
    }

    /// Snapshot do estado de controle.
    pub async fn state(&self) -> ControlState {
        let state = self.state.read().await;
        ControlState {
            stats: state.stats,
            muted: state.muted,
            volume: state.volume,
        }
    }

    /// Atualiza as métricas divulgadas em `stats`.
    pub async fn set_stats(&self, stats: ControlStats) {
        self.state.write().await.stats = stats;
    }

    /// Encerra todas as sessões.
    pub async fn disconnect_all(&self) {
        let entries: Vec<SessionEntry> = self.sessions.read().await.values().cloned().collect();
        for entry in entries {
            let _ = entry.tx.send(CtrlMessage::Bye);
        }
        self.sessions.write().await.clear();
    }

    /// Loop principal: aceita conexões e envia `stats` a 1 Hz.
    pub async fn run(self: Arc<Self>) -> std::io::Result<()> {
        let mut ticker = tokio::time::interval(STATS_INTERVAL);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            tokio::select! {
                accepted = self.listener.accept() => {
                    let (stream, peer) = accepted?;
                    let server = Arc::clone(&self);
                    tokio::spawn(async move {
                        if let Err(err) = server.handle_connection(stream, peer).await {
                            eprintln!("[controle] conexão encerrada com erro: {err}");
                        }
                    });
                }
                _ = ticker.tick() => {
                    self.broadcast_stats().await;
                }
            }
        }
    }

    /// Envia `stats` para todas as sessões ativas.
    async fn broadcast_stats(&self) {
        let state = self.state.read().await;
        let message = CtrlMessage::Stats {
            loss_pct: state.stats.loss_pct,
            buffer_ms: state.stats.buffer_ms,
            seq_gaps: state.stats.seq_gaps,
            reconnects: self.reconnects.load(Ordering::Relaxed) as u32,
        };
        drop(state);
        self.broadcast(&message).await;
    }

    /// Envia uma mensagem para todas as sessões ativas.
    async fn broadcast(&self, message: &CtrlMessage) {
        let entries: Vec<SessionEntry> = self.sessions.read().await.values().cloned().collect();
        for entry in entries {
            let _ = entry.tx.send(message.clone());
        }
    }

    /// Trata uma conexão WebSocket.
    async fn handle_connection(
        &self,
        stream: tokio::net::TcpStream,
        peer: SocketAddr,
    ) -> Result<(), DynError> {
        let ws = tokio_tungstenite::accept_async(stream).await?;
        let (mut writer, mut reader) = ws.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<CtrlMessage>();

        // Tarefa exclusiva de escrita: `stats` e `welcome` não disputam o socket.
        let writer_task = tokio::spawn(async move {
            while let Some(message) = rx.recv().await {
                let payload = serde_json::to_string(&message)?;
                if writer.send(Message::Text(payload.into())).await.is_err() {
                    break;
                }
            }
            let _ = writer.close().await;
            Ok::<(), serde_json::Error>(())
        });

        let ip = peer.ip().to_string();
        let mut session_id: Option<String> = None;

        while let Some(message) = reader.next().await {
            let message = message?;
            if message.is_close() {
                break;
            }
            if message.len() > MAX_MESSAGE_LEN {
                let _ = tx.send(CtrlMessage::Error {
                    code: "message_too_large".into(),
                    message: format!("mensagem excede {MAX_MESSAGE_LEN} bytes"),
                });
                continue;
            }

            let Ok(text) = message.into_text() else {
                continue;
            };

            match serde_json::from_str::<CtrlMessage>(&text) {
                Ok(CtrlMessage::Hello {
                    token,
                    codec,
                    sample_rate,
                    channels,
                    frame_ms,
                    ..
                }) => {
                    if let Some(expected) = &self.config.pairing_token {
                        if &token != expected {
                            let _ = tx.send(CtrlMessage::Error {
                                code: "unauthorized".into(),
                                message: "código de pareamento inválido".into(),
                            });
                            break;
                        }
                    }

                    let id = self.new_session_id();
                    let negotiated = if codec == CODEC_OPUS {
                        CODEC_OPUS
                    } else {
                        CODEC_PCM16
                    };

                    self.sessions.write().await.insert(
                        id.clone(),
                        SessionEntry {
                            info: SessionInfo {
                                id: id.clone(),
                                ip: ip.clone(),
                                codec: negotiated.to_owned(),
                                connected_at: SystemTime::now(),
                            },
                            tx: tx.clone(),
                        },
                    );

                    let _ = tx.send(CtrlMessage::Welcome {
                        session_id: id.clone(),
                        audio_port: self.config.audio_port,
                        target_buffer_ms: self.config.target_buffer_ms,
                        codec: negotiated.to_owned(),
                    });

                    eprintln!(
                        "[controle] sessão {id} ({ip}) codec={negotiated} \
                         sample_rate={sample_rate} channels={channels} frame_ms={frame_ms}"
                    );
                    session_id = Some(id);
                }
                Ok(CtrlMessage::Mute { value }) => {
                    if session_id.is_some() {
                        self.state.write().await.muted = value;
                    }
                }
                Ok(CtrlMessage::Volume { value }) => {
                    if session_id.is_some() {
                        self.state.write().await.volume = value.clamp(0.0, 4.0);
                    }
                }
                Ok(CtrlMessage::Bye) => break,
                Ok(other) => {
                    let _ = tx.send(CtrlMessage::Error {
                        code: "unknown".into(),
                        message: format!("mensagem não esperada: {other:?}"),
                    });
                }
                Err(err) => {
                    let _ = tx.send(CtrlMessage::Error {
                        code: "bad_message".into(),
                        message: err.to_string(),
                    });
                }
            }
        }

        if let Some(id) = session_id {
            self.sessions.write().await.remove(&id);
            eprintln!("[controle] sessão {id} encerrada");
        }

        drop(tx);
        let _ = writer_task.await;
        Ok(())
    }

    /// Gera o próximo identificador de sessão (`c0001`, `c0002`, ...).
    fn new_session_id(&self) -> String {
        let n = self.session_seq.fetch_add(1, Ordering::Relaxed) + 1;
        format!("c{n:04x}")
    }
}
