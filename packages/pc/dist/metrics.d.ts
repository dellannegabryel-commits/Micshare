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
export declare class MetricsCollector {
    private startedAt;
    private prevAt;
    private prevReceived;
    private prevLost;
    private last;
    /** Atualiza a janela e devolve o snapshot. Deve ser chamado a ~1 Hz. */
    update(received: number, jitter: JitterMetrics): MetricsSnapshot;
    /**
     * Snapshot sem avançar a janela: contadores atuais + última taxa medida.
     * Usado por `status`, que pode ser chamado a qualquer momento.
     */
    peek(jitter: JitterMetrics): MetricsSnapshot;
    reset(): void;
}
