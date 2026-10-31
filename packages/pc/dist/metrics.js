const round1 = (n) => Math.round(n * 10) / 10;
export class MetricsCollector {
    startedAt = Date.now();
    prevAt = this.startedAt;
    prevReceived = 0;
    prevLost = 0;
    last = null;
    /** Atualiza a janela e devolve o snapshot. Deve ser chamado a ~1 Hz. */
    update(received, jitter) {
        const now = Date.now();
        const windowMs = Math.max(1, now - this.prevAt);
        const dReceived = Math.max(0, received - this.prevReceived);
        const dLost = Math.max(0, jitter.lost - this.prevLost);
        const elapsedS = Math.max(0.001, (now - this.startedAt) / 1000);
        const snapshot = {
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
    peek(jitter) {
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
    reset() {
        this.startedAt = Date.now();
        this.prevAt = this.startedAt;
        this.prevReceived = 0;
        this.prevLost = 0;
        this.last = null;
    }
}
