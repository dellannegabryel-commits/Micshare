import { HEADER_SIZE, MAGIC, MAX_PAYLOAD_LEN, VERSION, FLAG_SILENCE, FLAG_MUTED } from './constants';

export interface AudioFrameHeader {
  seq: number;           // u32, monotonic per session
  captureTs: number;     // u32 ms, mobile monotonic clock
  flags: number;         // bit0 SILENCE, bit1 MUTED
  payloadLen: number;    // u16
  channels: number;      // 1
  codec: number;         // 0 PCM s16le, 1 Opus
}

export interface AudioFrame extends AudioFrameHeader {
  payload: Buffer;
}

export interface DecodedFrame {
  header: AudioFrameHeader;
  payload: Buffer;
  offset: number; // bytes consumed from input buffer
}

export function encodeAudioFrame(frame: AudioFrame): Buffer {
  const { seq, captureTs, flags, payloadLen, channels, codec, payload } = frame;
  if (payload.length !== payloadLen) {
    throw new Error(`payload.length ${payload.length} !== declared payloadLen ${payloadLen}`);
  }
  if (payloadLen > MAX_PAYLOAD_LEN) {
    throw new Error(`payloadLen ${payloadLen} exceeds max ${MAX_PAYLOAD_LEN}`);
  }
  if (channels !== 1) {
    throw new Error(`only mono supported, got ${channels} channels`);
  }
  if (codec !== 0 && codec !== 1) {
    throw new Error(`codec ${codec} não suportado`);
  }

  const buf = Buffer.alloc(HEADER_SIZE + payloadLen);
  buf.writeUInt16BE(MAGIC, 0);
  buf.writeUInt8(VERSION, 2);
  buf.writeUInt8(flags, 3);
  buf.writeUInt32BE(seq >>> 0, 4);
  buf.writeUInt32BE(captureTs >>> 0, 8);
  buf.writeUInt16BE(payloadLen, 12);
  buf.writeUInt8(channels, 14);
  buf.writeUInt8(codec, 15);
  payload.copy(buf, HEADER_SIZE);
  return buf;
}

export function decodeAudioFrame(buf: Buffer): DecodedFrame | null {
  if (buf.length < HEADER_SIZE) return null;
  if (buf.readUInt16BE(0) !== MAGIC) return null;
  if (buf.readUInt8(2) !== VERSION) return null;

  const flags = buf.readUInt8(3);
  const seq = buf.readUInt32BE(4);
  const captureTs = buf.readUInt32BE(8);
  const payloadLen = buf.readUInt16BE(12);
  const channels = buf.readUInt8(14);
  const codec = buf.readUInt8(15);

  if (payloadLen > MAX_PAYLOAD_LEN) return null;
  if (channels !== 1) return null;
  if (codec !== 0 && codec !== 1) return null;

  if (buf.length < HEADER_SIZE + payloadLen) return null;

  const payload = buf.subarray(HEADER_SIZE, HEADER_SIZE + payloadLen);
  return {
    header: { seq, captureTs, flags, payloadLen, channels, codec },
    payload,
    offset: HEADER_SIZE + payloadLen,
  };
}

export function isMuteFlag(flags: number): boolean {
  return (flags & FLAG_MUTED) !== 0;
}

export function isSilenceFlag(flags: number): boolean {
  return (flags & FLAG_SILENCE) !== 0;
}
