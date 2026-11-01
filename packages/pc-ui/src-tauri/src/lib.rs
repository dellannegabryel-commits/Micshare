pub mod audio;
pub mod commands;
pub mod config;
pub mod control;
pub mod discovery;
pub mod protocol;
pub mod server;
pub mod state;

use state::AppState;

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::get_server_config,
            commands::save_server_config,
            commands::start_server,
            commands::stop_server,
            commands::get_server_stats,
            commands::get_sessions,
            commands::get_discovery_status,
            commands::set_discovery_enabled,
            commands::list_output_devices,
            commands::start_discovery,
            commands::stop_discovery,
            commands::install_vbcable,
            commands::open_log_folder,
            commands::start_stats_listener,
        ])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o Micshare");
}
