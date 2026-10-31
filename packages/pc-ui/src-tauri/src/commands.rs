//! Comandos Tauri expostos à UI (React).

use tauri::State;

use crate::config::ServerConfig;
use crate::control::SessionInfo;
use crate::discovery::beacon::BeaconStatus;
use crate::server::ServerStats;
use crate::state::AppState;

/// Retorna a configuração atual do servidor.
#[tauri::command]
pub async fn get_server_config(state: State<'_, AppState>) -> Result<ServerConfig, String> {
    Ok(state.config().await)
}

/// Salva a configuração do servidor.
#[tauri::command]
pub async fn save_server_config(
    state: State<'_, AppState>,
    config: ServerConfig,
) -> Result<(), String> {
    state.set_config(config).await;
    Ok(())
}

/// Inicia o servidor (descoberta + controle + áudio).
#[tauri::command]
pub async fn start_server(state: State<'_, AppState>) -> Result<(), String> {
    state.start_server().await
}

/// Encerra o servidor.
#[tauri::command]
pub async fn stop_server(state: State<'_, AppState>) -> Result<(), String> {
    state.stop_server().await;
    Ok(())
}

/// Estatísticas agregadas do servidor.
#[tauri::command]
pub async fn get_server_stats(state: State<'_, AppState>) -> Result<ServerStats, String> {
    Ok(state.stats().await)
}

/// Sessões de controle ativas.
#[tauri::command]
pub async fn get_sessions(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, String> {
    Ok(state.sessions().await)
}

/// Estado do beacon de descoberta.
#[tauri::command]
pub async fn get_discovery_status(
    state: State<'_, AppState>,
) -> Result<Option<BeaconStatus>, String> {
    Ok(state.discovery_status().await)
}

/// Habilita ou desabilita o anúncio do beacon.
#[tauri::command]
pub async fn set_discovery_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    state.set_discovery_enabled(enabled).await;
    Ok(())
}
