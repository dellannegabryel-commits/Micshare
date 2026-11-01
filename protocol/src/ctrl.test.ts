import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCtrl, encodeCtrl, type CtrlMessage } from './ctrl';

function roundTrip(msg: CtrlMessage): void {
  const text = encodeCtrl(msg);
  const { message, error } = parseCtrl(text);
  assert.strictEqual(error, null, `unexpected error: ${error}`);
  assert.deepStrictEqual(message, msg);
}

describe('ctrl parse', () => {
  it('round-trips hello', () => {
    roundTrip({ t: 'hello', v: 1, token: '482913', sampleRate: 48000, channels: 1, codec: 'pcm16', frameMs: 10 });
  });

  it('round-trips welcome', () => {
    roundTrip({ t: 'welcome', sessionId: 'c1f0', audioPort: 41235, targetBufferMs: 30 });
  });

  it('round-trips mute true and false', () => {
    roundTrip({ t: 'mute', value: true });
    roundTrip({ t: 'mute', value: false });
  });

  it('round-trips volume', () => {
    roundTrip({ t: 'volume', value: 1.2 });
    roundTrip({ t: 'volume', value: 0 });
    roundTrip({ t: 'volume', value: 4 });
  });

  it('round-trips bye', () => {
    roundTrip({ t: 'bye' });
  });

  it('round-trips stats', () => {
    roundTrip({ t: 'stats', lossPct: 0.4, bufferMs: 32, seqGaps: 12, reconnects: 0 });
  });

  it('round-trips error', () => {
    roundTrip({ t: 'error', code: 'bad_token', message: 'código inválido' });
  });

  it('rejects invalid json', () => {
    const { message, error } = parseCtrl('{not json');
    assert.strictEqual(message, null);
    assert.ok(error);
  });

  it('rejects oversize message', () => {
    const big = 'x'.repeat(2000);
    const { message, error } = parseCtrl(big);
    assert.strictEqual(message, null);
    assert.ok(error);
  });

  it('rejects missing t', () => {
    const { message, error } = parseCtrl(JSON.stringify({ v: 1 }));
    assert.strictEqual(message, null);
    assert.ok(error);
  });

  it('rejects unknown t', () => {
    const { message, error } = parseCtrl(JSON.stringify({ t: 'bogus' }));
    assert.strictEqual(message, null);
    assert.ok(error);
  });

  it('rejects hello missing fields', () => {
    const { message, error } = parseCtrl(JSON.stringify({ t: 'hello', v: 1 }));
    assert.strictEqual(message, null);
    assert.ok(error);
  });

  it('rejects non-object', () => {
    const { message, error } = parseCtrl('[1,2,3]');
    assert.strictEqual(message, null);
    assert.ok(error);
  });
});
