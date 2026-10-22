// Protocol constants shared between mobile client and PC server.
// All numbers are big-endian on the wire.

export const MAGIC = 0x4d53; // "MS"
export const VERSION = 1;

export const AUDIO_PORT = 41235;
export const BEACON_PORT = 41234;
export const CTRL_PORT = 41236;

export const HEADER_SIZE = 16;
export const MAX_PAYLOAD_LEN = 1472 - HEADER_SIZE; // fits in one IP packet (MTU 1500, no fragmentation)

export const FLAG_SILENCE = 0x01; // payload is comfort noise / PLC placeholder
export const FLAG_MUTED = 0x02;   // sender muted at capture time

export const CODEC_PCM_S16LE = 0;
export const CODEC_OPUS = 1;

// Audio frame layout (48 kHz mono, 10 ms = 480 samples = 960 bytes payload)
export const SAMPLE_RATE = 48000;
export const FRAME_MS = 10;
export const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_MS) / 1000; // 480
export const PCM_BYTES_PER_FRAME = SAMPLES_PER_FRAME * 2; // int16

export const WS_MAX_MESSAGE_BYTES = 1024;
