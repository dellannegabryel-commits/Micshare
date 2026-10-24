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
    private started;
    constructor(config?: ServerConfig);
    private setupErrorHandlers;
    start(): Promise<void>;
    private maybeLogStats;
    stop(): void;
}
