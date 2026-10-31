//! Estado compartilhado entre o backend Rust e a UI (Tauri `State`).

use std::sync::Arc;

use tokio::sync::RwLock;

use crate::config::ServerConfig;
use crate::discovery::{BeaconConfig, BeaconStatus, Discovery};

/// Estado gerenciado pela aplicação Tauri.
#[derive(Default)]
pub struct AppState {
    config: RwLock<ServerConfig>,
    discovery: RwLock<Option<Arc<Discovery>>>,
}

impl AppState {
    /// Cria o estado com a configuração padrão.
    #[must_use]
    pub fn new() -> Self {
        Self {
            config: RwLock::new(ServerConfig::default()),
            discovery: RwLock::new(None),
        }
    }

    /// Configuração atual.
    pub async fn config(&self) -> ServerConfig {
        self.config.read().await.clone()
    }

    /// Substitui a configuração atual.
    pub async fn set_config(&self, config: ServerConfig) {
        *self.config.write().await = config;
    }

    /// Inicia (ou reinicia) o beacon de descoberta.
    pub async fn start_discovery(&self) -> Result<BeaconStatus, String> {
        let config = self.config().await;

        // Derruba o emitter anterior antes de bindar o socket de novo.
        if let Some(previous) = self.discovery.write().await.take() {
            previous.stop();
        }

        let name = config.name.clone().unwrap_or_else(default_host_name);

        let discovery = Discovery::start(BeaconConfig {
            name,
            audio_port: config.audio_port,
            ctrl_port: config.ctrl_port,
            pairing_code: String::new(),
        })
        .await
        .map_err(|err| format!("falha ao iniciar discovery: {err}"))?;

        let status = discovery.status();
        *self.discovery.write().await = Some(Arc::new(discovery));
        Ok(status)
    }

    /// Encerra o beacon de descoberta.
    pub async fn stop_discovery(&self) {
        if let Some(discovery) = self.discovery.write().await.take() {
            discovery.stop();
        }
    }

    /// Estado do beacon, se estiver rodando.
    pub async fn discovery_status(&self) -> Option<BeaconStatus> {
        self.discovery.read().await.as_ref().map(|d| d.status())
    }

    /// Habilita ou desabilita o anúncio do beacon.
    pub async fn set_discovery_enabled(&self, enabled: bool) {
        if let Some(discovery) = self.discovery.read().await.as_ref() {
            discovery.set_enabled(enabled);
        }
    }
}

/// Hostname do PC, usado como nome padrão no beacon.
pub fn default_host_name() -> String {
    hostname::get()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}
