//! Verificação end-to-end do beacon sobre sockets UDP reais.
//!
//! Usa portas efêmeras para não depender de portas livres na máquina
//! (o servidor Node legado pode ocupar 41234-41236 em paralelo).

use std::net::{IpAddr, Ipv4Addr};
use std::time::Duration;

use micshare_pc_ui_lib::discovery::beacon::{BeaconConfig, BeaconSender};
use micshare_pc_ui_lib::protocol::{Beacon, DISCOVERY_PORT};
use tokio::net::UdpSocket;

#[tokio::test]
async fn beacon_no_formato_do_contrato_e_recebido_por_um_listener() {
    let listener = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
    let listener_addr = listener.local_addr().unwrap();

    let sender = BeaconSender::bind_on(
        BeaconConfig {
            name: "DESKTOP-TESTE".into(),
            audio_port: 41235,
            ctrl_port: 41236,
            pairing_code: String::new(),
        },
        (IpAddr::V4(Ipv4Addr::LOCALHOST), 0),
        vec![listener_addr],
    )
    .await
    .unwrap();

    let runner = std::sync::Arc::new(sender);
    let loop_runner = std::sync::Arc::clone(&runner);
    let task = tokio::spawn(async move { loop_runner.run().await });

    let mut buf = [0_u8; 512];
    let (len, _from) = tokio::time::timeout(Duration::from_secs(3), listener.recv_from(&mut buf))
        .await
        .expect("beacon não foi recebido em 3s")
        .unwrap();

    task.abort();

    let beacon: Beacon = serde_json::from_slice(&buf[..len]).expect("beacon não é JSON válido");
    assert_eq!(beacon.app, "micshare");
    assert_eq!(beacon.v, 1);
    assert_eq!(beacon.name, "DESKTOP-TESTE");
    assert_eq!(beacon.audio_port, 41235);
    assert_eq!(beacon.ctrl_port, 41236);
    assert!(!beacon.pair);
    assert_eq!(beacon.code, "");
}

#[test]
fn porta_de_descoberta_e_a_do_contrato() {
    assert_eq!(DISCOVERY_PORT, 41234);
}
