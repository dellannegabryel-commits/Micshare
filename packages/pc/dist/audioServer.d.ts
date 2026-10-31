import { type DeviceInfo, type ServerStatus, type SessionInfo } from './serverState.js';
export type RestartScope = 'sink' | 'control' | 'beacon' | 'all';
export interface ServerConfig {
    audioPort?: number;
    controlPort?: number;
    beaconPort?: number;
    deviceSubstring?: string;
    verbose?: boolean;
    name?: string;
    pairingCode?: string;
    requirePairing?: boolean;
    beaconIntervalMs?: number;
}
/** true se houver uma saída de áudio que pareça ser o cabo virtual. */
export declare function checkVBCableAvailable(): Promise<boolean>;
export declare class AudioServer {
    private config;
    private socket;
    private jitter;
    private metrics;
    private sink;
    private control;
    private sinkInterval;
    private statsInterval;
    private beacon;
    private started;
    private startedAt;
    private mute;
    private volume;
    private sessions;
    private currentCodec;
    private opusDecoder;
    private hostname;
    constructor(config?: ServerConfig);
    start(): Promise<void>;
    /** Shutdown gracioso: fecha timers, áudio, controle, beacon e UDP. */
    stop(): Promise<void>;
    /**
     * Reinicia parte do servidor sem derrubar o processo.
     * - sink: reabre apenas a saída de áudio
     * - control: fecha e reabre o WebSocket
     * - beacon: fecha e reabre o beacon
     * - all: shutdown completo + start (o cliente reconecta pelo beacon)
     */
    restart(scope?: RestartScope): Promise<void>;
    setMute(value: boolean): boolean;
    toggleMute(): boolean;
    isMuted(): boolean;
    setVolume(value: number): number;
    getVolume(): number;
    /** Troca o dispositivo de saída em runtime. */
    setDevice(substring: string): Promise<DeviceInfo>;
    /** Encerra uma sessão (ou todas). Devolve quantas foram fechadas. */
    disconnect(target?: string): number;
    setPairing(enabled: boolean, code?: string): Promise<void>;
    setBeaconEnabled(enabled: boolean): void;
    setBeaconInterval(ms: number): void;
    getPairing(): {
        enabled: boolean;
        code: string;
    };
    getStatus(): ServerStatus;
    getSessions(): SessionInfo[];
    getMetrics(): import("./metrics.js").MetricsSnapshot;
    getJitterMetrics(): import("./jitterBuffer.js").JitterMetrics;
    isRunning(): boolean;
    private audioPort;
    private controlPort;
    private tickStats;
    private onSessionStart;
    private onSessionEnd;
    private setupProcessHandlers;
}
