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
            commands::start_discovery,
            commands::stop_discovery,
            commands::get_discovery_status,
            commands::set_discovery_enabled,
        ])
        .setup(|app| {
            // `tauri::async_runtime` é um runtime Tokio real (o mesmo do tauri).
            // Usá-lo evita um segundo runtime concorrente — nada de gambiarra.
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(err) = server::start(app_handle).await {
                    eprintln!("[servidor] encerrado com erro: {err}");
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o Micshare");
}
