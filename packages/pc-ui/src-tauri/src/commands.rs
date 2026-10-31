//! Comandos Tauri expostos à UI (React).

use tauri::State;

use crate::config::ServerConfig;
use crate::discovery::beacon::BeaconStatus;
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

/// Inicia o beacon de descoberta.
#[tauri::command]
pub async fn start_discovery(state: State<'_, AppState>) -> Result<BeaconStatus, String> {
    state.start_discovery().await
}

/// Encerra o beacon de descoberta.
#[tauri::command]
pub async fn stop_discovery(state: State<'_, AppState>) -> Result<(), String> {
    state.stop_discovery().await;
    Ok(())
}

/// Retorna o estado do beacon de descoberta.
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
