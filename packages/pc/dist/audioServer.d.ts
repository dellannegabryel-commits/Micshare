export interface ServerConfig {
    audioPort?: number;
    deviceSubstring?: string;
    pairingCode?: string;
    verbose?: boolean;
    name?: string;
}
export declare class AudioServer {
    private config;
    private socket;
    private jitter;
    private metrics;
    private sink;
    private control;
    private sinkInterval;
    private beacon;
    constructor(config?: ServerConfig);
    start(): Promise<void>;
    private maybeLogStats;
    stop(): void;
}
