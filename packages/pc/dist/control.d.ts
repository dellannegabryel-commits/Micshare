export interface ControlConfig {
    port: number;
    onMute: (value: boolean) => void;
    onVolume: (value: number) => void;
    onBye: (sessionId: string) => void;
    onHello?: (sessionId: string) => void;
}
export declare class ControlServer {
    private config;
    private wss;
    private sessions;
    private reconnects;
    constructor(config: ControlConfig);
    start(): void;
    broadcastStats(stats: {
        lossPct: number;
        bufferMs: number;
        seqGaps: number;
        reconnects: number;
    }): void;
    stop(): void;
}
