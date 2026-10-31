//! Testes de integração do canal de controle (WebSocket real).

use std::net::{IpAddr, Ipv4Addr, SocketAddr};

use futures_util::{SinkExt, StreamExt};
use micshare_pc_ui_lib::control::{ControlConfig, ControlServer};
use micshare_pc_ui_lib::protocol::CtrlMessage;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;

/// Endereço de conexão: o servidor binds em 0.0.0.0, mas o cliente
/// conecta em 127.0.0.1 (0.0.0.0 não é roteável no Windows).
fn connect_addr(addr: SocketAddr) -> SocketAddr {
    SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), addr.port())
}

async fn start_server() -> SocketAddr {
    let server = ControlServer::bind(ControlConfig {
        port: 0,
        audio_port: 41235,
        target_buffer_ms: 30,
        pairing_token: None,
    })
    .await
    .unwrap();

    let addr = server.local_addr().unwrap();
    tokio::spawn(async move {
        if let Err(err) = std::sync::Arc::new(server).run().await {
            eprintln!("[controle] encerrou: {err}");
        }
    });
    addr
}

#[tokio::test]
async fn hello_recebe_welcome() {
    let addr = start_server().await;
    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{}", connect_addr(addr)))
        .await
        .unwrap();

    let hello = CtrlMessage::Hello {
        v: 1,
        token: String::new(),
        sample_rate: 48000,
        channels: 1,
        codec: "pcm16".into(),
        frame_ms: 10,
    };
    ws.send(Message::Text(serde_json::to_string(&hello).unwrap().into()))
        .await
        .unwrap();

    let response = tokio::time::timeout(std::time::Duration::from_secs(3), ws.next())
        .await
        .expect("sem resposta ao hello")
        .unwrap()
        .unwrap();

    let text = response.into_text().unwrap();
    let welcome: CtrlMessage = serde_json::from_str(&text).unwrap();

    match welcome {
        CtrlMessage::Welcome {
            session_id,
            audio_port,
            target_buffer_ms,
            codec,
        } => {
            assert!(session_id.starts_with('c'));
            assert_eq!(audio_port, 41235);
            assert_eq!(target_buffer_ms, 30);
            assert_eq!(codec, "pcm16");
        }
        other => panic!("esperava welcome, recebeu {other:?}"),
    }
}

#[tokio::test]
async fn mensagem_invalida_recebe_error() {
    let addr = start_server().await;
    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{}", connect_addr(addr)))
        .await
        .unwrap();

    ws.send(Message::Text("{\"t\":\"nao_existe\"}".into()))
        .await
        .unwrap();

    let response = tokio::time::timeout(std::time::Duration::from_secs(3), ws.next())
        .await
        .expect("sem resposta")
        .unwrap()
        .unwrap();

    let text = response.into_text().unwrap();
    let error: CtrlMessage = serde_json::from_str(&text).unwrap();

    match error {
        CtrlMessage::Error { code, .. } => assert_eq!(code, "bad_message"),
        other => panic!("esperava error, recebeu {other:?}"),
    }
}

#[tokio::test]
async fn json_malformado_recebe_error() {
    let addr = start_server().await;
    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{}", connect_addr(addr)))
        .await
        .unwrap();

    ws.send(Message::Text("isto nao e json".into()))
        .await
        .unwrap();

    let response = tokio::time::timeout(std::time::Duration::from_secs(3), ws.next())
        .await
        .expect("sem resposta")
        .unwrap()
        .unwrap();

    let text = response.into_text().unwrap();
    let error: CtrlMessage = serde_json::from_str(&text).unwrap();
    assert!(error.is_error());
}

