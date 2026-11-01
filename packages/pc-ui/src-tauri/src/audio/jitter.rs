//! Jitter buffer: reordena frames, conta perda e preenche lacunas.
//!
//! O celular envia frames a 10 ms (480 amostras a 48 kHz mono). A rede local
//! pode reordenar ou perder datagramas; este buffer entrega ao sink uma
//! sequência contínua de amostras, trocando lacunas por silêncio (PLC).
//!
//! A API de leitura é [`JitterBuffer::pop_into`]: ela preenche um buffer
//! pré-alocado do chamador com amostras mono contínuas — nenhum frame é
//! descartado no meio, mesmo quando o callback do dispositivo pede um número
//! de amostras diferente do tamanho do frame.

use std::collections::BTreeMap;
use std::time::Instant;

use serde::Serialize;

/// Métricas do jitter buffer (espelhadas no painel do app PC).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JitterMetrics {
    /// Frames recebidos.
    pub received: u64,
    /// Frames perdidos (duplicados ou atrasados).
    pub lost: u64,
    /// Lacunas de sequência detectadas.
    pub gaps: u64,
    /// Profundidade atual do buffer (ms).
    pub buffer_ms: u32,
    /// Leituras com buffer vazio (underrun).
    pub underruns: u64,
    /// Fast-forwards (descarte do frame mais antigo).
    pub fast_forwards: u64,
    /// Flushes totais do buffer.
    pub flushes: u64,
}

/// Resultado de uma leitura do jitter buffer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PopStatus {
    /// O buffer ainda está aquecendo (profundidade alvo não atingida).
    ///
    /// O destino foi preenchido com silêncio.
    Warmup,
    /// Havia dados (reais ou silêncio de preenchimento de lacuna).
    Data,
    /// O buffer esvaziou antes de completar a leitura.
    ///
    /// O destino foi preenchido com silêncio.
    Underrun,
}

/// Buffer de jitter com reordenação e preenchimento de lacunas.
#[derive(Debug)]
pub struct JitterBuffer {
    frame_samples: usize,
    frame_ms: u32,
    target_frames: usize,
    max_frames: usize,
    pending: BTreeMap<u32, Vec<i16>>,
    /// Frame em reprodução (parcialmente consumido).
    current: Vec<i16>,
    /// Posição de leitura dentro de `current`.
    current_offset: usize,
    /// Amostras de silêncio ainda a entregar (lacuna em curso).
    silence_remaining: usize,
    next_seq: Option<u32>,
    warm: bool,
    played_samples: u64,
    started_at: Instant,
    metrics: JitterMetrics,
}

impl JitterBuffer {
    /// Cria um buffer para frames de [`frame_samples`] amostras / [`frame_ms`] ms.
    ///
    /// `target_ms` é a profundidade alvo (30 ms por padrão) e `max_ms` o
    /// limite duro (100 ms) — acima disso, frames antigos são descartados.
    #[must_use]
    pub fn new(frame_samples: usize, frame_ms: u32, target_ms: u32, max_ms: u32) -> Self {
        let max_frames = usize::try_from(max_ms.div_ceil(frame_ms.max(1)))
            .unwrap_or(10)
            .max(1);

        Self {
            frame_samples,
            frame_ms,
            target_frames: usize::try_from(target_ms.div_ceil(frame_ms.max(1))).unwrap_or(3),
            max_frames,
            pending: BTreeMap::new(),
            current: Vec::new(),
            current_offset: 0,
            silence_remaining: 0,
            next_seq: None,
            warm: false,
            played_samples: 0,
            started_at: Instant::now(),
            metrics: JitterMetrics::default(),
        }
    }

    /// Insere um frame recebido.
    ///
    /// Frames com sequência anterior à esperada são descartados (contados
    /// como perdidos).
    pub fn push(&mut self, seq: u32, samples: Vec<i16>) {
        self.metrics.received += 1;

        if let Some(next) = self.next_seq {
            if seq < next {
                self.metrics.lost += 1;
                return;
            }
        }

        self.pending.insert(seq, samples);

        while self.pending.len() > self.max_frames {
            let Some(oldest) = self.pending.keys().next().copied() else {
                break;
            };
            self.pending.remove(&oldest);
            self.metrics.fast_forwards += 1;
        }
    }

