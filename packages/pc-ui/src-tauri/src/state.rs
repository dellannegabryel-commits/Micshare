//! Estado compartilhado entre o backend Rust e a UI (Tauri `State`).

use std::sync::Arc;

use tokio::sync::RwLock;

use crate::config::ServerConfig;
use crate::control::SessionInfo;
use crate::discovery::BeaconStatus;
use crate::error::CommandError;
use crate::server::{Server, ServerStats};

/// Estado gerenciado pela aplicação Tauri.
#[derive(Default)]
pub struct AppState {
    config: RwLock<ServerConfig>,
    server: RwLock<Option<Arc<Server>>>,
    /// Último erro de inicialização, para a UI exibir com código.
    last_error: RwLock<Option<CommandError>>,
}

impl AppState {
    /// Cria o estado com a configuração padrão.
    #[must_use]
    pub fn new() -> Self {
        Self {
            config: RwLock::new(ServerConfig::default()),
            server: RwLock::new(None),
            last_error: RwLock::new(None),
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
    ///
    /// Retorna `Err(CommandError)` com código estável em caso de falha.
    pub async fn start_server(&self, config: Option<ServerConfig>) -> Result<(), CommandError> {
        // Aplica a configuração fornecida (se houver) antes de iniciar.
        if let Some(config) = config {
            self.set_config(config).await;
        }

        // Derruba o servidor anterior antes de bindar as portas de novo.
        // Solta o write-lock antes do await para não bloquear leituras.
        let previous = self.server.write().await.take();
        if let Some(previous) = previous {
            previous.stop().await;
        }

        let config = self.config().await;
        let audio_port = config.audio_port;
        let ctrl_port = config.ctrl_port;

        let server = Server::start(config)
            .await
            .map_err(|err| classify_start_error(err, audio_port, ctrl_port))?;

        *self.server.write().await = Some(server);
        *self.last_error.write().await = None;
        Ok(())
    }

    /// Encerra o servidor e limpa o último erro.
    pub async fn stop_server(&self) {
        let server = self.server.write().await.take();
        if let Some(server) = server {
            server.stop().await;
        }
        *self.last_error.write().await = None;
    }

    /// Registra o último erro de inicialização (para auto-start na UI).
    pub async fn set_last_error(&self, error: CommandError) {
        *self.last_error.write().await = Some(error);
    }

    /// Último erro registrado, se houver.
    pub async fn last_error(&self) -> Option<CommandError> {
        self.last_error.read().await.clone()
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
}

/// Classifica um erro de `Server::start` em um `CommandError` com código.
///
/// O `Server::start` retorna um `Box<dyn Error>`; inspecionamos a causa raiz
/// para mapear `AddrInUse` → `portInUse`, preservando o código estável.
fn classify_start_error(
    err: Box<dyn std::error::Error + Send + Sync>,
    audio_port: u16,
    ctrl_port: u16,
) -> CommandError {
    // Percorre a cadeia de causas procurando um `io::Error` de bind.
    let mut source = Some(err.as_ref() as &(dyn std::error::Error + 'static));
    while let Some(current) = source {
        if let Some(io) = current.downcast_ref::<std::io::Error>() {
            use std::io::ErrorKind;
            match io.kind() {
                ErrorKind::AddrInUse => {
                    // Descobre qual porta colidiu inspecionando a mensagem.
                    let text = io.to_string();
                    let port = if text.contains(&ctrl_port.to_string()) {
                        ctrl_port
                    } else {
                        audio_port
                    };
                    return CommandError::port_in_use(port);
                }
                ErrorKind::PermissionDenied => return CommandError::permission_denied(io),
                _ => {}
            }
        }
        source = current.source();
    }

    CommandError::internal(err)
}

/// Hostname do PC, usado como nome padrão no beacon.
#[must_use]
pub fn default_host_name() -> String {
    hostname::get()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    #[test]
    fn classify_addr_in_use_vira_port_in_use() {
        let io_err = io::Error::from(io::ErrorKind::AddrInUse);
        let boxed: Box<dyn std::error::Error + Send + Sync> = Box::new(io_err);
        let err = classify_start_error(boxed, 41235, 41236);
        assert_eq!(err.code, "portInUse");
    }

    #[test]
    fn classify_generico_vira_internal() {
        let boxed: Box<dyn std::error::Error + Send + Sync> = "boom".into();
        let err = classify_start_error(boxed, 41235, 41236);
        assert_eq!(err.code, "internal");
    }
}
