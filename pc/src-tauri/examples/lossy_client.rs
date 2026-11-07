//! Simulador de rede ruim: envia frames PCM como o celular, com perda e jitter.
//!
//! Uso:
//! ```text
//! cargo run --example lossy_client -- --host 127.0.0.1 --drop-pct 20 --count 200
//! ```
//!
//! Substitui o `MICSHARE_DROP_PCT` que o `docs/arquitetura.md` §13 promete e que
//! nunca existiu no repositório. Sem isso não há como validar o PLC, o fade e
//! o `lossPct` de forma determinística.

use std::net::ToSocketAddrs;
use std::time::{Duration, Instant};

use micshare_pc_ui_lib::audio::{FRAME_MS, FRAME_SAMPLES, SAMPLE_RATE, build_frame};

/// Frequência do bipe (Hz).
const TONE_HZ: f64 = 1_000.0;

/// Amplitude: −6 dBFS (≈ 50% da escala cheia).
const AMPLITUDE: f64 = 0.5 * i16::MAX as f64;

/// Gerador pseudoaleatório (xorshift32) — sem dependência externa.
struct Rng(u32);

impl Rng {
    fn new(seed: u32) -> Self {
        Self(seed | 1)
    }

    fn next_u32(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }

    /// `true` se o frame deve ser descartado (simula perda).
    fn should_drop(&mut self, drop_pct: u32) -> bool {
        if drop_pct == 0 {
            return false;
        }
        self.next_u32() % 100 < drop_pct
    }

    /// Atraso extra em ms (simula jitter da rede).
    fn jitter_ms(&mut self, jitter_ms: u32) -> u32 {
        if jitter_ms == 0 {
            return 0;
        }
        self.next_u32() % (jitter_ms + 1)
    }
}

/// Gera um frame de 10 ms com uma senoide de 1 kHz.
///
/// `phase` é o ângulo acumulado (em radianos) e atravessa a chamada.
fn sine_frame(phase: &mut f64) -> Vec<i16> {
    let step = 2.0 * std::f64::consts::PI * TONE_HZ / SAMPLE_RATE as f64;
    (0..FRAME_SAMPLES)
        .map(|_| {
            let sample = (phase.sin() * AMPLITUDE).round() as i16;
            *phase += step;
            sample
        })
        .collect()
}

/// Opções do simulador.
struct Args {
    host: String,
    port: u16,
    drop_pct: u32,
    jitter_ms: u32,
    count: u32,
    seed: u32,
}

impl Default for Args {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_owned(),
            port: 41235,
            drop_pct: 0,
            jitter_ms: 0,
            count: 200,
            seed: 0x5eed,
        }
    }
}

/// Lê os argumentos da linha de comando (`--chave valor`).
fn parse_args() -> Result<Args, String> {
    let mut args = Args::default();
    let mut iter = std::env::args().skip(1);
    while let Some(flag) = iter.next() {
        let mut value = || {
            iter.next()
                .ok_or_else(|| format!("falta o valor de {flag}"))
        };
        match flag.as_str() {
            "--host" => args.host = value()?,
            "--port" => {
                args.port = value()?.parse().map_err(|_| "port inválido".to_owned())?;
            }
            "--drop-pct" => {
                args.drop_pct = value()?
                    .parse()
                    .map_err(|_| "drop-pct inválido".to_owned())?;
            }
            "--jitter-ms" => {
                args.jitter_ms = value()?
                    .parse()
                    .map_err(|_| "jitter-ms inválido".to_owned())?;
            }
            "--count" => {
                args.count = value()?.parse().map_err(|_| "count inválido".to_owned())?;
            }
            "--seed" => {
                args.seed = value()?.parse().map_err(|_| "seed inválido".to_owned())?;
            }
            "--help" | "-h" => {
                println!(
                    "uso: lossy_client [--host H] [--port P] [--drop-pct N] \
                     [--jitter-ms N] [--count N] [--seed N]"
                );
                std::process::exit(0);
            }
            other => return Err(format!("argumento desconhecido: {other}")),
        }
    }
    Ok(args)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let args = parse_args()?;

    let target = (args.host.as_str(), args.port)
        .to_socket_addrs()?
        .next()
        .ok_or("não foi possível resolver o destino")?;
    let socket = tokio::net::UdpSocket::bind("0.0.0.0:0").await?;

    println!(
        "enviando {} frames para {target} (perda {}%, jitter {} ms)",
        args.count, args.drop_pct, args.jitter_ms
    );

    let mut rng = Rng::new(args.seed);
    let mut phase = 0.0_f64;
    let period = Duration::from_millis(u64::from(FRAME_MS));
    let start = Instant::now();
    let mut sent = 0_u32;
    let mut dropped = 0_u32;

    for index in 0..args.count {
        // Prazo do frame: ritmo nominal + atraso da rede.
        let deadline = start
            + period * index
            + Duration::from_millis(u64::from(rng.jitter_ms(args.jitter_ms)));
        let now = Instant::now();
        if deadline > now {
            tokio::time::sleep(deadline - now).await;
        }

        let pcm = sine_frame(&mut phase);
        // `capture_ts` é monotônico (relógio do emissor, como `elapsedRealtime`).
        let capture_ts = u32::try_from(start.elapsed().as_millis()).unwrap_or(u32::MAX);

        if rng.should_drop(args.drop_pct) {
            // A sequência **avança** mesmo com o frame perdido: o PC precisa
            // ver a lacuna, não um frame atrasado.
            dropped += 1;
            continue;
        }

        let datagram = build_frame(index, capture_ts, &pcm);
        socket.send_to(&datagram, target).await?;
        sent += 1;
    }

    let elapsed = start.elapsed();
    println!(
        "enviados {sent} frames, descartados {dropped}, em {:.2}s",
        elapsed.as_secs_f64()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn perda_simula_a_percentual_pedida() {
        let mut rng = Rng::new(0x5eed);
        let mut dropped = 0;
        let total = 10_000;
        for _ in 0..total {
            if rng.should_drop(20) {
                dropped += 1;
            }
        }
        let pct = dropped as f64 / total as f64 * 100.0;
        assert!(
            (pct - 20.0).abs() < 2.0,
            "perda simulada fora da faixa: {pct}%"
        );
    }

    #[test]
    fn zero_de_perda_nao_descarta_nada() {
        let mut rng = Rng::new(1);
        for _ in 0..100 {
            assert!(!rng.should_drop(0));
        }
    }

    #[test]
    fn jitter_fica_dentro_do_limite() {
        let mut rng = Rng::new(7);
        for _ in 0..1_000 {
            assert!(rng.jitter_ms(20) <= 20);
        }
        for _ in 0..100 {
            assert_eq!(rng.jitter_ms(0), 0);
        }
    }

    #[test]
    fn senoide_tem_amplitude_de_menos_6_dbfs() {
        let mut phase = 0.0;
        let pcm = sine_frame(&mut phase);
        assert_eq!(pcm.len(), FRAME_SAMPLES);
        let peak = pcm.iter().map(|s| s.unsigned_abs()).max().unwrap_or(0);
        assert!(
            (15_001..=16_384).contains(&peak),
            "pico fora do esperado: {peak}"
        );
    }
}
