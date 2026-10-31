//! Captura e envio de áudio (driver de áudio virtual via cpal).
//!
//! O payload viaja por UDP com cabeçalho binário Big-Endian de 16 bytes
//! (`protocol` define o layout).

use tauri::AppHandle;

type DynError = Box<dyn std::error::Error + Send + Sync>;

/// Ciclo de vida do servidor de áudio.
pub async fn run(_app: AppHandle) -> Result<(), DynError> {
    // TODO: stream cpal (input) -> canal -> UDP com cabeçalho BE de 16 bytes.
    std::future::pending::<()>().await;
    Ok(())
}