    /// Preenche `out` com amostras mono contínuas.
    ///
    /// O buffer é sempre preenchido por inteiro: as lacunas e a falta de dados
    /// viram silêncio, de modo que o sink sempre recebe um fluxo contínuo
    /// (sem trancos) na taxa de origem do pipeline.
    pub fn pop_into(&mut self, out: &mut [i16]) -> PopStatus {
        out.fill(0);

        if out.is_empty() {
            return PopStatus::Data;
        }

        // Aquecimento: espera o buffer atingir a profundidade alvo antes de
        // começar a reproduzir (troca latência inicial por menos underruns).
        if !self.warm {
            if self.pending.len() < self.target_frames {
                return PopStatus::Warmup;
            }
            self.warm = true;
            self.next_seq = self.pending.keys().next().copied();
        }

        let mut written = 0;
        let mut underrun = false;

        while written < out.len() {
            // 1) Continua o frame em reprodução.
            if self.current_offset < self.current.len() {
                let take = (out.len() - written).min(self.current.len() - self.current_offset);
                out[written..written + take].copy_from_slice(
                    &self.current[self.current_offset..self.current_offset + take],
                );
                self.current_offset += take;
                written += take;
                continue;
            }

            // 2) Entrega o silêncio de uma lacuna detectada.
            if self.silence_remaining > 0 {
                let take = (out.len() - written).min(self.silence_remaining);
                self.silence_remaining -= take;
                written += take;
                continue;
            }

            // 3) Busca o próximo frame disponível.
            let Some(available) = self.pending.keys().next().copied() else {
                underrun = true;
                self.metrics.underruns += 1;
                self.metrics.buffer_ms = 0;
                break;
            };

            let next = self.next_seq.unwrap_or_default();

            if available > next {
                // Lacuna: preenche com silêncio até o próximo frame disponível.
                self.metrics.gaps += u64::from(available - next);
                self.next_seq = Some(available);
                self.silence_remaining = self.frame_samples;
                continue;
            }

            if let Some(samples) = self.pending.remove(&available) {
                self.current = samples;
                self.current_offset = 0;
            }
            self.next_seq = Some(next + 1);
            self.metrics.buffer_ms = (self.pending.len() as u32) * self.frame_ms;
        }

        self.played_samples += written as u64;

        if underrun {
            PopStatus::Underrun
        } else {
            PopStatus::Data
        }
    }

    /// Esvazia o buffer (troca de sessão ou reset do stream).
    pub fn flush(&mut self) {
        self.pending.clear();
        self.current.clear();
        self.current_offset = 0;
        self.silence_remaining = 0;
        self.warm = false;
        self.next_seq = None;
        self.metrics.flushes += 1;
        self.metrics.buffer_ms = 0;
    }

    /// Snapshot das métricas.
    #[must_use]
    pub fn metrics(&self) -> JitterMetrics {
        self.metrics
    }

    /// Frames reproduzidos por segundo (média desde o início do stream).
    #[must_use]
    pub fn fps(&self) -> f32 {
        let elapsed = self.started_at.elapsed().as_secs_f32();
        if elapsed <= 0.0 || self.frame_samples == 0 {
            return 0.0;
        }
        (self.played_samples as f32 / elapsed) / self.frame_samples as f32
    }

