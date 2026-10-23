export interface SinkConfig {
    deviceSubstring?: string;
    sampleRate?: number;
    frameMs?: number;
}
export declare class AudioSink {
    private config;
    private audioOutput;
    private buffer;
    private closed;
    private maxBufferFrames;
    constructor(config?: SinkConfig);
    open(): Promise<void>;
    write(samples: Int16Array): void;
    writeSilence(): void;
    close(): void;
}
