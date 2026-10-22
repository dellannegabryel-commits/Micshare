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
export declare class MetricsCollector {
    private received;
    private lastReceived;
    private start;
    update(jitterReceived: number, jitterMetrics: {
        lost: number;
        gaps: number;
        bufferMs: number;
        underruns: number;
        fastForwards: number;
        flushes: number;
    }): MetricsSnapshot;
}
