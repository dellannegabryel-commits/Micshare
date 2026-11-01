pub mod audio;
pub mod commands;
pub mod config;
pub mod control;
pub mod discovery;
pub mod error;
pub mod protocol;
pub mod server;
pub mod state;

use state::AppState;
use tauri::Emitter;

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
            commands::get_server_status,
            commands::get_discovery_status,
            commands::set_discovery_enabled,
            commands::set_mute,
            commands::set_volume,
            commands::list_output_devices,
            commands::start_discovery,
            commands::stop_discovery,
            commands::install_vbcable,
            commands::open_log_folder,
        ])
        .setup(|app| {
            // Auto-start: inicia o servidor no launch e emite `server-status`.
            // Falhas ficam registradas em `AppState::last_error` para a UI exibir.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri::Manager;
                let state = handle.state::<AppState>();
                if let Err(err) = state.start_server(None).await {
                    state.set_last_error(err.clone()).await;
                    let _ = handle.emit(
                        commands::EVENT_STATUS,
                        commands::StatusEvent {
                            running: false,
                            error: Some(err),
                        },
                    );
                } else {
                    // Reutiliza o emitter de stats a 1 Hz.
                    commands::spawn_stats_emitter(handle.clone());
                    let _ = handle.emit(
                        commands::EVENT_STATUS,
                        commands::StatusEvent {
                            running: true,
                            error: None,
                        },
                    );
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o Micshare");
}
