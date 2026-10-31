import type { DeviceInfo } from './serverState.js';
export interface SinkConfig {
    deviceSubstring?: string;
    sampleRate?: number;
    frameMs?: number;
}
export declare class AudioSink {
    private config;
    private audioOutput;
    private closed;
    private gain;
    private device;
    private requested;
    private scratch;
    constructor(config?: SinkConfig);
    static listDevices(): Promise<DeviceInfo[]>;
    open(deviceSubstring?: string): Promise<void>;
    /** Reabre o sink; em caso de falha, volta para o dispositivo anterior. */
    reopen(deviceSubstring?: string): Promise<DeviceInfo>;
    currentDevice(): DeviceInfo | null;
    requestedDevice(): string | null;
    setGain(gain: number): number;
    getGain(): number;
    write(samples: Int16Array): void;
    writeSilence(): void;
    close(): void;
    private pick;
}
