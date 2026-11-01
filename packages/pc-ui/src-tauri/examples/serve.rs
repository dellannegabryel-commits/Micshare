//! Diagnóstico: sobe o servidor PC (descoberta + controle + áudio) sem a UI.
//!
//! Uso: `cargo run --example serve`

use std::sync::Arc;
use std::time::Duration;

use micshare_pc_ui_lib::config::ServerConfig;
use micshare_pc_ui_lib::server::Server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let config = ServerConfig::default();
    let server = Arc::new(Server::start(config, None).await?);

    println!("servidor PC no ar (beacon 41234, áudio 41235, controle 41236)");

    loop {
        tokio::time::sleep(Duration::from_secs(2)).await;

        let stats = server.stats().await;
        let sessions = server.sessions().await;

        println!(
            "sessões={} fps={:.1} perda={:.2}% buffer={}ms gaps={}",
            sessions.len(),
            stats.fps,
            stats.loss_pct,
            stats.jitter.buffer_ms,
            stats.jitter.gaps,
        );
    }
}
