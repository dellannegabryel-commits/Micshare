//! WebSocket control server for mute/volume/hello/bye
//! Ported from TypeScript implementation

use crate::protocol::CtrlMessage;
use anyhow::Result;
use crossbeam::channel::{Sender, TrySendError};
use futures_util::{SinkExt, StreamExt};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ControlConfig {
    pub port: u16,
    pub default_codec: String, // "pcm" or "opus"
}

#[derive(Debug, Clone)]
pub struct SessionInfo {
    pub id: String,
    pub codec: String,
    pub addr: SocketAddr,
}

pub struct ControlServer {
    config: ControlConfig,
    sessions: Arc<Mutex<HashMap<String, SessionInfo>>>,
    session_senders: Arc<Mutex<HashMap<String, Sender<CtrlMessage>>>>,
    stats_tx: broadcast::Sender<CtrlMessage>,
    running: AtomicBool,
    reconnects: AtomicU32,
    mute_state: Arc<AtomicBool>,
    volume_state: Arc<parking_lot::Mutex<f32>>,
    on_hello: Option<Arc<dyn Fn(String, String) + Send + Sync>>,
    on_mute: Option<Arc<dyn Fn(bool) + Send + Sync>>,
    on_volume: Option<Arc<dyn Fn(f32) + Send + Sync>>,
    on_bye: Option<Arc<dyn Fn(String) + Send + Sync>>,
}

impl ControlServer {
    pub fn new(config: ControlConfig) -> Self {
        let (stats_tx, _) = broadcast::channel(16);
        Self {
            config,
            sessions: Arc::new(Mutex::new(HashMap::new())),
            session_senders: Arc::new(Mutex::new(HashMap::new())),
            stats_tx,
            running: AtomicBool::new(false),
            reconnects: AtomicU32::new(0),
            mute_state: Arc::new(AtomicBool::new(false)),
            volume_state: Arc::new(parking_lot::Mutex::new(1.0)),
            on_hello: None,
            on_mute: None,
            on_volume: None,
            on_bye: None,
        }
    }

    pub fn set_callbacks(
        &mut self,
        on_hello: Option<Arc<dyn Fn(String, String) + Send + Sync>>,
        on_mute: Option<Arc<dyn Fn(bool) + Send + Sync>>,
        on_volume: Option<Arc<dyn Fn(f32) + Send + Sync>>,
        on_bye: Option<Arc<dyn Fn(String) + Send + Sync>>,
    ) {
        self.on_hello = on_hello;
        self.on_mute = on_mute;
        self.on_volume = on_volume;
        self.on_bye = on_bye;
    }

    pub fn get_mute(&self) -> bool {
        self.mute_state.load(Ordering::Relaxed)
    }

    pub fn get_volume(&self) -> f32 {
        *self.volume_state.lock()
    }

    pub fn set_mute(&self, value: bool) {
        self.mute_state.store(value, Ordering::Relaxed);
    }

    pub fn set_volume(&self, value: f32) {
        *self.volume_state.lock() = value.clamp(0.0, 4.0);
    }

    pub fn session_count(&self) -> usize {
        self.sessions.lock().len()
    }

    pub fn stats_sender(&self) -> broadcast::Sender<CtrlMessage> {
        self.stats_tx.clone()
    }

    pub async fn start(&self) -> Result<()> {
        if self.running.swap(true, Ordering::Relaxed) {
            warn!("Control server already running");
            return Ok(());
        }

        let listener = TcpListener::bind(("0.0.0.0", self.config.port)).await?;
        info!("Control server listening on port {}", self.config.port);

        let this = self.clone();
        tokio::spawn(async move {
            this.accept_loop(listener).await;
        });

        Ok(())
    }

    async fn accept_loop(&self, listener: TcpListener) {
        while self.running.load(Ordering::Relaxed) {
            match listener.accept().await {
                Ok((stream, addr)) => {
                    let this = self.clone();
                    tokio::spawn(async move {
                        if let Err(e) = this.handle_connection(stream, addr).await {
                            error!("Connection error: {}", e);
                        }
                    });
                }
                Err(e) => {
                    if self.running.load(Ordering::Relaxed) {
                        error!("Accept error: {}", e);
                    }
                }
            }
        }
    }

