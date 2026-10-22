export interface AudioFrameHeader {
    seq: number;
    captureTs: number;
    flags: number;
    payloadLen: number;
    channels: number;
    codec: number;
}
export interface AudioFrame extends AudioFrameHeader {
    payload: Buffer;
}
export interface DecodedFrame {
    header: AudioFrameHeader;
    payload: Buffer;
    offset: number;
}
export declare function encodeAudioFrame(frame: AudioFrame): Buffer;
export declare function decodeAudioFrame(buf: Buffer): DecodedFrame | null;
export declare function isMuteFlag(flags: number): boolean;
export declare function isSilenceFlag(flags: number): boolean;
