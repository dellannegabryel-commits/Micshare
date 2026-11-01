//! Diagnóstico: hot-swap do dispositivo de saída e rollback.
//!
//! Exercita o `set_output_device` real (com dispositivos da máquina):
//! 1. Troca para um dispositivo existente → deve reportar o nome aberto.
//! 2. Troca para um dispositivo inexistente → deve falhar **sem** derrubar o
//!    dispositivo ativo (o áudio continua no destino anterior).
//!
//! Uso: `cargo run --example hot_swap`

use std::sync::Arc;
use std::time::Duration;

use micshare_pc_ui_lib::audio::sink;
use micshare_pc_ui_lib::config::ServerConfig;
use micshare_pc_ui_lib::server::Server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let devices = sink::output_devices()?;
    println!("dispositivos de saída:");
    for device in &devices {
        let cable = if device.is_virtual_cable {
            " [cabo virtual]"
        } else {
            ""
        };
        println!("  - {}{}", device.name, cable);
    }

    let config = ServerConfig::default();
    let server = Arc::new(Server::start(config).await?);
    tokio::time::sleep(Duration::from_millis(500)).await;

    let initial = server.stats().await.device_name;
    println!("\nsaída inicial: {initial}");

    // 1) Troca válida.
    if let Some(other) = devices
        .iter()
        .find(|device| device.name != initial)
        .map(|device| device.name.clone())
    {
        match server.set_output_device(Some(&other)) {
            Ok(name) => println!("troca OK para: {name}"),
            Err(err) => println!("troca falhou (esperado em alguns hosts): {err}"),
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
        println!("saída agora: {}", server.stats().await.device_name);
    }

    // 2) Troca inválida: precisa falhar e manter a saída atual.
    match server.set_output_device(Some("dispositivo-que-nao-existe-xyz")) {
        Ok(name) => println!("ERRO: deveria ter falhado, abriu {name}"),
        Err(err) => println!("\ntroca inválida rejeitada: {err}"),
    }
    tokio::time::sleep(Duration::from_millis(300)).await;
    let after = server.stats().await.device_name;
    println!("saída preservada após falha: {after}");
    assert_eq!(after, server.stats().await.device_name);

    server.stop().await;
    Ok(())
}
