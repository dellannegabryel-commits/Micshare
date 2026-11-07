//! Testes de integração do pipeline de áudio (UDP → jitter buffer).

use std::net::{IpAddr, Ipv4Addr};
use std::sync::{Arc, Mutex};

use micshare_pc_ui_lib::audio::{
    AllowedSources, CHANNELS, FRAME_MS, FRAME_SAMPLES, JitterBuffer, RemoteGain, VOLUME_UNITY,
    build_frame, receive_frames,
};
use tokio::net::UdpSocket;

fn buffer() -> Arc<Mutex<JitterBuffer>> {
    Arc::new(Mutex::new(JitterBuffer::new(
        FRAME_SAMPLES,
        u32::from(FRAME_MS),
        30,
        100,
    )))
}

/// Allowlist que libera o loopback (origem dos datagramas de teste).
fn allow_localhost() -> Arc<AllowedSources> {
    let allowed = Arc::new(AllowedSources::default());
    allowed.allow(IpAddr::V4(Ipv4Addr::LOCALHOST));
    allowed
}

/// Regressão do bug "portInUse no restart": abortar a task não libera o socket
/// imediatamente (o drop é no próximo tick do scheduler). Ao aguardar o
/// `JoinHandle` (`abort()` + `await`), a porta fica rebindável de forma
/// determinística — é exatamente o mecanismo de `AudioPipeline::stop().await`.
#[tokio::test]
async fn abort_mais_await_libera_a_porta_para_rebind() {
    let socket = UdpSocket::bind(("127.0.0.1", 0)).await.unwrap();
    let addr = socket.local_addr().unwrap();

    // Task que segura o socket em loop, como `receive_frames` faz.
    let task = tokio::spawn(async move {
        let mut buf = [0_u8; 64];
        loop {
            let _ = socket.recv_from(&mut buf).await;
        }
    });

    // Encerra de forma determinística: aborta e aguarda o future ser dropado.
    task.abort();
    let _ = task.await;

    // Imediatamente rebind a mesma porta — deve funcionar sem `portInUse`.
    let rebind = UdpSocket::bind(addr)
        .await
        .expect("a porta deveria estar liberada após abort+await");
    assert_eq!(rebind.local_addr().unwrap(), addr);
}

#[tokio::test]
async fn frame_udp_chega_ao_jitter_buffer() {
    let socket = UdpSocket::bind(("127.0.0.1", 0)).await.unwrap();
    let addr = socket.local_addr().unwrap();

    let buffer = buffer();
    let task = tokio::spawn(receive_frames(
        socket,
        Arc::clone(&buffer),
        None,
        allow_localhost(),
        None,
    ));

    let sender = UdpSocket::bind(("127.0.0.1", 0)).await.unwrap();
    let pcm = vec![1_i16; FRAME_SAMPLES];
    let datagram = build_frame(0, 1_000, &pcm);
    sender.send_to(&datagram, addr).await.unwrap();

    // Espera o frame ser processado.
    let mut received = 0;
    for _ in 0..50 {
        received = buffer.lock().unwrap().metrics().received;
        if received > 0 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }

    assert_eq!(received, 1, "o frame UDP não chegou ao jitter buffer");
    task.abort();
}

#[tokio::test]
async fn datagrama_invalido_e_descartado() {
    let socket = UdpSocket::bind(("127.0.0.1", 0)).await.unwrap();
    let addr = socket.local_addr().unwrap();

    let buffer = buffer();
    let task = tokio::spawn(receive_frames(
        socket,
        Arc::clone(&buffer),
        None,
        allow_localhost(),
        None,
    ));

    let sender = UdpSocket::bind(("127.0.0.1", 0)).await.unwrap();
    // Magic inválido.
    let mut garbage = vec![0_u8; 32];
    garbage[0] = b'X';
    garbage[1] = b'X';
    sender.send_to(&garbage, addr).await.unwrap();

    tokio::time::sleep(std::time::Duration::from_millis(150)).await;

    assert_eq!(buffer.lock().unwrap().metrics().received, 0);
    task.abort();
}

#[tokio::test]
async fn canal_um_e_frame_por_frame() {
    let socket = UdpSocket::bind(("127.0.0.1", 0)).await.unwrap();
    let addr = socket.local_addr().unwrap();

    let buffer = buffer();
    let task = tokio::spawn(receive_frames(
        socket,
        Arc::clone(&buffer),
        None,
        allow_localhost(),
        None,
    ));

    let sender = UdpSocket::bind(("127.0.0.1", 0)).await.unwrap();
    let pcm = vec![0_i16; FRAME_SAMPLES];
    for seq in 0..5 {
        let datagram = build_frame(seq, 1_000 + seq, &pcm);
        sender.send_to(&datagram, addr).await.unwrap();
    }

    let mut received = 0;
    for _ in 0..50 {
        received = buffer.lock().unwrap().metrics().received;
        if received >= 5 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }

    let guard = buffer.lock().unwrap();
    assert_eq!(received, 5);
    assert_eq!(guard.metrics().lost, 0);
    assert_eq!(guard.metrics().gaps, 0);
    drop(guard);

    task.abort();
}

