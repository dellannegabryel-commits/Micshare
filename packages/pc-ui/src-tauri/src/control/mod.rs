//! Controle do servidor via WebSocket (mensagens JSON com serde).

use tauri::AppHandle;

type DynError = Box<dyn std::error::Error + Send + Sync>;

/// Ciclo de vida do servidor de controle WS.
pub async fn run(_app: AppHandle) -> Result<(), DynError> {
    // TODO: TcpListener::bind + accept_async (tokio-tungstenite).
    std::future::pending::<()>().await;
    Ok(())
}
