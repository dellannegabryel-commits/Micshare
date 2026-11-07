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

use std::collections::{BTreeMap, VecDeque};
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
    /// Reancoragens após quebra de sequência (o emissor reiniciou a contagem).
    pub resyncs: u64,
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
    /// Janela deslizante dos últimos deltas de `capture_ts` (ms) — usada para
    /// adaptar a profundidade alvo ao jitter observado.
    ts_deltas: VecDeque<u32>,
    last_capture_ts: Option<u32>,
    last_push_seq: Option<u32>,
    pending: BTreeMap<u32, Vec<i16>>,
    /// Frame em reprodução (parcialmente consumido).
    current: Vec<i16>,
    /// Posição de leitura dentro de `current`.
    current_offset: usize,
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

        let initial_target = usize::try_from(target_ms.div_ceil(frame_ms.max(1)))
            .unwrap_or(3)
            .max(1);
        Self {
            frame_samples,
            frame_ms,
            target_frames: initial_target,
            max_frames,
            pending: BTreeMap::new(),
            current: Vec::new(),
            current_offset: 0,
            next_seq: None,
            warm: false,
            played_samples: 0,
            started_at: Instant::now(),
            metrics: JitterMetrics::default(),
            ts_deltas: VecDeque::with_capacity(100),
            last_capture_ts: None,
            last_push_seq: None,
        }
    }

    /// Insere um frame recebido (atalho que usa `seq * frame_ms` como timestamp).
    pub fn push(&mut self, seq: u32, samples: Vec<i16>) {
        let capture_ts = seq.saturating_mul(self.frame_ms);
        self.push_with_ts(seq, capture_ts, samples);
    }

    /// Insere um frame recebido com timestamp de captura explícito.
    ///
    /// Frames com sequência anterior à esperada são descartados (contados
    /// como perdidos). O alvo do jitter buffer é adaptado a partir dos
    /// deltas de `capture_ts` (janela de 100 frames).
    pub fn push_with_ts(&mut self, seq: u32, capture_ts: u32, samples: Vec<i16>) {
        self.metrics.received += 1;

        if let Some(next) = self.next_seq {
            // Distância com wraparound de u32: negativa = frame para trás.
            let behind = next.wrapping_sub(seq);
            let is_behind = behind > 0 && behind <= u32::MAX / 2;

            if is_behind {
                self.metrics.lost += 1;

                // Um salto para trás maior que a janela de reordenação não é
                // jitter: o emissor **reiniciou** a contagem (o serviço de
                // captura do celular foi recriado pelo Android — `START_STICKY`
                // — sem novo `hello`, logo sem `flush` no PC). Sem resync, todo
                // frame seguinte cairia em `seq < next` e seria descartado
                // para sempre: áudio mudo e perda ~100%.
                if behind as usize > self.max_frames {
                    self.resync(seq);
                } else {
                    return;
                }
                // Após resync, o frame atual ainda precisa ser inserido abaixo:
                // não retorna.
            }
        }

        // Mede o jitter apenas entre frames consecutivos em sequência (sem
        // lacunas/reordenação), para não confundir perda com jitter.
        let consecutive = self
            .last_push_seq
            .map(|last| seq == last.wrapping_add(1))
            .unwrap_or(false);
        if consecutive {
            if let Some(prev) = self.last_capture_ts {
                if capture_ts >= prev {
                    let delta = capture_ts - prev;
                    self.ts_deltas.push_back(delta);
                    if self.ts_deltas.len() > 100 {
                        self.ts_deltas.pop_front();
                    }
                    self.adapt_target();
                }
            }
        }
        if self
            .last_capture_ts
            .map(|p| capture_ts >= p)
            .unwrap_or(true)
        {
            self.last_capture_ts = Some(capture_ts);
        }
        self.last_push_seq = Some(seq);

        self.pending.insert(seq, samples);

        // fast_forward: descarta o frame mais antigo quando a profundidade
        // supera o alvo + 3 (limitado por max_frames).
        let ff_threshold = self.target_frames.saturating_add(3).min(self.max_frames);
        while self.pending.len() > ff_threshold {
            let Some(oldest) = self.pending.keys().next().copied() else {
                break;
            };
            self.pending.remove(&oldest);
            self.metrics.fast_forwards += 1;
        }

        // buffer_ms reflete a profundidade atual.
        self.metrics.buffer_ms = (self.pending.len() as u32) * self.frame_ms;
    }

    /// Reancora o buffer em `seq` depois de uma quebra de sequência.
    ///
    /// Descarta o que estava pendurado e assume `seq` como próximo frame,
    /// **sem** desaquecer: a reprodução continua imediatamente (não há razão
    /// para pagar o warmup de novo quando o fluxo apenas recomeçou).
    fn resync(&mut self, seq: u32) {
        self.pending.clear();
        self.current.clear();
        self.current_offset = 0;
        self.next_seq = Some(seq);
        self.ts_deltas.clear();
        self.last_capture_ts = None;
        self.last_push_seq = None;
        self.metrics.resyncs += 1;
        self.metrics.buffer_ms = 0;
    }

    /// Adapta `target_frames` com base no jitter medido (2..=8 frames).
    fn adapt_target(&mut self) {
        if self.ts_deltas.len() < 2 {
            return;
        }
        let max_delta = *self.ts_deltas.iter().max().unwrap_or(&self.frame_ms);
        let jitter_ms = max_delta.saturating_sub(self.frame_ms);
        // Cada frame de jitter além do frame_ms adiciona ~1 frame de folga.
        let extra = (jitter_ms / self.frame_ms.max(1)) as usize;
        let new_target = (3 + extra).clamp(2, 8);
        self.target_frames = new_target.min(self.max_frames).max(1);
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

            // 2) Busca o próximo frame disponível.
            let Some(available) = self.pending.keys().next().copied() else {
                underrun = true;
                self.metrics.underruns += 1;
                self.metrics.buffer_ms = 0;
                // Sem dados: perde a referência de sequência. O próximo frame
                // que chegar reancora o buffer em vez de virar uma lacuna
                // gigante (o buraco foi do sink, não da rede).
                self.next_seq = None;
                break;
            };

            // Sem referência (aquecimento, underrun ou resync): ancora no
            // frame mais antigo disponível. Não há como saber o que faltou,
            // então não conta lacuna.
            let next = match self.next_seq {
                Some(next) => next,
                None => {
                    self.next_seq = Some(available);
                    available
                }
            };

            if available > next {
                // Lacuna real: os frames `next..available` não chegaram a
                // tempo. Conta a perda, mas **não** reproduz o buraco em
                // silêncio.
                //
                // Ficar `gap_frames` callbacks mudo era um loop sem saída:
                // durante o silêncio os frames continuam chegando em tempo
                // real, o fast-forward descarta os mais antigos e, quando o
                // silêncio acaba, `available` já está de novo à frente de
                // `next` — outra lacuna, outro silêncio, para sempre. Com o
                // período de 10 ms do WASAPI (480 amostras = 1 frame), uma
                // única perda travava o pipeline em silêncio permanente e a
                // perda medida ia a ~90%. O certo é reancorar na borda viva
                // e voltar a tocar imediatamente.
                self.metrics.gaps += u64::from(available - next);
                self.next_seq = Some(available);
            }

            if let Some(samples) = self.pending.remove(&available) {
                self.current = samples;
                self.current_offset = 0;
            }
            self.next_seq = Some(available + 1);
            self.metrics.buffer_ms = (self.pending.len() as u32) * self.frame_ms;
        }

        self.played_samples += written as u64;

        if underrun {
            self.metrics.buffer_ms = 0;
            // Underrun: o buffer secou, então falta **folga** — aumenta o
            // alvo em 1 frame (até o teto adaptativo) para atravessar o
            // jitter seguinte. Reduzir para o mínimo, como antes, só
            // garantia o próximo underrun.
            self.target_frames = (self.target_frames + 1)
                .clamp(2, 8)
                .min(self.max_frames)
                .max(1);
            PopStatus::Underrun
        } else {
            self.metrics.buffer_ms = (self.pending.len() as u32) * self.frame_ms;
            PopStatus::Data
        }
    }

    /// Esvazia o buffer (troca de sessão ou reset do stream).
    pub fn flush(&mut self) {
        self.pending.clear();
        self.current.clear();
        self.current_offset = 0;
        self.warm = false;
        self.next_seq = None;
        self.ts_deltas.clear();
        self.last_capture_ts = None;
        self.last_push_seq = None;
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

    /// Regressão: o celular reinicia a contagem de sequência sem novo `hello`.
    ///
    /// O Android recria o `AudioCaptureService` (`START_STICKY`) e o
    /// `sequence` volta a 0, mas o PC não recebe `SessionEvent::Started` — logo
    /// não há `flush`. Antes, cada frame caía em `seq < next` e era descartado
    /// para sempre: áudio mudo e perda ~100%. O buffer tem de detectar o salto
    /// para trás e reancorar no novo fluxo.
    #[test]
    fn emissor_reinicia_a_sequencia_e_o_buffer_reancora() {
        let mut buffer = buffer();

        // Sessão em andamento: o PC já está no frame 5000.
        for seq in 5_000..5_005_u32 {
            buffer.push(seq, frame(1));
        }
        let mut out = vec![0_i16; FRAME];
        for _ in 0..5 {
            assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        }

        // O celular reinicia a contagem (serviço recriado, sem flush no PC).
        // Cada frame leva o próprio seq como valor, para dar pra seguir a ordem.
        for seq in 0..3_u32 {
            buffer.push(seq, frame(seq as i16));
        }

        assert_eq!(
            buffer.metrics().resyncs,
            1,
            "o salto para trás deveria ter reancorado o buffer"
        );

        // O áudio volta imediatamente, sem desaquecer, e segue em ordem.
        for seq in 3..6_u32 {
            buffer.push(seq, frame(seq as i16));
        }
        for expected in 0..6_i16 {
            assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
            assert_eq!(out[0], expected, "esperava o frame {expected}");
        }
        assert_eq!(buffer.metrics().resyncs, 1, "não pode reancorar de novo");
    }

    /// Reordenação pequena (dentro da janela) continua sendo só reordenação:
    /// não pode disparar resync.
    #[test]
    fn frame_atrasado_dentro_da_janela_nao_reancora() {
        let mut buffer = buffer();
        for seq in 0..5_u32 {
            buffer.push(seq, frame(0));
        }
        let mut out = vec![0_i16; FRAME];
        for _ in 0..5 {
            buffer.pop_into(&mut out);
        }

        buffer.push(3, frame(0)); // atrasado, mas perto

        assert_eq!(buffer.metrics().lost, 1);
        assert_eq!(buffer.metrics().resyncs, 0);
    }

    #[test]
    fn lacuna_conta_a_perda_e_reancora_no_frame_seguinte() {
        let mut buffer = buffer();
        buffer.push(0, frame(0));
        buffer.push(1, frame(1));
        buffer.push(3, frame(3)); // falta o 2

        let mut out = vec![0_i16; FRAME];
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert_eq!(out[0], 0);
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert_eq!(out[0], 1);

        // Lacuna: conta 1 frame perdido, mas toca o frame 3 imediatamente —
        // o buraco não é reproduzido em silêncio.
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert_eq!(out[0], 3, "deveria reancorar no frame disponível");
        assert_eq!(buffer.metrics().gaps, 1);
    }

    /// Regressão do bug de "90% de perda ao pausar os beacons".
    ///
    /// Com o período de 10 ms do WASAPI (`out.len() == frame_samples`), uma
    /// única lacuna fazia o pop devolver `gap_frames` de silêncio e **não
    /// consumir** o frame disponível. No callback seguinte o fast-forward já
    /// tinha descartado esse frame, `available` estava de novo à frente de
    /// `next`, e o pipeline entrava em silêncio permanente: 1 lacuna contada
    /// por callback, 1 frame recebido por callback → perda ~50-90% e áudio
    /// mudo para sempre.
    #[test]
    fn lacuna_nao_trava_o_pipeline_em_silencio_permanente() {
        const PERIOD: usize = FRAME; // callback de 10 ms a 48 kHz

        let mut buffer = buffer();
        let mut out = vec![0_i16; PERIOD];

        // Aquece e toca 3 frames em ordem.
        for seq in 0..3_u32 {
            buffer.push(seq, frame(seq as i16));
        }
        for expected in 0..3_i16 {
            assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
            assert_eq!(out[0], expected);
        }

        // O celular segue em tempo real (1 frame por callback), mas a rede
        // perde 1 em cada 5 — cenário ruim, porém longe de ser silêncio total.
        let mut callbacks_com_audio = 0_usize;
        let callbacks = 200_usize;

        for (callback, seq) in (0..callbacks).zip(3_u32..) {
            if callback % 5 != 0 {
                buffer.push(seq, frame((seq % 50) as i16));
            }

            let status = buffer.pop_into(&mut out);
            if matches!(status, PopStatus::Data) && out.iter().any(|s| *s != 0) {
                callbacks_com_audio += 1;
            }
        }

        // O áudio tem de continuar fluindo: no máximo ~20% dos callbacks
        // podem ser silêncio (a perda injetada), nunca ~100%.
        assert!(
            callbacks_com_audio >= callbacks * 70 / 100,
            "pipeline travou: só {callbacks_com_audio}/{callbacks} callbacks com áudio"
        );

        // E a perda medida tem de ficar na faixa do que foi realmente
        // perdido (20%), não explodir para 90%+.
        let expected = buffer.metrics().received + buffer.metrics().gaps;
        let loss = buffer.metrics().gaps as f64 / expected as f64 * 100.0;
        assert!(loss < 45.0, "perda inflada: {loss:.1}% (esperado ~20%)");
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

        // Fast-forward dispara em target+3 (6 frames com alvo 3); os 14
        // frames mais antigos foram descartados, mantendo 6 no buffer.
        assert_eq!(buffer.metrics().fast_forwards, 14);
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
