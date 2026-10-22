export interface MetricsSnapshot {
  received: number;
  lost: number;
  lossPct: number;
  gaps: number;
  bufferMs: number;
  underruns: number;
  fastForwards: number;
  flushes: number;
  fps: number;
}

export class MetricsCollector {
  private received = 0;
  private lastReceived = 0;
  private start = Date.now();

  update(jitterReceived: number, jitterMetrics: { lost: number; gaps: number; bufferMs: number; underruns: number; fastForwards: number; flushes: number }): MetricsSnapshot {
    const now = Date.now();
    const elapsed = (now - this.start) / 1000;
    this.received = jitterReceived;
    const fps = elapsed > 0 ? this.received / elapsed : 0;
    const lossPct = this.received > 0 ? (jitterMetrics.lost / this.received) * 100 : 0;

    const snapshot: MetricsSnapshot = {
      received: this.received,
      lost: jitterMetrics.lost,
      lossPct: Math.round(lossPct * 10) / 10,
      gaps: jitterMetrics.gaps,
      bufferMs: jitterMetrics.bufferMs,
      underruns: jitterMetrics.underruns,
      fastForwards: jitterMetrics.fastForwards,
      flushes: jitterMetrics.flushes,
      fps: Math.round(fps * 10) / 10,
    };
    this.lastReceived = jitterReceived;
    return snapshot;
  }
}