#[tokio::test]
async fn sessao_registrada_e_removida_no_close() {
    let server = ControlServer::bind(ControlConfig {
        port: 0,
        audio_port: 41235,
        target_buffer_ms: 30,
        pairing_token: None,
    })
    .await
    .unwrap();
    let addr = server.local_addr().unwrap();
    let server = std::sync::Arc::new(server);
    let runner = std::sync::Arc::clone(&server);
    tokio::spawn(async move {
        let _ = runner.run().await;
    });

    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{}", connect_addr(addr)))
        .await
        .unwrap();

    let hello = CtrlMessage::Hello {
        v: 1,
        token: String::new(),
        sample_rate: 48000,
        channels: 1,
        codec: "pcm16".into(),
        frame_ms: 10,
    };
    ws.send(Message::Text(serde_json::to_string(&hello).unwrap().into()))
        .await
        .unwrap();

    let _ = tokio::time::timeout(std::time::Duration::from_secs(3), ws.next())
        .await
        .expect("sem welcome")
        .unwrap()
        .unwrap();

    // A sessão é registrada no servidor.
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    assert_eq!(server.sessions().await.len(), 1);

    ws.close(None).await.unwrap();

    // E removida quando a conexão fecha.
    for _ in 0..20 {
        if server.sessions().await.is_empty() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert!(
        server.sessions().await.is_empty(),
        "sessão não foi removida"
    );
}

#[tokio::test]
async fn mute_e_volume_sao_aplicados() {
    let server = ControlServer::bind(ControlConfig {
        port: 0,
        audio_port: 41235,
        target_buffer_ms: 30,
        pairing_token: None,
    })
    .await
    .unwrap();
    let addr = server.local_addr().unwrap();
    let server = std::sync::Arc::new(server);
    let runner = std::sync::Arc::clone(&server);
    tokio::spawn(async move {
        let _ = runner.run().await;
    });

    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{}", connect_addr(addr)))
        .await
        .unwrap();

    let hello = CtrlMessage::Hello {
        v: 1,
        token: String::new(),
        sample_rate: 48000,
        channels: 1,
        codec: "pcm16".into(),
        frame_ms: 10,
    };
    ws.send(Message::Text(serde_json::to_string(&hello).unwrap().into()))
        .await
        .unwrap();
    let _ = tokio::time::timeout(std::time::Duration::from_secs(3), ws.next())
        .await
        .unwrap()
        .unwrap();

    ws.send(Message::Text(r#"{"t":"mute","value":true}"#.into()))
        .await
        .unwrap();
    ws.send(Message::Text(r#"{"t":"volume","value":9.0}"#.into()))
        .await
        .unwrap();

    tokio::time::sleep(std::time::Duration::from_millis(150)).await;

    let state = server.state().await;
    assert!(state.muted, "mute não foi aplicado");
    assert_eq!(state.volume, 4.0, "volume não foi clampado em [0,4]");
}

#[tokio::test]
async fn cliente_recebe_stats_periodico() {
    let addr = start_server().await;
    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{}", connect_addr(addr)))
        .await
        .unwrap();

    let hello = CtrlMessage::Hello {
        v: 1,
        token: String::new(),
        sample_rate: 48000,
        channels: 1,
        codec: "pcm16".into(),
        frame_ms: 10,
    };
    ws.send(Message::Text(serde_json::to_string(&hello).unwrap().into()))
        .await
        .unwrap();

    // welcome + stats (1 Hz)
    let mut saw_stats = false;
    for _ in 0..4 {
        let response = tokio::time::timeout(std::time::Duration::from_secs(3), ws.next())
            .await
            .expect("sem mensagem")
            .unwrap()
            .unwrap();
        let text = response.into_text().unwrap();
        if let Ok(CtrlMessage::Stats { .. }) = serde_json::from_str::<CtrlMessage>(&text) {
            saw_stats = true;
            break;
        }
    }
    assert!(saw_stats, "nenhum stats recebido");
}

#[tokio::test]
async fn conexao_tcp_simples_e_aceita() {
    // Sanidade: o servidor responde a um handshake WS real.
    let addr = start_server().await;
    let stream = TcpStream::connect(connect_addr(addr)).await.unwrap();
    drop(stream);
}
