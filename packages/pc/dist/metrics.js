export class MetricsCollector {
    received = 0;
    lastReceived = 0;
    start = Date.now();
    update(jitterReceived, jitterMetrics) {
        const now = Date.now();
        const elapsed = (now - this.start) / 1000;
        this.received = jitterReceived;
        const fps = elapsed > 0 ? this.received / elapsed : 0;
        const lossPct = this.received > 0 ? (jitterMetrics.lost / this.received) * 100 : 0;
        const snapshot = {
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
