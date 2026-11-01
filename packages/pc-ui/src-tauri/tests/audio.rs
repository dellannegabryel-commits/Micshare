//! Testes de integração do pipeline de áudio (UDP → jitter buffer).

use std::sync::{Arc, Mutex};

use micshare_pc_ui_lib::audio::{
    CHANNELS, FRAME_MS, FRAME_SAMPLES, JitterBuffer, build_frame, receive_frames,
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
    let task = tokio::spawn(receive_frames(socket, Arc::clone(&buffer)));

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
    let task = tokio::spawn(receive_frames(socket, Arc::clone(&buffer)));

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
    let task = tokio::spawn(receive_frames(socket, Arc::clone(&buffer)));

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

#[test]
fn header_do_frame_usa_o_canal_unico() {
    let pcm = vec![0_i16; FRAME_SAMPLES];
    let datagram = build_frame(1, 0, &pcm);

    // offset 14 = channels, offset 15 = codec (PCM s16le).
    assert_eq!(datagram[14], CHANNELS);
    assert_eq!(datagram[15], 0);
}
