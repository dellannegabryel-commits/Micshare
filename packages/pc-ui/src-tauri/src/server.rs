//! Orquestra as três portas do servidor: descoberta (UDP), controle (WS) e áudio.

use tauri::{AppHandle, Manager};

use crate::{audio, control, state::AppState};

type DynError = Box<dyn std::error::Error + Send + Sync>;

/// Inicia os subsistemas do servidor e aguarda todos.
pub async fn start(app: AppHandle) -> Result<(), DynError> {
    // Descoberta: beacon UDP em 41234, controlado pelo estado compartilhado.
    let discovery = {
        let state = app.state::<AppState>();
        state
            .start_discovery()
            .await
            .map_err(|err| -> DynError { err.into() })?
    };
    eprintln!(
        "[servidor] discovery ativo ({} beacons enviados)",
        discovery.sent
    );

    let control = control::run(app.clone());
    let audio = audio::run(app);

    // `join!` aguarda os três; qualquer erro é propagado via `?` abaixo.
    let (res_control, res_audio) = tokio::join!(control, audio);

    res_control?;
    res_audio
}
