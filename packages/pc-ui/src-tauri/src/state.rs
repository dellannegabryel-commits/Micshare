//! Estado compartilhado entre o backend Rust e a UI (Tauri `State`).

use std::sync::Arc;

use tokio::sync::{RwLock, broadcast};

use crate::config::ServerConfig;
use crate::control::SessionInfo;
use crate::discovery::BeaconStatus;
use crate::server::{Server, ServerStats};

/// Estado gerenciado pela aplicação Tauri.
#[derive(Default)]
pub struct AppState {
    config: RwLock<ServerConfig>,
    server: RwLock<Option<Arc<Server>>>,
    /// Canal para emitir estatísticas do servidor como eventos Tauri.
    stats_tx: RwLock<Option<broadcast::Sender<ServerStats>>>,
}

impl AppState {
    /// Cria o estado com a configuração padrão.
    #[must_use]
    pub fn new() -> Self {
        Self {
            config: RwLock::new(ServerConfig::default()),
            server: RwLock::new(None),
            stats_tx: RwLock::new(None),
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

    /// Inicia o servidor (descoberta + controle + áudio).
    pub async fn start_server(&self) -> Result<(), String> {
        // Derruba o servidor anterior antes de bindar as portas de novo.
        if let Some(previous) = self.server.write().await.take() {
            previous.stop();
        }

        let config = self.config().await;
        let (stats_tx, _) = broadcast::channel(16);
        let server = Server::start(config, Some(stats_tx.clone()))
            .await
            .map_err(|err| format!("falha ao iniciar o servidor: {err}"))?;

        *self.server.write().await = Some(server);
        *self.stats_tx.write().await = Some(stats_tx);
        Ok(())
    }

    /// Encerra o servidor.
    pub async fn stop_server(&self) {
        if let Some(server) = self.server.write().await.take() {
            server.stop();
        }
        *self.stats_tx.write().await = None;
    }

    /// `true` se o servidor está rodando.
    pub async fn is_running(&self) -> bool {
        self.server.read().await.is_some()
    }

    /// Estatísticas agregadas do servidor.
    pub async fn stats(&self) -> ServerStats {
        match self.server.read().await.as_ref() {
            Some(server) => server.stats().await,
            None => ServerStats::default(),
        }
    }

    /// Sessões de controle ativas.
    pub async fn sessions(&self) -> Vec<SessionInfo> {
        match self.server.read().await.as_ref() {
            Some(server) => server.sessions().await,
            None => Vec::new(),
        }
    }

    /// Estado do beacon de descoberta, se estiver rodando.
    pub async fn discovery_status(&self) -> Option<BeaconStatus> {
        self.server
            .read()
            .await
            .as_ref()
            .map(|server| server.discovery().status())
    }

    /// Habilita ou desabilita o anúncio do beacon.
    pub async fn set_discovery_enabled(&self, enabled: bool) {
        if let Some(server) = self.server.read().await.as_ref() {
            server.discovery().set_enabled(enabled);
        }
    }

    /// Retorna um receiver para o canal de estatísticas (para emitir eventos Tauri).
    pub async fn subscribe_stats(&self) -> Option<broadcast::Receiver<ServerStats>> {
        self.stats_tx.read().await.as_ref().map(|tx| tx.subscribe())
    }
}

/// Hostname do PC, usado como nome padrão no beacon.
#[must_use]
pub fn default_host_name() -> String {
    hostname::get()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}