/// Sem sessão de controle, nenhum host da LAN pode injetar áudio no
/// microfone do usuário: o datagrama é descartado antes do jitter buffer.
#[tokio::test]
async fn frame_de_ip_sem_sessao_e_descartado() {
    let socket = UdpSocket::bind(("127.0.0.1", 0)).await.unwrap();
    let addr = socket.local_addr().unwrap();

    let buffer = buffer();
    // Allowlist com o loopback liberado — o remetente abaixo é outro IP.
    let allowed = allow_localhost();
    let task = tokio::spawn(receive_frames(
        socket,
        Arc::clone(&buffer),
        None,
        Arc::clone(&allowed),
        None,
    ));

    // 127.0.0.2 é loopback válido e diferente de 127.0.0.1.
    let sender = UdpSocket::bind(("127.0.0.2", 0)).await.unwrap();
    let pcm = vec![1_000_i16; FRAME_SAMPLES];
    let datagram = build_frame(0, 1_000, &pcm);
    sender.send_to(&datagram, addr).await.unwrap();

    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let metrics = buffer.lock().unwrap().metrics();
    assert_eq!(
        metrics.received, 0,
        "frame de IP sem sessão entrou no buffer"
    );
    assert_eq!(metrics.rejected, 1, "o descarte não foi contabilizado");
    task.abort();
}

/// A allowlist é liberada no `hello` e revogada no fim da sessão.
#[tokio::test]
async fn allowlist_ignora_ip_nao_liberado() {
    let allowed = AllowedSources::default();
    let ip = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 50));
    assert!(!allowed.contains(ip));

    allowed.allow(ip);
    assert!(allowed.contains(ip));

    // Duas sessões do mesmo IP: revogar uma não fecha a outra.
    allowed.allow(ip);
    allowed.revoke(ip);
    assert!(allowed.contains(ip), "a segunda sessão foi derrubada junto");

    allowed.revoke(ip);
    assert!(
        !allowed.contains(ip),
        "o IP ficou liberado após a última sessão"
    );
}

#[test]
fn header_do_frame_usa_o_canal_unico() {
    let pcm = vec![0_i16; FRAME_SAMPLES];
    let datagram = build_frame(1, 0, &pcm);

    // offset 14 = channels, offset 15 = codec (PCM s16le).
    assert_eq!(datagram[14], CHANNELS);
    assert_eq!(datagram[15], 0);
}

/// O volume enviado pelo celular precisa alterar as amostras que entram no
/// jitter buffer (o `ControlState` sozinho nunca era lido — o slider do
/// celular era decorativo).
#[tokio::test]
async fn volume_do_celular_aplica_no_ingest() {
    let socket = UdpSocket::bind(("127.0.0.1", 0)).await.unwrap();
    let addr = socket.local_addr().unwrap();

    let buffer = buffer();
    let gain = Arc::new(RemoteGain::new());
    gain.set_volume(VOLUME_UNITY / 2); // 50%
    let task = tokio::spawn(receive_frames(
        socket,
        Arc::clone(&buffer),
        Some(Arc::clone(&gain)),
        allow_localhost(),
        None,
    ));

    let sender = UdpSocket::bind(("127.0.0.1", 0)).await.unwrap();
    let pcm = vec![1_000_i16; FRAME_SAMPLES];
    // 3 frames: o jitter buffer só sai do warmup com a profundidade alvo.
    for seq in 0..3 {
        let datagram = build_frame(seq, 1_000 + seq, &pcm);
        sender.send_to(&datagram, addr).await.unwrap();
    }

    // Espera os frames serem processados.
    let mut received = 0;
    for _ in 0..50 {
        received = buffer.lock().unwrap().metrics().received;
        if received >= 3 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    assert_eq!(received, 3);

    // Drena o buffer e confere a amplitude (metade de 1000 = 500).
    let mut guard = buffer.lock().unwrap();
    let mut out = vec![0_i16; FRAME_SAMPLES];
    guard.pop_into(&mut out);
    assert!(
        out.iter().all(|&s| s == 500),
        "esperava 500 após volume 50%, veio {}",
        out[0]
    );

    drop(guard);
    task.abort();
}

/// O mute enviado pelo celular precisa zerar as amostras no ingest.
#[tokio::test]
async fn mute_do_celular_zera_o_ingest() {
    let socket = UdpSocket::bind(("127.0.0.1", 0)).await.unwrap();
    let addr = socket.local_addr().unwrap();

    let buffer = buffer();
    let gain = Arc::new(RemoteGain::new());
    gain.set_mute(true);
    let task = tokio::spawn(receive_frames(
        socket,
        Arc::clone(&buffer),
        Some(Arc::clone(&gain)),
        allow_localhost(),
        None,
    ));

    let sender = UdpSocket::bind(("127.0.0.1", 0)).await.unwrap();
    let pcm = vec![1_000_i16; FRAME_SAMPLES];
    // 3 frames: o jitter buffer só sai do warmup com a profundidade alvo.
    for seq in 0..3 {
        let datagram = build_frame(seq, 1_000 + seq, &pcm);
        sender.send_to(&datagram, addr).await.unwrap();
    }

    let mut received = 0;
    for _ in 0..50 {
        received = buffer.lock().unwrap().metrics().received;
        if received >= 3 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    assert_eq!(received, 3);

    let mut guard = buffer.lock().unwrap();
    let mut out = vec![0_i16; FRAME_SAMPLES];
    guard.pop_into(&mut out);
    assert!(
        out.iter().all(|&s| s == 0),
        "mute do celular não zerou o áudio"
    );

    drop(guard);
    task.abort();
}
