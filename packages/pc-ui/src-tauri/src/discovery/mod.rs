//! Descoberta na rede local via beacon UDP (JSON com serde).
//!
//! Porta padrão do beacon: definida em `protocol`.

use tauri::AppHandle;

type DynError = Box<dyn std::error::Error + Send + Sync>;

/// Ciclo de vida do beacon UDP (descoberta por celulares).
pub async fn run(_app: AppHandle) -> Result<(), DynError> {
    // TODO: UdpSocket::bind em protocol::DISCOVERY_ADDR e responder a probes.
    std::future::pending::<()>().await;
    Ok(())
}
