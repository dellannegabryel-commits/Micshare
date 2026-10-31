import type { SessionInfo } from './serverState.js';
export interface ControlConfig {
    port: number;
    /** porta de áudio anunciada no welcome (precisa refletir --port) */
    audioPort: number;
    targetBufferMs?: number;
    /** quando definido, o hello precisa trazer o mesmo token */
    pairingCode?: string;
    requirePairing?: boolean;
    onHello: (session: SessionInfo) => void;
    onMute: (value: boolean) => void;
    onVolume: (value: number) => void;
    onBye: (sessionId: string) => void;
    onError?: (err: Error) => void;
}
export declare class ControlServer {
    private config;
    private wss;
    private sessions;
    private disconnects;
    constructor(config: ControlConfig);
    start(): void;
    listSessions(): SessionInfo[];
    /** Liga/desliga a exigência de pareamento em runtime. */
    setPairing(enabled: boolean, code: string): void;
    isPairingEnabled(): boolean;
    sessionCount(): number;
    /** Encerra uma sessão (ou todas) enviando `bye`. Devolve quantas foram fechadas. */
    disconnect(target?: string): number;
    broadcastStats(stats: {
        lossPct: number;
        bufferMs: number;
        seqGaps: number;
    }): void;
    stop(): Promise<void>;
    private handleHello;
}
