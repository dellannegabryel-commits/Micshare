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
use std::time::{Duration, Instant};

use serde::Serialize;

/// Métricas do jitter buffer (espelhadas no painel do app PC).
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
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
    /// Frames recebidos por segundo (janela móvel de 1 s).
    pub received_fps: f32,
    /// Datagramas descartados por virem de um IP sem sessão de controle.
    pub rejected: u64,
}

/// Janela móvel de taxa (últimos 1 s).
///
/// Uma média "desde o boot" nunca volta a zero: uma sessão de 10 min deixa o
/// número contaminado para sempre. Aqui cada unidade guarda seu instante, e a
/// taxa é a soma das unidades dentro da janela — sem histórico infinito.
#[derive(Debug)]
struct RateWindow {
    events: VecDeque<(Instant, u64)>,
    /// Duração da janela.
    window: Duration,
}

impl RateWindow {
    fn new() -> Self {
        Self {
            events: VecDeque::new(),
            window: Duration::from_secs(1),
        }
    }

    /// Soma `units` e descarta o que saiu da janela.
    fn add(&mut self, units: u64) {
        let now = Instant::now();
        self.events.push_back((now, units));
        while let Some((at, _)) = self.events.front() {
            if now.duration_since(*at) <= self.window {
                break;
            }
            self.events.pop_front();
        }
    }

    /// Zera a janela (troca de sessão).
    fn reset(&mut self) {
        self.events.clear();
    }

