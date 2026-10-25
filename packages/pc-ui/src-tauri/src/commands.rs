//! Tauri command handlers

use crate::server::{MicshareServer, ServerConfig, ServerStats};
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State, path::BaseDirectory};

// Global server state
pub type ServerState = Arc<Mutex<Option<MicshareServer>>>;
pub type ConfigState = Arc<Mutex<ServerConfig>>;

/// Initialize global state
pub fn init_state() -> (ServerState, ConfigState) {
    let config = ServerConfig::default();
    (Arc::new(Mutex::new(None)), Arc::new(Mutex::new(config)))
}

/// Start the server (global state)
#[tauri::command]
pub async fn start_server(config: ServerConfig, state: State<'_, ServerState>) -> Result<(), String> {
    let mut server = MicshareServer::new(config.clone()).map_err(|e| e.to_string())?;
    server.start().await.map_err(|e| e.to_string())?;

    let mut guard = state.lock();
    *guard = Some(server);

    Ok(())
}

/// Stop the server (global state)
#[tauri::command]
pub async fn stop_server(state: State<'_, ServerState>) -> Result<(), String> {
    let mut guard = state.lock();
    if let Some(server) = guard.take() {
        server.stop();
    }
    Ok(())
}

/// Get server stats (global state)
#[tauri::command]
pub async fn get_server_stats(state: State<'_, ServerState>) -> Result<ServerStats, String> {
    let guard = state.lock();
    if let Some(server) = guard.as_ref() {
        Ok(server.stats())
    } else {
        Ok(ServerStats {
            running: false,
            sessions: 0,
            jitter: Default::default(),
            fps: 0.0,
            loss_pct: 0.0,
            device_name: String::new(),
        })
    }
}

/// Get server config (global state)
#[tauri::command]
pub async fn get_server_config(config_state: State<'_, ConfigState>) -> Result<ServerConfig, String> {
    Ok(config_state.lock().clone())
}

/// Save server config (global state)
#[tauri::command]
pub async fn save_server_config(config: ServerConfig, config_state: State<'_, ConfigState>) -> Result<(), String> {
    *config_state.lock() = config;
    Ok(())
}

/// List output devices
#[tauri::command]
pub async fn list_output_devices() -> Result<Vec<String>, String> {
    MicshareServer::list_output_devices().await.map_err(|e| e.to_string())
}

/// Install VB-Cable
#[tauri::command]
pub async fn install_vbcable(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let script_path = app.path().resolve("../packages/pc/install-vbcable.ps1", BaseDirectory::Resource)
            .map_err(|e| e.to_string())?;

        let status = Command::new("powershell")
            .args([
                "-ExecutionPolicy", "Bypass",
                "-File", script_path.to_str().ok_or("Invalid path")?
            ])
            .status()
            .map_err(|e| e.to_string())?;

        if !status.success() {
            return Err("VB-Cable installation failed".to_string());
        }
    }
    Ok(())
}

/// Open log folder
#[tauri::command]
pub async fn open_log_folder(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let pc_dir = app.path().resolve("../packages/pc", BaseDirectory::Resource)
            .map_err(|e| e.to_string())?;

        Command::new("explorer")
            .arg(pc_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}