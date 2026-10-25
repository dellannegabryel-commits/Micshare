//! Main server orchestration - ties together audio, control, discovery
//! This is the core server logic that the Tauri UI will control

use crate::audio::{AudioSink, JitterBuffer, JitterMetrics};
use crate::control::{ControlConfig, ControlServer};
use crate::discovery::{BeaconConfig, BeaconSender};
use crate::protocol::AudioFrame;
use anyhow::Result;
use crossbeam::channel::{unbounded, Receiver, Sender};
use cpal::traits::{DeviceTrait, HostTrait};
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{error, info, warn};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ServerConfig {
    pub audio_port: u16,
    pub ctrl_port: u16,
    pub device_substring: Option<String>,
    pub name: Option<String>,
    pub default_codec: String, // "pcm" or "opus"
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            audio_port: 41235,
            ctrl_port: 41236,
            device_substring: None,
            name: None,
            default_codec: "opus".to_string(),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ServerStats {
    pub running: bool,
    pub sessions: usize,
    pub jitter: JitterMetrics,
    pub fps: f32,
    pub loss_pct: f32,
    pub device_name: String,
}

pub struct MicshareServer {
    config: ServerConfig,
    running: Arc<AtomicBool>,

    // Audio pipeline
    jitter_buffer: Arc<Mutex<JitterBuffer>>,
    audio_sink: Mutex<Option<AudioSink>>,
    frame_rx: Mutex<Option<Receiver<AudioFrame>>>,
    frame_tx: Mutex<Option<Sender<AudioFrame>>>,

    // Control
    control_server: Mutex<Option<ControlServer>>,

    // Discovery
    beacon: Mutex<Option<BeaconSender>>,

    // UDP socket for audio
    audio_socket: Mutex<Option<Arc<std::net::UdpSocket>>>,

    // Stats
    last_metrics: Arc<Mutex<JitterMetrics>>,
    last_recv_count: Arc<AtomicU32>,
    last_time: Arc<Mutex<Option<Instant>>>,

    // Current codec
    current_codec: Arc<Mutex<String>>,
}

impl MicshareServer {
    pub fn new(config: ServerConfig) -> Result<Self> {
        let (frame_tx, frame_rx) = unbounded();

        Ok(Self {
            config,
            running: Arc::new(AtomicBool::new(false)),
            jitter_buffer: Arc::new(Mutex::new(JitterBuffer::new())),
            audio_sink: Mutex::new(None),
            frame_rx: Mutex::new(Some(frame_rx)),
            frame_tx: Mutex::new(Some(frame_tx)),
            control_server: Mutex::new(None),
            beacon: Mutex::new(None),
            audio_socket: Mutex::new(None),
            last_metrics: Arc::new(Mutex::new(JitterMetrics::default())),
            last_recv_count: Arc::new(AtomicU32::new(0)),
            last_time: Arc::new(Mutex::new(None)),
            current_codec: Arc::new(Mutex::new("opus".to_string())),
        })
    }

    pub async fn start(&mut self) -> Result<()> {
        if self.running.swap(true, Ordering::Relaxed) {
            warn!("Server already running");
            return Ok(());
        }

        info!("Starting Micshare server...");

        // 1. Create and open audio sink
        let mut sink = AudioSink::new(self.config.device_substring.clone())?;
        let device_name = sink.device_name().to_string();
        info!("Using audio device: {}", device_name);

        // Share jitter buffer with sink
        let jitter_shared = self.jitter_buffer.clone();
        sink.start(jitter_shared)?;
        *self.audio_sink.lock() = Some(sink);

        // 2. Create UDP socket for audio
        let audio_socket = Arc::new(std::net::UdpSocket::bind(("0.0.0.0", self.config.audio_port))?);
        audio_socket.set_nonblocking(true)?;
        *self.audio_socket.lock() = Some(audio_socket.clone());

        // 3. Start control server
        let mut control = ControlServer::new(ControlConfig {
            port: self.config.ctrl_port,
            default_codec: self.config.default_codec.clone(),
        });

        // Set up callbacks
        let codec_mutex = self.current_codec.clone();

        control.set_callbacks(
            Some(Arc::new(move |session_id, codec| {
                let codec_clone = codec.clone();
                *codec_mutex.lock() = codec;
                info!("Session {} connected with codec {}", session_id, codec_clone);
            })),
            Some(Arc::new(move |muted| {
                // Mute is handled client-side (stops sending)
                // Server could also drop frames if needed
                info!("Mute state: {}", muted);
            })),
            Some(Arc::new(move |volume| {
                info!("Volume: {}", volume);
            })),
            Some(Arc::new(move |session_id| {
                info!("Session {} disconnected", session_id);
            })),
        );

        control.start().await?;
        *self.control_server.lock() = Some(control);

        // 4. Start beacon
        let hostname = self.config.name.clone().unwrap_or_else(|| {
            hostname::get()
                .ok()
                .and_then(|s| s.into_string().ok())
                .unwrap_or_else(|| "Micshare-PC".to_string())
        });

        let mut beacon = BeaconSender::new(BeaconConfig {
            name: hostname.clone(),
            audio_port: self.config.audio_port,
            ctrl_port: self.config.ctrl_port,
        });
        beacon.start()?;
        *self.beacon.lock() = Some(beacon);

        // 5. Start audio receive loop
        self.start_audio_receive_loop();

        // 6. Start stats broadcast loop
        self.start_stats_loop();

        info!("Server started successfully");
        info!("  Audio UDP: 0.0.0.0:{}", self.config.audio_port);
        info!("  Control WS: 0.0.0.0:{}", self.config.ctrl_port);
        info!("  Beacon: {}:41234", hostname);

        Ok(())
    }

    fn start_audio_receive_loop(&self) {
        let socket = self.audio_socket.lock().as_ref().unwrap().clone();
        let jitter = self.jitter_buffer.clone();
        let running = self.running.clone();
        let current_codec = self.current_codec.clone();

        std::thread::spawn(move || {
            let mut buf = [0u8; 2048];
            while running.load(Ordering::Relaxed) {
                match socket.recv_from(&mut buf) {
                    Ok((len, _src)) => {
                        if let Ok(frame) = AudioFrame::decode(&buf[..len]) {
                            let codec = current_codec.lock().clone();
                            // TODO: Handle Opus decoding if needed
                            if codec == "opus" {
                                // Decode opus here
                            }
                            if let Err(e) = jitter.lock().push(frame) {
                                error!("Jitter buffer push error: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        if e.kind() == std::io::ErrorKind::WouldBlock {
                            std::thread::sleep(Duration::from_millis(1));
                            continue;
                        }
                        if running.load(Ordering::Relaxed) {
                            error!("Audio socket error: {}", e);
                        }
                    }
                }
            }
        });
    }

    fn start_stats_loop(&self) {
        let control = self.control_server.lock().as_ref().unwrap().clone();
        let jitter = self.jitter_buffer.clone();
        let running = self.running.clone();
        let last_metrics = self.last_metrics.clone();
        let last_recv = self.last_recv_count.clone();
        let last_time = self.last_time.clone();

        std::thread::spawn(move || {
            while running.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_secs(1));

                let metrics = jitter.lock().metrics();
                let mut last = last_metrics.lock();

                // Calculate FPS
                let _fps = if let Some(last_t) = *last_time.lock() {
                    let now = Instant::now();
                    let dt = now.duration_since(last_t).as_secs_f32();
                    let recv = metrics.received;
                    let last_recv_val = last_recv.swap(recv as u32, Ordering::Relaxed);
                    *last_time.lock() = Some(now);
                    if dt > 0.0 {
                        (recv - last_recv_val as u64) as f32 / dt
                    } else { 0.0 }
                } else {
                    *last_time.lock() = Some(Instant::now());
                    last_recv.store(metrics.received as u32, Ordering::Relaxed);
                    0.0
                };

                // Calculate loss %
                let loss_pct = if metrics.received > 0 {
                    (metrics.lost as f32 / metrics.received as f32) * 100.0
                } else { 0.0 };

                *last = metrics;

                control.broadcast_stats(loss_pct, metrics.buffer_ms, metrics.gaps as u32);
            }
        });
    }

    pub fn stop(&self) {
        if !self.running.swap(false, Ordering::Relaxed) {
            return;
        }

        info!("Stopping server...");

        if let Some(control) = self.control_server.lock().take() {
            control.stop();
        }

        if let Some(mut beacon) = self.beacon.lock().take() {
            beacon.stop();
        }

        if let Some(mut sink) = self.audio_sink.lock().take() {
            sink.stop();
        }

        *self.audio_socket.lock() = None;
        info!("Server stopped");
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }

    pub fn stats(&self) -> ServerStats {
        let metrics = self.jitter_buffer.lock().metrics();
        let control = self.control_server.lock();
        let sessions = control.as_ref().map(|c| c.session_count()).unwrap_or(0);
        let device_name = self.audio_sink.lock().as_ref().map(|s| s.device_name().to_string()).unwrap_or_default();

        let fps = {
            let _last = self.last_metrics.lock();
            let now = Instant::now();
            if let Some(last_t) = *self.last_time.lock() {
                let dt = now.duration_since(last_t).as_secs_f32();
                let recv = metrics.received;
                let last_recv = self.last_recv_count.load(Ordering::Relaxed);
                if dt > 0.0 {
                    (recv - last_recv as u64) as f32 / dt
                } else { 0.0 }
            } else { 0.0 }
        };

        let loss_pct = if metrics.received > 0 {
            (metrics.lost as f32 / metrics.received as f32) * 100.0
        } else { 0.0 };

        ServerStats {
            running: self.is_running(),
            sessions,
            jitter: metrics,
            fps,
            loss_pct,
            device_name,
        }
    }

    pub fn set_mute(&self, muted: bool) {
        if let Some(control) = &*self.control_server.lock() {
            control.set_mute(muted);
        }
    }

    pub fn set_volume(&self, volume: f32) {
        if let Some(control) = &*self.control_server.lock() {
            control.set_volume(volume);
        }
    }

    pub fn get_mute(&self) -> bool {
        self.control_server.lock().as_ref().map(|c| c.get_mute()).unwrap_or(false)
    }

    pub fn get_volume(&self) -> f32 {
        self.control_server.lock().as_ref().map(|c| c.get_volume()).unwrap_or(1.0)
    }

    pub async fn list_output_devices() -> Result<Vec<String>> {
        let host = cpal::default_host();
        let devices = host.devices()?;
        let mut names = Vec::new();
        for device in devices {
            if let Ok(mut configs) = device.supported_output_configs() {
                if configs.any(|c| c.channels() >= 1) {
                    names.push(device.to_string());
                }
            }
        }
        Ok(names)
    }
}

impl Drop for MicshareServer {
    fn drop(&mut self) {
        self.stop();
    }
}