    /// Unidades por segundo dentro da janela.
    ///
    /// Divide pela duração **fixa** da janela: a taxa é "quantas unidades
    /// passaram nos últimos 1 s". Dividir pelo tempo decorrido daria
    /// milhares de fps nos primeiros milissegundos (3 frames em 50 µs).
    fn rate(&self) -> f32 {
        let now = Instant::now();
        let total: u64 = self
            .events
            .iter()
            .filter(|(at, _)| now.duration_since(*at) <= self.window)
            .map(|(_, count)| *count)
            .sum();
        total as f32 / self.window.as_secs_f32()
    }
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

/// Amostras do fade (fade-out do PLC e fade-in da retomada).
///
/// A rampa tem `FADE + 1` amostras: começa em `1.0` (ou `0.0`, no fade-in) e
/// termina exatamente em `0.0` (ou `1.0`) — assim não sobra degrau na
/// transição.
const FADE: usize = 64;

/// Teto do PLC: 3 frames = 30 ms a 48 kHz.
///
/// Acima disso o tempo é comprimido (o áudio real retoma antes), mas o áudio
/// **nunca** vira silêncio permanente.
const MAX_PLC_FRAMES: usize = 3;

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
    /// Última sequência **absoluta** aceita (u64) — high-water do stream.
    ///
    /// O celular conta em u32 e faz wrap depois de 2^32 frames (≈ 497 dias de
    /// stream). Sem "desenrolar" o contador, o wrap faria a sequência andar
    /// para trás e o buffer trataria o primeiro frame pós-wrap como perdido.
    last_abs: Option<u64>,
    /// `seq` cru (u32) correspondente a `last_abs` — base do desenrolamento.
    last_raw_seq: Option<u32>,
    /// Frames pendentes por sequência **absoluta** (u64).
    ///
    /// A chave é o `seq` do celular desenrolado: o wrap de u32 do emissor
    /// vira um incremento normal em vez de um salto para trás.
    pending: BTreeMap<u64, Vec<i16>>,
    /// Frame em reprodução (parcialmente consumido).
    current: Vec<i16>,
    /// Posição de leitura dentro de `current`.
    current_offset: usize,
    /// Próxima sequência **absoluta** esperada (u64).
    next_seq: Option<u64>,
    warm: bool,
    /// Amostras da cauda de `current` retidas até o próximo frame chegar.
    ///
    /// A cauda só pode ser liberada com a informação do frame seguinte:
    /// contíguo → toca cheia (nada muda); lacuna → toca com rampa 1→0
    /// (fade-out). Sem essa retenção, o degrau entre o último sample real e o
    /// silêncio do PLC vira clique audível.
    tail_hold: usize,
    /// Amostras da cauda ainda em fade-out (rampa 1→0, termina em 0 exato).
    fade_out_left: usize,
    /// Total de amostras da rampa de fade-out (normaliza o ganho).
    fade_out_total: usize,
    /// Amostras de PLC (silêncio) ainda a emitir.
    plc_left: usize,
    /// Frame real resgatado do `pending` durante uma lacuna — fica imune ao
    /// fast-forward enquanto o PLC toca.
    plc_next: Option<(u64, Vec<i16>)>,
    /// Amostras restantes da rampa de fade-in do frame retomado.
    fade_in_left: usize,
    /// Janela de 1 s com as amostras reproduzidas (base do FPS de playout).
    play_window: RateWindow,
    /// Janela de 1 s com os frames recebidos (base do FPS de recepção).
    recv_window: RateWindow,
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
            tail_hold: 0,
            fade_out_left: 0,
            fade_out_total: 0,
            plc_left: 0,
            plc_next: None,
            fade_in_left: 0,
            play_window: RateWindow::new(),
            recv_window: RateWindow::new(),
            metrics: JitterMetrics::default(),
            ts_deltas: VecDeque::with_capacity(100),
            last_capture_ts: None,
            last_push_seq: None,
            last_abs: None,
            last_raw_seq: None,
        }
    }

    /// Insere um frame recebido (atalho que usa `seq * frame_ms` como timestamp).
    pub fn push(&mut self, seq: u32, samples: Vec<i16>) {
        let capture_ts = seq.saturating_mul(self.frame_ms);
        self.push_with_ts(seq, capture_ts, samples);
    }

    /// Converte a sequência crua (u32) do emissor em sequência absoluta (u64).
    ///
    /// A conversão usa a diferença **com sinal** em relação ao high-water
    /// (`last_abs`): o wrap de u32 (`u32::MAX` → 0) vira `+1` em vez de um
    /// salto de 2^32 para trás. Frames atrasados (chegando fora de ordem)
    /// continuam mapeando para a posição correta e não movem o high-water.
    fn to_absolute(&mut self, seq: u32) -> u64 {
        let (Some(last_abs), Some(last_raw)) = (self.last_abs, self.last_raw_seq) else {
            self.last_abs = Some(u64::from(seq));
            self.last_raw_seq = Some(seq);
            return u64::from(seq);
        };

        // Diferença com sinal no domínio cru (i32): ±2^31 frames cobrem
        // qualquer reordenação real de rede.
        let diff = seq.wrapping_sub(last_raw) as i32;
        let candidate = if diff >= 0 {
            last_abs.saturating_add(diff as u64)
        } else {
            last_abs.saturating_sub(diff.unsigned_abs() as u64)
        };

        if candidate >= last_abs {
            self.last_abs = Some(candidate);
            self.last_raw_seq = Some(seq);
        }
        candidate
    }

    /// Insere um frame recebido com timestamp de captura explícito.
    ///
    /// Frames com sequência anterior à esperada são descartados (contados
    /// como perdidos). O alvo do jitter buffer é adaptado a partir do p95
    /// dos deltas de `capture_ts` (janela de 100 frames).
    pub fn push_with_ts(&mut self, seq: u32, capture_ts: u32, samples: Vec<i16>) {
        self.metrics.received += 1;
        self.recv_window.add(1);

        let mut abs = self.to_absolute(seq);

        if let Some(next) = self.next_seq {
            // Sequência absoluta: um frame atrasado tem `abs < next`.
            if abs < next {
                self.metrics.lost += 1;

                // Um salto para trás maior que a janela de reordenação não é
                // jitter: o emissor **reiniciou** a contagem (o serviço de
                // captura do celular foi recriado pelo Android — `START_STICKY`
                // — sem novo `hello`, logo sem `flush` no PC). Sem resync, todo
                // frame seguinte cairia em `seq < next` e seria descartado
                // para sempre: áudio mudo e perda ~100%.
                if (next - abs) as usize > self.max_frames {
                    self.resync();
                    // Reancora a linha do tempo no frame atual.
                    abs = self.to_absolute(seq);
                    self.next_seq = Some(abs);
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
                // `capture_ts` é monotônico (u32, wrap em ~50 dias): o delta
                // com wrap detectaria o salto. Deltas > 4× o frame são
                // outliers (salto de relógio) e não entram na janela.
                let delta = capture_ts.wrapping_sub(prev);
                if delta > 0 && delta <= self.frame_ms.saturating_mul(4) {
                    self.ts_deltas.push_back(delta);
                    if self.ts_deltas.len() > 100 {
                        self.ts_deltas.pop_front();
                    }
                    self.adapt_target();
                }
            }
        }
        self.last_capture_ts = Some(capture_ts);
        self.last_push_seq = Some(seq);

        self.pending.insert(abs, samples);

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

    /// Reancora o buffer depois de uma quebra de sequência.
    ///
    /// Descarta o que estava pendurado e zera o contador absoluto: o próximo
    /// frame recebido vira a nova referência, **sem** desaquecer (a reprodução
    /// continua imediatamente — não há razão para pagar o warmup de novo
    /// quando o fluxo apenas recomeçou).
    fn resync(&mut self) {
        self.pending.clear();
        self.reset_playback();
        self.next_seq = None;
        self.last_abs = None;
        self.last_raw_seq = None;
        self.ts_deltas.clear();
        self.last_capture_ts = None;
        self.last_push_seq = None;
        self.metrics.resyncs += 1;
        self.metrics.buffer_ms = 0;
    }

    /// Adapta `target_frames` com base no jitter medido (2..=8 frames).
    ///
    /// Usa o **p95** dos deltas da janela (não o máximo): um pico isolado não
    /// deve inflar o alvo para 80 ms. Deltas acima de 4× `frame_ms` já foram
    /// descartados como outlier na inserção (salto de relógio).
    fn adapt_target(&mut self) {
        if self.ts_deltas.len() < 2 {
            return;
        }
        let mut sorted: Vec<u32> = self.ts_deltas.iter().copied().collect();
        sorted.sort_unstable();
        // p95: rank ceil(0.95 * n) - 1 (0-indexado).
        let rank = ((sorted.len() * 95).div_ceil(100)).saturating_sub(1);
        let p95 = sorted[rank.min(sorted.len() - 1)];
        let jitter_ms = p95.saturating_sub(self.frame_ms);
        // Cada frame de jitter além do frame_ms adiciona ~1 frame de folga.
        let extra = (jitter_ms / self.frame_ms.max(1)) as usize;
        let new_target = (3 + extra).clamp(2, 8);
        self.target_frames = new_target.min(self.max_frames).max(1);
    }

    /// Preenche `out` com amostras mono contínuas.
    ///
    /// O buffer é sempre preenchido por inteiro: as lacunas viram PLC
    /// (silêncio com fade) e a falta de dados vira silêncio, de modo que o
    /// sink sempre recebe um fluxo contínuo (sem trancos) na taxa de origem.
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
            // 1) Fade-out da cauda retida: rampa 1→0 (termina em 0 exato).
            //    Vem antes do PLC porque é a transição *para* o silêncio.
            if self.fade_out_left > 0 {
                let take = (out.len() - written)
                    .min(self.fade_out_left)
                    .min(self.current.len() - self.current_offset);
                let total = self.fade_out_total;
                for i in 0..take {
                    let remaining = self.fade_out_left - i;
                    let gain = if total > 1 {
                        (remaining - 1) as f32 / (total - 1) as f32
                    } else {
                        0.0
                    };
                    let sample = self.current[self.current_offset + i];
                    out[written + i] = (sample as f32 * gain) as i16;
                }
                written += take;
                self.current_offset += take;
                self.fade_out_left -= take;
                continue;
            }

            // 2) PLC: silêncio puro (já zerado por `out.fill(0)`).
            if self.plc_left > 0 {
                let take = (out.len() - written).min(self.plc_left);
                written += take;
                self.plc_left -= take;
                continue;
            }

            // 3) Reprodução do frame atual (fade-in na retomada).
            let playable = self.current.len().saturating_sub(self.tail_hold);
            if self.current_offset < playable {
                let take = (out.len() - written).min(playable - self.current_offset);
                if self.fade_in_left > 0 {
                    let ramp = take.min(self.fade_in_left);
                    for i in 0..ramp {
                        // Ganho subindo de 1/FADE até 1: a retomada entra
                        // suavemente depois do silêncio do PLC.
                        let gain = (FADE - self.fade_in_left + 1) as f32 / FADE as f32;
                        let sample = self.current[self.current_offset + i];
                        out[written + i] = (sample as f32 * gain) as i16;
                        self.fade_in_left -= 1;
                    }
                    out[written + ramp..written + take].copy_from_slice(
                        &self.current[self.current_offset + ramp..self.current_offset + take],
                    );
                } else {
                    out[written..written + take].copy_from_slice(
                        &self.current[self.current_offset..self.current_offset + take],
                    );
                }
                written += take;
                self.current_offset += take;
                continue;
            }

            // 4) Fim do frame: decide o que vem a seguir.
            if self.tail_hold > 0 {
                let Some(&available) = self.pending.keys().next() else {
                    // Nada pendente: a cauda toca cheia (não há lacuna
                    // conhecida para fading) e o underrun cobre o resto.
                    self.tail_hold = 0;
                    continue;
                };
                let expected = self.next_seq.unwrap_or(available);
                if available < expected {
                    // Frame atrasado que escapou do filtro do `push`: descarta
                    // em vez de tocar fora de ordem.
                    self.pending.remove(&available);
                    self.metrics.lost += 1;
                    continue;
                }
                let gap = available - expected;
                if gap == 0 {
                    // Contíguo: a cauda toca cheia (nada muda).
                    self.tail_hold = 0;
                    continue;
                }
                // Lacuna real: os frames `expected..available` não chegaram a
                // tempo. Conta a perda, resgata o frame real (imune ao
                // fast-forward) e programa o PLC limitado.
                //
                // O PLC substitui o buraco por silêncio **e** consome o frame
                // disponível: ficar `gap_frames` callbacks mudo sem consumir
                // nada era um loop sem saída — durante o silêncio os frames
                // continuam chegando em tempo real, o fast-forward descarta os
                // mais antigos e `available` está de novo à frente de `next`:
                // outra lacuna, outro silêncio, para sempre (perda ~90%).
                self.metrics.gaps += gap;
                let real = self.pending.remove(&available);
                self.next_seq = Some(available.wrapping_add(1));
                self.fade_out_total = self.tail_hold;
                self.fade_out_left = self.tail_hold;
                self.tail_hold = 0;
                let gap_frames = usize::try_from(gap).unwrap_or(usize::MAX);
                self.plc_left = gap_frames.min(MAX_PLC_FRAMES) * self.frame_samples;
                self.plc_next = real.map(|samples| (available, samples));
                continue;
            }

            // 5) Pega o próximo frame: o resgatado do PLC (com fade-in) ou o
            //    primeiro pendente.
            if let Some((seq, samples)) = self.plc_next.take() {
                self.current = samples;
                self.current_offset = 0;
                self.tail_hold = FADE.min(self.current.len());
                self.fade_in_left = FADE.min(self.current.len());
                self.next_seq = Some(seq.wrapping_add(1));
                continue;
            }
            let Some(&available) = self.pending.keys().next() else {
                underrun = true;
                self.metrics.underruns += 1;
                self.metrics.buffer_ms = 0;
                // Sem dados: perde a referência de sequência. O próximo frame
                // que chegar reancora o buffer em vez de virar uma lacuna
                // gigante (o buraco foi do sink, não da rede).
                self.next_seq = None;
                break;
            };
            let samples = self.pending.remove(&available).expect("frame pendente");
            self.current = samples;
            self.current_offset = 0;
            self.tail_hold = FADE.min(self.current.len());
            self.next_seq = Some(available.wrapping_add(1));
            self.metrics.buffer_ms = (self.pending.len() as u32) * self.frame_ms;
        }

        self.play_window.add(written as u64);

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

    /// Zera o estado de reprodução: frame em curso, cauda retida, fades e
    /// PLC pendente.
    fn reset_playback(&mut self) {
        self.current.clear();
        self.current_offset = 0;
        self.tail_hold = 0;
        self.fade_out_left = 0;
        self.fade_out_total = 0;
        self.plc_left = 0;
        self.plc_next = None;
        self.fade_in_left = 0;
    }

    /// Esvazia o buffer (troca de sessão ou reset do stream).
    pub fn flush(&mut self) {
        self.pending.clear();
        self.reset_playback();
        self.warm = false;
        self.next_seq = None;
        self.ts_deltas.clear();
        self.last_capture_ts = None;
        self.last_push_seq = None;
        self.play_window.reset();
        self.recv_window.reset();
        self.metrics.flushes += 1;
        self.metrics.buffer_ms = 0;
    }

    /// Snapshot das métricas.
    #[must_use]
    pub fn metrics(&self) -> JitterMetrics {
        let mut metrics = self.metrics;
        metrics.received_fps = self.received_fps();
        metrics
    }

    /// Conta um datagrama descartado na origem (IP sem sessão de controle).
    pub fn note_rejected(&mut self) {
        self.metrics.rejected += 1;
    }

    /// Frames reproduzidos por segundo (janela de 1 s).
    #[must_use]
    pub fn fps(&self) -> f32 {
        if self.frame_samples == 0 {
            return 0.0;
        }
        self.play_window.rate() / self.frame_samples as f32
    }

    /// Frames recebidos por segundo (janela de 1 s).
    ///
    /// Diagnostica a rede: o playout é fixo em 48 kHz, então só a taxa de
    /// recepção mostra se o celular está chegando no ritmo certo.
    #[must_use]
    pub fn received_fps(&self) -> f32 {
        self.recv_window.rate()
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

    /// Lacuna: conta a perda, preenche o buraco com PLC e retoma o áudio real.
    ///
    /// O buraco não é mais pulado (descontinuidade = clique): vira silêncio, e
    /// o frame real toca em seguida.
    #[test]
    fn lacuna_conta_a_perda_e_retoma_o_audio_real() {
        let mut buffer = buffer();
        buffer.push(0, frame(0));
        buffer.push(1, frame(1));
        buffer.push(3, frame(3)); // falta o 2

        let mut out = vec![0_i16; FRAME];
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert_eq!(out[0], 0);
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert_eq!(out[0], 1);

        // A lacuna (1 frame) vira PLC: silêncio de 1 frame.
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert!(out.iter().all(|s| *s == 0), "esperava o PLC em silêncio");
        assert_eq!(buffer.metrics().gaps, 1);

        // O frame real toca em seguida (com fade-in).
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert_eq!(out[63], 3, "o frame real deveria retomar");
    }

    /// O PLC é limitado a 3 frames (30 ms): acima disso o tempo é comprimido,
    /// mas o áudio real continua — silêncio permanente é pior que salto.
    #[test]
    fn plc_limita_o_silencio_e_retoma_o_audio() {
        let mut buffer = buffer();
        buffer.push(0, frame(0));
        buffer.push(51, frame(51)); // faltam 50 frames
        buffer.push(52, frame(52));
        buffer.push(53, frame(53));

        let mut out = vec![0_i16; FRAME];
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert_eq!(buffer.metrics().gaps, 50, "os 50 frames perdidos contam");

        // No máximo 3 frames de PLC (30 ms).
        let mut silencio = 0;
        for _ in 0..3 {
            assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
            if out.iter().all(|s| *s == 0) {
                silencio += 1;
            }
        }
        assert_eq!(silencio, 3, "o PLC deveria ter coberto 3 frames");

        // O frame real toca logo depois.
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert_eq!(out[63], 51);
    }

    /// O fade evita o clique: a cauda some com rampa 1→0 (terminando em 0
    /// exato) e o frame retomado entra com rampa 0→1.
    #[test]
    fn plc_faz_fade_sem_clique() {
        const AMPLITUDE: i16 = 8_000;
        let mut buffer = buffer();
        buffer.push(0, frame(AMPLITUDE));
        buffer.push(2, frame(AMPLITUDE)); // falta o 1
        buffer.push(3, frame(AMPLITUDE));
        buffer.push(4, frame(AMPLITUDE));

        let mut out = vec![0_i16; FRAME];
        // Frame 0 (416 amostras) + cauda em fade-out (64 amostras).
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert_eq!(out[FRAME - 1], 0, "o fade-out tem de terminar em 0");
        let maior_salto = out[1..]
            .windows(2)
            .map(|w| i32::from(w[1]) - i32::from(w[0]))
            .map(i32::abs)
            .max()
            .unwrap_or(0);
        assert!(
            maior_salto <= i32::from(AMPLITUDE) / 4,
            "degrau de {maior_salto} na rampa de fade-out"
        );

        // PLC: silêncio puro.
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert!(out.iter().all(|s| *s == 0));

        // Retomada: o primeiro sample entra pelo fade-in (degrau pequeno).
        assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
        assert!(
            u32::from(out[0].unsigned_abs()) <= u32::from(AMPLITUDE.unsigned_abs()) / 4,
            "o fade-in não suavizou a retomada: {}",
            out[0]
        );
    }

    /// O PLC preserva a linha do tempo: cada frame perdido vira exatamente
    /// 1 frame de PLC, então o playout cobre os mesmos 200 frames que o
    /// celular enviou (nada de salto, nada de atraso acumulado).
    #[test]
    fn plc_preserva_a_linha_do_tempo() {
        let mut buffer = buffer();
        let mut out = vec![0_i16; FRAME];
        let mut proximo = 0_u32; // próximo frame a enviar
        let mut silencios = 0;

        for tocados in 0..200_u32 {
            // O celular mantém 3 frames de lead (o jitter buffer fica ~30 ms
            // fundo, como no sistema real) e continua mandando depois dos
            // 200 slots: sem um frame posterior, a perda do último não é
            // detectável como lacuna (viraria underrun).
            while proximo < 205 && proximo <= tocados + 3 {
                if proximo % 5 != 4 {
                    buffer.push(proximo, frame((proximo % 50 + 1) as i16));
                }
                proximo += 1;
            }

            assert_eq!(
                buffer.pop_into(&mut out),
                PopStatus::Data,
                "underrun no frame {tocados}"
            );
            if out.iter().all(|s| *s == 0) {
                silencios += 1;
            }
        }

        // 200 slots de timeline: 160 frames reais + 40 de PLC.
        assert_eq!(
            silencios, 40,
            "cada frame perdido tem de virar 1 frame de PLC"
        );
        assert_eq!(buffer.metrics().gaps, 40);

        // Sobrou só a folga do buffer (nada acumulou).
        let mut extra = 0;
        while buffer.pop_into(&mut out) != PopStatus::Underrun {
            extra += 1;
        }
        assert!(extra <= 5, "o buffer acumulou {extra} frames de sobra");
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

    /// O FPS precisa ser uma **janela** de 1 s, não uma média desde o boot.
    ///
    /// Média desde o boot nunca volta a zero: uma sessão de 10 min deixa o
    /// número contaminado para sempre, e o painel mostra "100 fps" num
    /// pipeline parado. A janela zera entre sessões (o `flush` marca a troca
    /// de celular) e acompanha o ritmo real de chegada.
    #[test]
    fn fps_e_rolante_e_zera_entre_sessoes() {
        let mut buffer = buffer();
        let mut out = vec![0_i16; FRAME];

        // 100 frames de 10 ms = 1 s de áudio (o warmup consome 2 dos 100
        // callbacks, então 98 frames saem para o sink).
        for seq in 0..100_u32 {
            buffer.push(seq, frame(1));
            buffer.pop_into(&mut out);
        }

        let fps = buffer.fps();
        let received = buffer.received_fps();
        assert!(
            (fps - 98.0).abs() < 2.0,
            "fps de playout fora do esperado: {fps}"
        );
        assert!(
            (received - 100.0).abs() < 1.0,
            "fps de recepção fora do esperado: {received}"
        );

        // Troca de sessão: o buffer esvazia e as janelas zeram.
        buffer.flush();
        assert_eq!(buffer.fps(), 0.0, "fps não zerou após o flush");
        assert_eq!(
            buffer.received_fps(),
            0.0,
            "fps de recepção não zerou após o flush"
        );
    }

    /// Um salto de relógio não pode inflar o alvo do jitter buffer.
    ///
    /// Com `max` na janela de deltas, um único outlier (NTP ajustando o
    /// relógio, celular hibernando) empurrava o alvo para 8 frames (80 ms) —
    /// 50 ms de latência jogados fora por causa de **um** frame ruim. O p95
    /// ignora a cauda, e deltas acima de 4× `frame_ms` nem entram na janela.
    #[test]
    fn salto_de_relogio_nao_inflata_o_alvo() {
        let mut buffer = buffer();
        let mut out = vec![0_i16; FRAME];

        // 20 frames regulares: deltas de 10 ms.
        for seq in 0..20_u32 {
            buffer.push_with_ts(seq, seq * 10, frame(0));
            buffer.pop_into(&mut out);
        }
        assert!(
            buffer.target_frames() <= 3,
            "alvo já inflado antes do salto: {}",
            buffer.target_frames()
        );

        // Salto de relógio: 1 s → 1.000 s (delta de ~1.000 s).
        buffer.push_with_ts(20, 1_000_000, frame(0));
        buffer.pop_into(&mut out);

        assert!(
            buffer.target_frames() <= 3,
            "o salto de relógio inflou o alvo para {} frames",
            buffer.target_frames()
        );
    }

    /// O wrap de u32 do contador do celular não pode virar lacuna.
    ///
    /// O celular conta em u32: depois de 2^32 frames (≈ 497 dias de stream)
    /// o `seq` volta a 0. Sem desenrolar o contador, o primeiro frame pós-wrap
    /// pareceria um salto para trás de 4 bilhões de frames → resync, perda
    /// contabilizada e áudio cortado.
    #[test]
    fn wrap_de_u32_nao_gera_gap() {
        let mut buffer = buffer();
        let mut out = vec![0_i16; FRAME];

        // Últimos frames antes do wrap.
        for seq in [u32::MAX - 2, u32::MAX - 1, u32::MAX] {
            buffer.push_with_ts(seq, 1_000, frame(seq as i16));
        }

        // Pós-wrap: o contador volta a 0.
        for seq in 0..3_u32 {
            buffer.push_with_ts(seq, 1_100, frame(seq as i16));
        }

        assert_eq!(buffer.metrics().gaps, 0, "o wrap não pode virar lacuna");
        assert_eq!(buffer.metrics().lost, 0, "o wrap não pode virar perda");
        assert_eq!(buffer.metrics().resyncs, 0, "o wrap não pode reancorar");

        // Os 6 frames saem em ordem (3 antes + 3 depois do wrap).
        // Os valores são `seq as i16`: 0xFFFFFFFD → -3, 0xFFFFFFFE → -2,
        // 0xFFFFFFFF → -1 e depois 0, 1, 2.
        for expected in [-3_i16, -2, -1, 0, 1, 2] {
            assert_eq!(buffer.pop_into(&mut out), PopStatus::Data);
            assert_eq!(out[0], expected, "esperava o frame {expected}");
        }
    }
}
