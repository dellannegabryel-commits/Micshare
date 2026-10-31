mod audio;
mod control;
mod discovery;
mod protocol;
mod server;

pub fn run() {
    tauri::Builder::default()
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
