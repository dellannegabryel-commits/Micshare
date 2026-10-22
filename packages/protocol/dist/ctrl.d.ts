export interface Hello {
    t: 'hello';
    v: number;
    token: string;
    sampleRate: number;
    channels: number;
    codec: 'pcm16' | 'opus';
    frameMs: number;
}
export interface Welcome {
    t: 'welcome';
    sessionId: string;
    audioPort: number;
    targetBufferMs: number;
}
export interface Mute {
    t: 'mute';
    value: boolean;
}
export interface Volume {
    t: 'volume';
    value: number;
}
export interface Bye {
    t: 'bye';
}
export interface Stats {
    t: 'stats';
    lossPct: number;
    bufferMs: number;
    seqGaps: number;
    reconnects: number;
}
export interface ErrorMsg {
    t: 'error';
    code: string;
    message: string;
}
export type CtrlMessage = Hello | Welcome | Mute | Volume | Bye | Stats | ErrorMsg;
export interface ParseResult {
    message: CtrlMessage | null;
    error: string | null;
}
export declare function parseCtrl(text: string): ParseResult;
export declare function encodeCtrl(message: CtrlMessage): string;