    /// Profundidade alvo do buffer, em frames.
    #[must_use]
    pub fn target_frames(&self) -> usize {
        self.target_frames
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRAME: usize = 480;

    fn buffer() -> JitterBuffer {
        JitterBuffer::new(FRAME, 10, 30, 100)
    }

    fn frame(value: i16) -> Vec<i16> {
        vec![value; FRAME]
    }

    #[test]
    fn warmup_devolve_silencio_sem_contar_underrun() {
        let mut buffer = buffer();
        let mut out = vec![7_i16; FRAME];

        assert_eq!(buffer.pop_into(&mut out), PopStatus::Warmup);
        assert!(out.iter().all(|sample| *sample == 0));
        assert_eq!(buffer.metrics().underruns, 0);
    }

    #[test]
    fn buffer_vazio_durante_o_stream_conta_underrun() {
        let mut buffer = buffer();
        for seq in 0..3 {
            buffer.push(seq, frame(0));
        }

        let mut out = vec![0_i16; FRAME];
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert_eq!(
            buffer.pop_into(&mut out),
            PopStatus::Underrun,
            "esperava underrun com o buffer vazio"
        );
        assert_eq!(buffer.metrics().underruns, 1);
        assert!(out.iter().all(|sample| *sample == 0));
    }

    #[test]
    fn entrega_frames_na_ordem() {
        let mut buffer = buffer();
        for seq in 0..3 {
            buffer.push(seq, frame(seq as i16));
        }

        let mut out = vec![0_i16; FRAME];
        for expected in 0..3 {
            assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
            assert_eq!(out[0], expected);
        }
    }

    #[test]
    fn reordena_frames_chegados_fora_de_ordem() {
        let mut buffer = buffer();
        buffer.push(1, frame(1));
        buffer.push(0, frame(0));
        buffer.push(2, frame(2));
        buffer.push(3, frame(3));

        let mut out = vec![0_i16; FRAME];
        for expected in 0..3 {
            assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
            assert_eq!(out[0], expected);
        }
    }

    #[test]
    fn lacuna_e_preenchida_com_silencio() {
        let mut buffer = buffer();
        buffer.push(0, frame(0));
        buffer.push(1, frame(1));
        buffer.push(3, frame(3)); // falta o 2

        let mut out = vec![0_i16; FRAME];
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert_eq!(out[0], 0);
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert_eq!(out[0], 1);

        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert!(
            out.iter().all(|sample| *sample == 0),
            "lacuna não foi preenchida"
        );
        assert_eq!(buffer.metrics().gaps, 1);
    }

    #[test]
    fn leitura_parcial_preserva_o_resto_do_frame() {
        let mut buffer = buffer();
        for seq in 0..3 {
            buffer.push(seq, frame(seq as i16));
        }

        // Frame size = 480. Pede 300 amostras -> pega 300 do frame 0 (restam 180).
        let mut out = vec![0_i16; 300];
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert!(out.iter().all(|sample| *sample == 0)); // tudo do frame 0

        // Pede 380 amostras -> pega 180 restantes do frame 0 + 200 do frame 1.
        let mut out = vec![9_i16; 380];
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert!(out[..180].iter().all(|sample| *sample == 0)); // resto do frame 0
        assert!(out[180..].iter().all(|sample| *sample == 1)); // início do frame 1

        // Pede 380 amostras -> pega 280 restantes do frame 1 (480-200) + 100 do frame 2.
        let mut out = vec![9_i16; 380];
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert!(out[..280].iter().all(|sample| *sample == 1)); // resto do frame 1
        assert!(out[280..].iter().all(|sample| *sample == 2)); // início do frame 2
    }

    #[test]
    fn frame_atrasado_e_contado_como_perdido() {
        let mut buffer = buffer();
        for seq in 0..3 {
            buffer.push(seq, frame(0));
        }

        let mut out = vec![0_i16; FRAME];
        for _ in 0..3 {
            buffer.pop_into(&mut out);
        }

        buffer.push(1, frame(1)); // chegou atrasado

        assert_eq!(buffer.metrics().lost, 1);
    }

    #[test]
    fn buffer_cresce_alem_do_limite_e_faz_fast_forward() {
        let mut buffer = buffer();
        for seq in 0..20 {
            buffer.push(seq, frame(0));
        }

        // O buffer guarda no máximo 10 frames (100 ms); os 10 mais antigos
        // foram descartados.
        assert_eq!(buffer.metrics().fast_forwards, 10);
        assert!(buffer.metrics().buffer_ms <= 100);
    }

    #[test]
    fn flush_esvazia_o_buffer() {
        let mut buffer = buffer();
        buffer.push(0, frame(0));
        buffer.flush();

        let mut out = vec![0_i16; FRAME];
        assert_eq!(buffer.metrics().flushes, 1);
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Warmup);
    }
}
