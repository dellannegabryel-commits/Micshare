//! Orquestra as três portas do servidor: descoberta (UDP), controle (WS) e áudio.
//!
//! O `Server` é o dono do ciclo de vida: inicia os subsistemas, mantém as
//! métricas agregadas e encerra tudo de forma limpa.

use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tokio::task::JoinHandle;

use crate::audio::{AudioConfig, AudioPipeline, JitterMetrics};
use crate::config::ServerConfig;
use crate::control::{ControlConfig, ControlServer, ControlStats, SessionInfo};
use crate::discovery::{BeaconConfig, Discovery};
use crate::state::default_host_name;

type DynError = Box<dyn std::error::Error + Send + Sync>;

/// Profundidade alvo do jitter buffer (ms).
pub const TARGET_BUFFER_MS: u16 = 30;

/// Intervalo de publicação das métricas no canal de controle.
const STATS_INTERVAL: Duration = Duration::from_secs(1);

/// Estatísticas agregadas do servidor, espelhando `ServerStats` no frontend.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStats {
    /// Se o servidor está rodando.
    pub running: bool,
    /// Sessões de controle ativas.
    pub sessions: u32,
    /// Métricas do jitter buffer.
    pub jitter: JitterMetrics,
    /// Frames de áudio processados por segundo.
    pub fps: f32,
    /// Percentual de frames perdidos.
    pub loss_pct: f32,
    /// Dispositivo de saída em uso.
    pub device_name: String,
}

/// Servidor PC: coordena descoberta, controle e áudio.
pub struct Server {
    config: ServerConfig,
    discovery: Arc<Discovery>,
    control: Arc<ControlServer>,
    audio: Option<Arc<AudioPipeline>>,
    tasks: Vec<JoinHandle<()>>,
}

impl Server {
    /// Inicia os subsistemas e sobe as tasks de background.
    pub async fn start(config: ServerConfig) -> Result<Arc<Self>, DynError> {
        // Descoberta: beacon UDP em 41234.
        let discovery = Arc::new(
            Discovery::start(BeaconConfig {
                name: config.name.clone().unwrap_or_else(default_host_name),
                audio_port: config.audio_port,
                ctrl_port: config.ctrl_port,
                pairing_code: String::new(),
            })
            .await?,
        );

        // Controle: WebSocket em 41236.
        let control = Arc::new(
            ControlServer::bind(ControlConfig {
                port: config.ctrl_port,
                audio_port: config.audio_port,
                target_buffer_ms: TARGET_BUFFER_MS,
                pairing_token: None,
            })
            .await?,
        );

        let mut tasks = Vec::new();

        let control_task = {
            let control = Arc::clone(&control);
            tokio::spawn(async move {
                if let Err(err) = control.run().await {
                    eprintln!("[controle] servidor encerrado com erro: {err}");
                }
            })
        };
        tasks.push(control_task);

        // Áudio: recebe os frames do celular (UDP 41235) e reproduz no PC.
        let audio = match AudioPipeline::start(AudioConfig {
            port: config.audio_port,
            device_substring: config.device_substring.clone(),
            target_buffer_ms: TARGET_BUFFER_MS,
        })
        .await
        {
            Ok(pipeline) => {
                eprintln!("[áudio] saída: {}", pipeline.device_name());
                Some(Arc::new(pipeline))
            }
            Err(err) => {
                // Sem dispositivo de saída o controle continua funcionando.
                eprintln!("[áudio] pipeline indisponível: {err}");
                None
            }
        };

        // Publica as métricas do jitter no canal de controle (1 Hz).
        if let Some(audio) = audio.clone() {
            let control = Arc::clone(&control);
            tasks.push(tokio::spawn(async move {
                let mut ticker = tokio::time::interval(STATS_INTERVAL);
                ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

                loop {
                    ticker.tick().await;
                    let metrics = audio.metrics();
                    control
                        .set_stats(ControlStats {
                            loss_pct: audio.loss_pct(),
                            buffer_ms: metrics.buffer_ms,
                            seq_gaps: metrics.gaps as u32,
                            reconnects: 0,
                        })
                        .await;
                }
            }));
        }

        Ok(Arc::new(Self {
            config,
            discovery,
            control,
            audio,
            tasks,
        }))
    }

    /// Configuração com que o servidor foi iniciado.
    #[must_use]
    pub fn config(&self) -> &ServerConfig {
        &self.config
    }

    /// Sessões de controle ativas.
    pub async fn sessions(&self) -> Vec<SessionInfo> {
        self.control.sessions().await
    }

    /// Estatísticas agregadas.
    pub async fn stats(&self) -> ServerStats {
        let (jitter, fps, loss_pct, device_name) = match &self.audio {
            Some(audio) => (
                audio.metrics(),
                audio.fps(),
                audio.loss_pct(),
                audio.device_name().to_owned(),
            ),
            None => (JitterMetrics::default(), 0.0, 0.0, String::new()),
        };

        ServerStats {
            running: true,
            sessions: self.control.sessions().await.len() as u32,
            jitter,
            fps,
            loss_pct,
            device_name,
        }
    }

    /// Atualiza as métricas divulgadas ao celular.
    pub async fn set_control_stats(&self, stats: ControlStats) {
        self.control.set_stats(stats).await;
    }

    /// Estado do beacon de descoberta.
    #[must_use]
    pub fn discovery(&self) -> &Discovery {
        &self.discovery
    }

    /// Pipeline de áudio, se estiver disponível.
    #[must_use]
    pub fn audio(&self) -> Option<&Arc<AudioPipeline>> {
        self.audio.as_ref()
    }

    /// Encerra todos os subsistemas.
    ///
    /// Torna-se `async` para aguardar o shutdown determinístico do pipeline de
    /// áudio (liberação do socket UDP) antes de retornar — ver `AudioPipeline::stop`.
    pub async fn stop(&self) {
        for task in &self.tasks {
            task.abort();
        }
        self.discovery.stop();
        if let Some(audio) = &self.audio {
            audio.stop().await;
        }
    }
}
