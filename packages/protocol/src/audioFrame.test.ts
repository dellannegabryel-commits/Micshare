import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  encodeAudioFrame,
  decodeAudioFrame,
  isMuteFlag,
  isSilenceFlag,
  MAGIC,
  VERSION,
  MAX_PAYLOAD_LEN,
  HEADER_SIZE,
  PCM_BYTES_PER_FRAME,
} from './index';

function makePayload(len: number): Buffer {
  const buf = Buffer.alloc(len);
  for (let i = 0; i < len; i++) buf[i] = i % 256;
  return buf;
}

describe('audioFrame round-trip', () => {
  it('encodes and decodes a full PCM frame', () => {
    const payload = makePayload(PCM_BYTES_PER_FRAME);
    const encoded = encodeAudioFrame({ seq: 1, captureTs: 1000, flags: 0, payloadLen: payload.length, channels: 1, codec: 0, payload });
    const decoded = decodeAudioFrame(encoded);
    assert.ok(decoded !== null);
    assert.deepStrictEqual(decoded!.header, { seq: 1, captureTs: 1000, flags: 0, payloadLen: payload.length, channels: 1, codec: 0 });
    assert.strictEqual(decoded!.offset, encoded.length);
    assert.deepStrictEqual(decoded!.payload, payload);
  });

  it('round-trips mute and silence flags', () => {
    const payload = makePayload(10);
    const enc = encodeAudioFrame({ seq: 2, captureTs: 2000, flags: 0b11, payloadLen: payload.length, channels: 1, codec: 0, payload });
    const dec = decodeAudioFrame(enc);
    assert.ok(dec);
    assert.strictEqual(isMuteFlag(dec!.header.flags), true);
    assert.strictEqual(isSilenceFlag(dec!.header.flags), true);
  });

  it('rejects bad magic', () => {
    const buf = Buffer.alloc(HEADER_SIZE + 10);
    buf.writeUInt16BE(0x0000, 0);
    buf.writeUInt8(VERSION, 2);
    assert.strictEqual(decodeAudioFrame(buf), null);
  });

  it('rejects bad version', () => {
    const buf = Buffer.alloc(HEADER_SIZE + 10);
    buf.writeUInt16BE(MAGIC, 0);
    buf.writeUInt8(99, 2);
    assert.strictEqual(decodeAudioFrame(buf), null);
  });

  it('rejects payloadLen larger than actual buffer', () => {
    const buf = Buffer.alloc(HEADER_SIZE + 5);
    buf.writeUInt16BE(MAGIC, 0);
    buf.writeUInt8(VERSION, 2);
    buf.writeUInt16BE(100, 12); // claims 100 bytes, only 5 present
    assert.strictEqual(decodeAudioFrame(buf), null);
  });

  it('rejects payloadLen exceeding MTU bound', () => {
    const payload = makePayload(MAX_PAYLOAD_LEN + 1);
    assert.throws(() => encodeAudioFrame({ seq: 3, captureTs: 3000, flags: 0, payloadLen: payload.length, channels: 1, codec: 0, payload }), /exceeds max/);
  });

  it('rejects non-mono channels', () => {
    const payload = makePayload(10);
    assert.throws(() => encodeAudioFrame({ seq: 4, captureTs: 4000, flags: 0, payloadLen: payload.length, channels: 2, codec: 0, payload }), /only mono/);
  });

  it('rejects unknown codec', () => {
    const payload = makePayload(10);
    assert.throws(() => encodeAudioFrame({ seq: 5, captureTs: 5000, flags: 0, payloadLen: payload.length, channels: 1, codec: 99, payload }), /não suportado/);
  });

  it('seq wraps at u32 max', () => {
    const payload = makePayload(10);
    const enc = encodeAudioFrame({ seq: 0xffffffff, captureTs: 6000, flags: 0, payloadLen: payload.length, channels: 1, codec: 0, payload });
    const dec = decodeAudioFrame(enc);
    assert.ok(dec);
    assert.strictEqual(dec!.header.seq, 0xffffffff);
  });

  it('buffer shorter than header returns null', () => {
    assert.strictEqual(decodeAudioFrame(Buffer.alloc(HEADER_SIZE - 1)), null);
  });
});
