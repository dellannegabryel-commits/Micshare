//! Testes de integração do beacon de descoberta sobre sockets UDP reais.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use tokio::net::UdpSocket;

use micshare_pc_ui_lib::discovery::beacon::{BeaconConfig, BeaconSender};
use micshare_pc_ui_lib::protocol::{Beacon, DiscoveryRequest};

fn config() -> BeaconConfig {
    BeaconConfig {
        name: "PC-TESTE".into(),
        audio_port: 41235,
        ctrl_port: 41236,
        pairing_code: String::new(),
    }
}

#[tokio::test]
async fn beacon_chega_no_destino_configurado() {
    let receiver = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
    let receiver_addr = receiver.local_addr().unwrap();

    let sender = BeaconSender::bind_on(
        config(),
        (IpAddr::V4(Ipv4Addr::LOCALHOST), 0),
        vec![receiver_addr],
    )
    .await
    .unwrap();

    sender.announce_once().await.unwrap();

    let mut buf = [0_u8; 512];
    let (len, from) = tokio::time::timeout(
        Duration::from_secs(2),
        receiver.recv_from(&mut buf),
    )
    .await
    .expect("beacon não chegou")
    .unwrap();

    assert_eq!(from.ip(), IpAddr::V4(Ipv4Addr::LOCALHOST));

    let beacon: Beacon = serde_json::from_slice(&buf[..len]).unwrap();
    assert_eq!(beacon.app, "micshare");
    assert_eq!(beacon.name, "PC-TESTE");
    assert_eq!(beacon.audio_port, 41235);
    assert_eq!(beacon.ctrl_port, 41236);
    assert!(!beacon.pair);
}

#[tokio::test]
async fn probe_unicast_recebe_o_beacon() {
    let sender = std::sync::Arc::new(
        BeaconSender::bind_on(
            config(),
            (IpAddr::V4(Ipv4Addr::LOCALHOST), 0),
            Vec::new(),
        )
        .await
        .unwrap(),
    );
    let sender_addr = sender.local_addr().unwrap();

    // O loop precisa estar ativo para ler o socket e responder ao probe.
    let runner = std::sync::Arc::clone(&sender);
    let task = tokio::spawn(async move { runner.run().await });

    let client = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
    let probe = serde_json::to_vec(&DiscoveryRequest::Probe).unwrap();
    client.send_to(&probe, sender_addr).await.unwrap();

    let mut buf = [0_u8; 512];
    let (len, _) = tokio::time::timeout(Duration::from_secs(2), client.recv_from(&mut buf))
        .await
        .expect("resposta ao probe não chegou")
        .unwrap();

    task.abort();

    let beacon: Beacon = serde_json::from_slice(&buf[..len]).unwrap();
    assert_eq!(beacon.name, "PC-TESTE");
    assert_eq!(beacon.app, "micshare");
}

#[tokio::test]
async fn beacon_desabilitado_nao_e_enviado() {
    let receiver = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
    let receiver_addr = receiver.local_addr().unwrap();

    let sender = BeaconSender::bind_on(
        config(),
        (IpAddr::V4(Ipv4Addr::LOCALHOST), 0),
        vec![receiver_addr],
    )
    .await
    .unwrap();

    sender.set_enabled(false);
    sender.announce_once().await.unwrap();

    let mut buf = [0_u8; 512];
    let result = tokio::time::timeout(Duration::from_millis(300), receiver.recv_from(&mut buf)).await;
    assert!(result.is_err(), "beacon foi enviado mesmo com o beacon desabilitado");
}

#[tokio::test]
async fn announce_para_destino_inalcancavel_nao_falha() {
    // Porta descartada: o envio falha, mas o beacon não pode derrubar o loop.
    let sender = BeaconSender::bind_on(
        config(),
        (IpAddr::V4(Ipv4Addr::LOCALHOST), 0),
        vec![SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 9)],
    )
    .await
    .unwrap();

    assert!(sender.announce_once().await.is_ok());
}
