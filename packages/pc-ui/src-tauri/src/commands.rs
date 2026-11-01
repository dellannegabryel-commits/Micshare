//! Comandos Tauri expostos à UI (React).

use std::process::Command;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;

use crate::audio::sink::output_devices;
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

/// Lista dispositivos de saída de áudio disponíveis.
#[tauri::command]
pub async fn list_output_devices() -> Result<Vec<String>, String> {
    let devices = output_devices().map_err(|e| format!("falha ao listar dispositivos: {e}"))?;
    Ok(devices.into_iter().map(|d| d.name).collect())
}

/// Inicia o beacon de descoberta (se não estiver rodando).
#[tauri::command]
pub async fn start_discovery(state: State<'_, AppState>) -> Result<BeaconStatus, String> {
    // O servidor já inicia a descoberta ao startar; este comando serve para
    // reiniciar se foi parado explicitamente.
    let status = state
        .discovery_status()
        .await
        .ok_or("servidor não está rodando")?;
    // Se já está rodando, apenas retorna status.
    if status.enabled {
        return Ok(status);
    }
    state.set_discovery_enabled(true).await;
    // Pequena espera para o status atualizar.
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    state
        .discovery_status()
        .await
        .ok_or("falha ao obter status após iniciar".into())
}

/// Para o beacon de descoberta.
#[tauri::command]
pub async fn stop_discovery(state: State<'_, AppState>) -> Result<(), String> {
    state.set_discovery_enabled(false).await;
    Ok(())
}

/// Abre a página de download do VB-Cable no navegador.
#[tauri::command]
pub async fn install_vbcable(app: AppHandle) -> Result<(), String> {
    const URL: &str = "https://vb-audio.com/Cable/";
    let _ = app
        .shell()
        .open(URL, None)
        .map_err(|e| format!("falha ao abrir URL: {e}"));
    Ok(())
}

/// Abre a pasta de logs do sistema.
#[tauri::command]
pub async fn open_log_folder(app: AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("falha ao obter pasta de logs: {e}"))?;
    let _ = Command::new("explorer")
        .arg(log_dir)
        .spawn()
        .map_err(|e| format!("falha ao abrir explorer: {e}"));
    Ok(())
}

/// Inicia o listener de eventos de estatísticas do servidor.
/// A UI deve chamar isto uma vez ao montar para receber eventos `server-stats`.
#[tauri::command]
pub async fn start_stats_listener(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut rx = state
        .subscribe_stats()
        .await
        .ok_or("canal de estatísticas não disponível (servidor não iniciado?)")?;

    tauri::async_runtime::spawn(async move {
        while let Ok(stats) = rx.recv().await {
            if app.emit("server-stats", &stats).is_err() {
                break; // App fechado ou erro
            }
        }
    });

    Ok(())
}
