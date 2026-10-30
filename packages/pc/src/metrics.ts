// Coleta de métricas com duas janelas:
//  - janela curta (desde o último update): fps/loss "agora", para o operador
//  - acumulada (desde o boot): fpsAvg/lossPctAvg, para relatório
import type { JitterMetrics } from './jitterBuffer.js';

export interface MetricsSnapshot {
  received: number;
  lost: number;
  gaps: number;
  bufferMs: number;
  underruns: number;
  fastForwards: number;
  flushes: number;
  /** fps na janela desde o último update (≈1 s) */
  fps: number;
  /** % de perda na janela desde o último update */
  lossPct: number;
  /** fps médio desde o boot */
  fpsAvg: number;
  /** % de perda desde o boot */
  lossPctAvg: number;
  /** duração da janela medida, em ms */
  windowMs: number;
  updatedAt: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export class MetricsCollector {
  private startedAt = Date.now();
  private prevAt = this.startedAt;
  private prevReceived = 0;
  private prevLost = 0;
  private last: MetricsSnapshot | null = null;

  /** Atualiza a janela e devolve o snapshot. Deve ser chamado a ~1 Hz. */
  update(received: number, jitter: JitterMetrics): MetricsSnapshot {
    const now = Date.now();
    const windowMs = Math.max(1, now - this.prevAt);
    const dReceived = Math.max(0, received - this.prevReceived);
    const dLost = Math.max(0, jitter.lost - this.prevLost);
    const elapsedS = Math.max(0.001, (now - this.startedAt) / 1000);

    const snapshot: MetricsSnapshot = {
      received,
      lost: jitter.lost,
      gaps: jitter.gaps,
      bufferMs: jitter.bufferMs,
      underruns: jitter.underruns,
      fastForwards: jitter.fastForwards,
      flushes: jitter.flushes,
      fps: round1((dReceived * 1000) / windowMs),
      lossPct: round1(dReceived + dLost > 0 ? (dLost / (dReceived + dLost)) * 100 : 0),
      fpsAvg: round1(received / elapsedS),
      lossPctAvg: round1(received > 0 ? (jitter.lost / received) * 100 : 0),
      windowMs,
      updatedAt: now,
    };

    this.prevAt = now;
    this.prevReceived = received;
    this.prevLost = jitter.lost;
    this.last = snapshot;
    return snapshot;
  }

  /**
   * Snapshot sem avançar a janela: contadores atuais + última taxa medida.
   * Usado por `status`, que pode ser chamado a qualquer momento.
   */
  peek(jitter: JitterMetrics): MetricsSnapshot {
    const now = Date.now();
    const elapsedS = Math.max(0.001, (now - this.startedAt) / 1000);
    const base = this.last;
    return {
      received: jitter.received,
      lost: jitter.lost,
      gaps: jitter.gaps,
      bufferMs: jitter.bufferMs,
      underruns: jitter.underruns,
      fastForwards: jitter.fastForwards,
      flushes: jitter.flushes,
      fps: base?.fps ?? round1(jitter.received / elapsedS),
      lossPct: base?.lossPct ?? 0,
      fpsAvg: round1(jitter.received / elapsedS),
      lossPctAvg: round1(jitter.received > 0 ? (jitter.lost / jitter.received) * 100 : 0),
      windowMs: base?.windowMs ?? Math.round(now - this.startedAt),
      updatedAt: base?.updatedAt ?? this.startedAt,
    };
  }

  reset(): void {
    this.startedAt = Date.now();
    this.prevAt = this.startedAt;
    this.prevReceived = 0;
    this.prevLost = 0;
    this.last = null;
  }
}