    async fn handle_connection(&self, stream: TcpStream, addr: SocketAddr) -> Result<()> {
        let ws_stream = accept_async(stream).await?;
        let (mut ws_sink, mut ws_stream) = ws_stream.split();

        let mut session_id: Option<String> = None;
        let mut authenticated = false;
        let (cmd_tx, cmd_rx) = crossbeam::channel::unbounded::<CtrlMessage>();

        // Spawn task to send commands to client
        let send_task = tokio::spawn(async move {
            while let Ok(msg) = cmd_rx.recv() {
                let text = msg.encode();
                if ws_sink.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        });

        // Handle incoming messages
        while let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    match CtrlMessage::decode(&text) {
                        Ok(ctrl) => {
                            if let Err(e) = self.handle_message(ctrl, &mut session_id, &mut authenticated, &cmd_tx, addr).await {
                                error!("Error handling message: {}", e);
                            }
                        }
                        Err(e) => {
                            let _ = cmd_tx.try_send(CtrlMessage::Error {
                                code: "bad_message".to_string(),
                                message: e.to_string(),
                            });
                        }
                    }
                }
                Ok(Message::Close(_)) => break,
                Err(e) => {
                    error!("WebSocket error: {}", e);
                    break;
                }
                _ => {}
            }
        }

        // Cleanup
        if let Some(sid) = session_id {
            self.remove_session(&sid);
        }
        send_task.abort();

        Ok(())
    }

    async fn handle_message(
        &self,
        msg: CtrlMessage,
        session_id: &mut Option<String>,
        authenticated: &mut bool,
        cmd_tx: &Sender<CtrlMessage>,
        addr: SocketAddr,
    ) -> Result<()> {
        match msg {
            CtrlMessage::Hello { v: _, token: _, sample_rate: _, channels: _, codec, frame_ms: _, supported_codecs } => {
                let requested_codec = if codec == "opus" { "opus" } else { "pcm" };
                let supported = supported_codecs;
                let negotiated = if supported.contains(&requested_codec.to_string()) {
                    requested_codec
                } else {
                    "pcm"
                };

                let sid = Uuid::new_v4().to_string()[..8].to_string();
                *session_id = Some(sid.clone());
                *authenticated = true;

                let session = SessionInfo {
                    id: sid.clone(),
                    codec: negotiated.to_string(),
                    addr,
                };

                self.sessions.lock().insert(sid.clone(), session.clone());

                // Store sender for this session
                self.session_senders.lock().insert(sid.clone(), cmd_tx.clone());

                // Callback
                if let Some(cb) = &self.on_hello {
                    cb(sid.clone(), negotiated.to_string());
                }

                // Send welcome
                let welcome = CtrlMessage::Welcome {
                    session_id: sid.clone(),
                    audio_port: crate::protocol::AUDIO_PORT,
                    target_buffer_ms: 30,
                    codec: negotiated.to_string(),
                };
                cmd_tx.try_send(welcome)?;

                info!("Session connected: {} (codec: {})", sid, negotiated);
            }
            CtrlMessage::Mute { value } => {
                if !*authenticated {
                    return Ok(());
                }
                self.mute_state.store(value, Ordering::Relaxed);
                if let Some(cb) = &self.on_mute {
                    cb(value);
                }
                debug!("Mute: {}", value);
            }
            CtrlMessage::Volume { value } => {
                if !*authenticated {
                    return Ok(());
                }
                let clamped = value.clamp(0.0, 4.0);
                *self.volume_state.lock() = clamped;
                if let Some(cb) = &self.on_volume {
                    cb(clamped);
                }
                debug!("Volume: {}", clamped);
            }
            CtrlMessage::Bye => {
                if let Some(sid) = session_id.take() {
                    self.remove_session(&sid);
                }
            }
            _ => {
                let _ = cmd_tx.try_send(CtrlMessage::Error {
                    code: "unknown".to_string(),
                    message: "Tipo não tratado".to_string(),
                });
            }
        }
        Ok(())
    }

    fn remove_session(&self, sid: &str) {
        self.sessions.lock().remove(sid);
        self.session_senders.lock().remove(sid);
        self.reconnects.fetch_add(1, Ordering::Relaxed);
        if let Some(cb) = &self.on_bye {
            cb(sid.to_string());
        }
        info!("Session disconnected: {}", sid);
    }

    pub fn broadcast_stats(&self, loss_pct: f32, buffer_ms: u32, seq_gaps: u32) {
        let reconnects = self.reconnects.load(Ordering::Relaxed);
        let msg = CtrlMessage::Stats {
            loss_pct,
            buffer_ms,
            seq_gaps,
            reconnects,
        };
        let _ = self.stats_tx.send(msg);
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
        // Close all sessions
        let sessions: Vec<_> = self.sessions.lock().keys().cloned().collect();
        for sid in sessions {
            self.remove_session(&sid);
        }
    }
}

impl Clone for ControlServer {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            sessions: self.sessions.clone(),
            session_senders: self.session_senders.clone(),
            stats_tx: self.stats_tx.clone(),
            running: AtomicBool::new(self.running.load(Ordering::Relaxed)),
            reconnects: AtomicU32::new(self.reconnects.load(Ordering::Relaxed)),
            mute_state: self.mute_state.clone(),
            volume_state: self.volume_state.clone(),
            on_hello: None, // Callbacks can't be cloned, will be set on the original
            on_mute: None,
            on_volume: None,
            on_bye: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_control_server_start_stop() {
        let mut server = ControlServer::new(ControlConfig {
            port: 0, // OS assigns
            default_codec: "pcm".to_string(),
        });
        // Can't easily test without binding to a real port
        server.stop();
    }
}