//! Tauri application entry point

use micshare_pc_ui::{
    init_state,
};
use tauri::Manager;
use tauri_plugin_store::StoreExt;
use tracing_subscriber::{EnvFilter, fmt};

pub fn run() {
    // Initialize logging
    fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("micshare=info".parse().unwrap()))
        .init();

    let (server_state, config_state) = init_state();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .manage(server_state)
        .manage(config_state)
        // PathResolver is automatically available in Tauri 3
        .setup(|app| {
            // Load saved settings
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(store) = handle.store("micshare-settings.json") {
                    let _ = store.reload();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Server control
            micshare_pc_ui::commands::start_server,
            micshare_pc_ui::commands::stop_server,
            micshare_pc_ui::commands::get_server_stats,
            micshare_pc_ui::commands::get_server_config,
            micshare_pc_ui::commands::save_server_config,
            // Audio devices
            micshare_pc_ui::commands::list_output_devices,
            // System
            micshare_pc_ui::commands::install_vbcable,
            micshare_pc_ui::commands::open_log_folder,
        ]);

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}

fn main() {
    run();
}