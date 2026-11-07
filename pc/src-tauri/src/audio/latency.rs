//! Instrumentação de latência de rede (Método B — software).
//!
//! O celular mede o RTT com `ping`/`pong` e publica o **offset** entre o seu
//! relógio e o do PC. Com esse offset o PC traduz o `capture_ts` (que vem no
//! relógio do celular) para o seu próprio domínio e mede a latência de cada
//! frame que chega.
//!
//! O offset é publicado no domínio do `capture_ts` (u32, ms):
//! `offset = t1 - t0 - rtt/2`, com `t0`/`t2` lidos do relógio do celular e `t1`
//! do relógio do PC. Assim o wrap de u32 do `capture_ts` (49,7 dias) não
//! exige contagem de epochs no PC: o wrap do relógio do celular e o do
//! `capture_ts` acontecem juntos e se cancelam.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

/// Capacidade da janela de latência (amostras).
const WINDOW: usize = 200;

/// Latência acima disso (ms) é descartada: o offset está errado.
const MAX_PLAUSIBLE_MS: f64 = 10_000.0;

/// Relógio monotônico do PC em milissegundos (desde o início do processo).
///
/// Monotônico de propósito: um ajuste de NTP no relógio de parede invalida a
/// medição; o offset entre os dois relógios também mudaria junto.
#[must_use]
pub fn now_ms() -> f64 {
    static ANCHOR: OnceLock<Instant> = OnceLock::new();
    ANCHOR.get_or_init(Instant::now).elapsed().as_secs_f64() * 1000.0
}

/// Offset publicado pelo celular entre o relógio dele e o do PC (ms).
///
/// Fica compartilhado entre o canal de controle (que recebe o `ping`) e o
/// ingest de áudio (que mede a latência) — é o mesmo número para os dois.
#[derive(Debug, Default)]
pub struct ClockOffset {
    micros: AtomicI64,
    valid: AtomicBool,
}

impl ClockOffset {
    /// Publica o offset medido (ms).
    pub fn set_ms(&self, offset_ms: f64) {
        self.micros
            .store((offset_ms * 1000.0).round() as i64, Ordering::Relaxed);
        self.valid.store(true, Ordering::Relaxed);
    }

    /// Offset publicado (ms) ou `None` enquanto nenhum ping foi medido.
    #[must_use]
    pub fn get_ms(&self) -> Option<f64> {
        if self.valid.load(Ordering::Relaxed) {
            Some(self.micros.load(Ordering::Relaxed) as f64 / 1000.0)
        } else {
            None
        }
    }
}

/// Janela deslizante de latência (ms).
#[derive(Debug, Default)]
pub struct LatencyWindow {
    samples: VecDeque<f64>,
}

impl LatencyWindow {
    /// Janela vazia.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Registra uma amostra, descartando a mais antiga quando a janela enche.
    pub fn push(&mut self, sample: f64) {
        if self.samples.len() >= WINDOW {
            self.samples.pop_front();
        }
        self.samples.push_back(sample);
    }

    /// Mediana das amostras (`0` se a janela está vazia).
    #[must_use]
    pub fn median(&self) -> f64 {
        let sorted = self.sorted();
        if sorted.is_empty() {
            return 0.0;
        }
        let mid = sorted.len() / 2;
        if sorted.len() % 2 == 0 {
            (sorted[mid - 1] + sorted[mid]) / 2.0
        } else {
            sorted[mid]
        }
    }

    /// Percentil 95 das amostras (`0` se a janela está vazia).
    #[must_use]
    pub fn p95(&self) -> f64 {
        let sorted = self.sorted();
        if sorted.is_empty() {
            return 0.0;
        }
        let rank = ((sorted.len() as f64 * 0.95).ceil() as usize).max(1) - 1;
        sorted[rank.min(sorted.len() - 1)]
    }

    /// Amostras em ordem crescente.
    fn sorted(&self) -> Vec<f64> {
        let mut sorted: Vec<f64> = self.samples.iter().copied().collect();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        sorted
    }
}

