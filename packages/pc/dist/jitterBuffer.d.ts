export interface JitterMetrics {
    received: number;
    lost: number;
    gaps: number;
    bufferMs: number;
    underruns: number;
    fastForwards: number;
    flushes: number;
}
export interface JitterConfig {
    targetMinFrames: number;
    targetMaxFrames: number;
    maxDepthMs: number;
    plcMaxFrames: number;
}
export declare class JitterBuffer {
    private buffer;
    private seqs;
    private nextExpectedSeq;
    private lastCaptureTs;
    private targetFrames;
    private maxDepthMs;
    private readPos;
    private metrics;
    private now;
    constructor(config?: Partial<JitterConfig>, now?: () => number);
    push(seq: number, captureTs: number, payload: Buffer): boolean;
    pop(): Buffer | null;
    depth(): number;
    getMetrics(): JitterMetrics;
    private adaptTarget;
    private trimDepth;
}
export declare class JitterMetrics {
}
