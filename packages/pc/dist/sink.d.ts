export interface SinkConfig {
    deviceSubstring?: string;
    sampleRate?: number;
    frameMs?: number;
    forceFfplay?: boolean;
}
export declare class AudioSink {
    private config;
    private proc;
    private stream;
    private closed;
    constructor(config?: SinkConfig);
    open(): Promise<void>;
    private openFfplay;
    write(samples: Int16Array): void;
    writeSilence(): void;
    close(): void;
}
