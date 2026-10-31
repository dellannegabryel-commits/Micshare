//! Orquestra as três portas do servidor: descoberta (UDP), controle (WS) e áudio.

use tauri::AppHandle;

use crate::{audio, control, discovery};

type DynError = Box<dyn std::error::Error + Send + Sync>;

/// Inicia os subsistemas do servidor e aguarda todos.
pub async fn start(app: AppHandle) -> Result<(), DynError> {
    let discovery = discovery::run(app.clone());
    let control = control::run(app.clone());
    let audio = audio::run(app);

    // `join!` aguarda os três; qualquer erro é propagado via `?` abaixo.
    let (res_discovery, res_control, res_audio) = tokio::join!(discovery, control, audio);

    res_discovery?;
    res_control?;
    res_audio
}
