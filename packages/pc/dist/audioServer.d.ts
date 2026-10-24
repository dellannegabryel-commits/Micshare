export declare function checkVBCableAvailable(): boolean;
export interface ServerConfig {
    audioPort?: number;
    deviceSubstring?: string;
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
    private sessionCount;
    private lastStatsLine;
    private statsUpdateInterval;
    constructor(config?: ServerConfig);
    private setupErrorHandlers;
    start(): Promise<void>;
    private onSessionEnd;
    private printStatusLine;
    maybeLogStats(): void;
    stop(): void;
}
