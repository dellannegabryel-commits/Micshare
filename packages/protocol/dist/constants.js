"use strict";
// Protocol constants shared between mobile client and PC server.
// All numbers are big-endian on the wire.
Object.defineProperty(exports, "__esModule", { value: true });
exports.WS_MAX_MESSAGE_BYTES = exports.PCM_BYTES_PER_FRAME = exports.SAMPLES_PER_FRAME = exports.FRAME_MS = exports.SAMPLE_RATE = exports.CODEC_OPUS = exports.CODEC_PCM_S16LE = exports.FLAG_MUTED = exports.FLAG_SILENCE = exports.MAX_PAYLOAD_LEN = exports.HEADER_SIZE = exports.CTRL_PORT = exports.BEACON_PORT = exports.AUDIO_PORT = exports.VERSION = exports.MAGIC = void 0;
exports.MAGIC = 0x4d53; // "MS"
exports.VERSION = 1;
exports.AUDIO_PORT = 41235;
exports.BEACON_PORT = 41234;
exports.CTRL_PORT = 41236;
exports.HEADER_SIZE = 16;
exports.MAX_PAYLOAD_LEN = 1472 - exports.HEADER_SIZE; // fits in one IP packet (MTU 1500, no fragmentation)
exports.FLAG_SILENCE = 0x01; // payload is comfort noise / PLC placeholder
exports.FLAG_MUTED = 0x02; // sender muted at capture time
exports.CODEC_PCM_S16LE = 0;
exports.CODEC_OPUS = 1;
// Audio frame layout (48 kHz mono, 10 ms = 480 samples = 960 bytes payload)
exports.SAMPLE_RATE = 48000;
exports.FRAME_MS = 10;
exports.SAMPLES_PER_FRAME = (exports.SAMPLE_RATE * exports.FRAME_MS) / 1000; // 480
exports.PCM_BYTES_PER_FRAME = exports.SAMPLES_PER_FRAME * 2; // int16
exports.WS_MAX_MESSAGE_BYTES = 1024;