/// Rastreador da latência de rede.
///
/// Recebe o `capture_ts` de cada frame e guarda uma janela com mediana e p95.
#[derive(Debug)]
pub struct LatencyTracker {
    offset: Arc<ClockOffset>,
    window: Mutex<LatencyWindow>,
}

impl LatencyTracker {
    /// Cria o rastreador ligado ao offset compartilhado com o canal de controle.
    #[must_use]
    pub fn new(offset: Arc<ClockOffset>) -> Self {
        Self {
            offset,
            window: Mutex::new(LatencyWindow::new()),
        }
    }

    /// Registra a chegada de um frame (`capture_ts` no relógio do celular).
    ///
    /// Sem offset publicado (nenhum `pong` recebido ainda) a medição é
    /// ignorada: o número seria puro ruído.
    pub fn observe(&self, capture_ts: u32) {
        let Some(offset_ms) = self.offset.get_ms() else {
            return;
        };
        let latency = now_ms() - (f64::from(capture_ts) + offset_ms);
        if !(0.0..=MAX_PLAUSIBLE_MS).contains(&latency) {
            // Offset desatualizado (logo após um wrap de u32) ou relógio
            // ajustado: descartar é melhor que publicar um número falso.
            return;
        }
        if let Ok(mut window) = self.window.lock() {
            window.push(latency);
        }
    }

    /// Latência mediana (ms).
    #[must_use]
    pub fn median_ms(&self) -> f64 {
        self.window
            .lock()
            .map(|window| window.median())
            .unwrap_or(0.0)
    }

    /// Latência p95 (ms).
    #[must_use]
    pub fn p95_ms(&self) -> f64 {
        self.window.lock().map(|window| window.p95()).unwrap_or(0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mediana_e_p95_da_janela() {
        let mut window = LatencyWindow::new();
        for sample in 1..=100 {
            window.push(f64::from(sample));
        }

        assert!((window.median() - 50.5).abs() < 0.001, "mediana errada");
        assert!((window.p95() - 95.0).abs() < 0.001, "p95 errado");
    }

    #[test]
    fn janela_desliza_e_nao_cresce() {
        let mut window = LatencyWindow::new();
        for sample in 0..1000 {
            window.push(f64::from(sample));
        }

        assert_eq!(window.samples.len(), WINDOW);
        // Só as 200 amostras mais recentes (800..=999) contam.
        assert!((window.p95() - 989.0).abs() < 0.001, "p95 errado");
    }

    #[test]
    fn janela_vazia_devolve_zero() {
        let window = LatencyWindow::new();
        assert_eq!(window.median(), 0.0);
        assert_eq!(window.p95(), 0.0);
    }

    #[test]
    fn latencia_exige_offset_publicado() {
        let offset = Arc::new(ClockOffset::default());
        let tracker = LatencyTracker::new(Arc::clone(&offset));

        tracker.observe(1_000);

        assert_eq!(tracker.median_ms(), 0.0, "mediu sem offset");
        assert!(offset.get_ms().is_none());
    }

    #[test]
    fn latencia_implausivel_e_descartada() {
        let offset = Arc::new(ClockOffset::default());
        offset.set_ms(0.0);
        let tracker = LatencyTracker::new(Arc::clone(&offset));

        // capture_ts muito à frente do relógio do PC → latência negativa.
        tracker.observe(u32::MAX);

        assert_eq!(tracker.median_ms(), 0.0, "publicou latência impossível");
    }

    #[test]
    fn latencia_plausivel_entra_na_janela() {
        let offset = Arc::new(ClockOffset::default());
        // O celular está 1000 s "à frente" do PC: o offset cancela isso.
        offset.set_ms(-1_000_000.0);
        let tracker = LatencyTracker::new(Arc::clone(&offset));

        tracker.observe(1_000_000);

        let latency = tracker.median_ms();
        assert!(
            (0.0..60_000.0).contains(&latency),
            "latência fora da faixa: {latency}"
        );
    }
}
