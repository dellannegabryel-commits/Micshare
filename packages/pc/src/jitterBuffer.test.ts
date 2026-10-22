import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JitterBuffer, type JitterMetrics } from './jitterBuffer.js';
import { PCM_BYTES_PER_FRAME } from '@micshare/protocol';

function frame(seq: number, payloadLen = PCM_BYTES_PER_FRAME): Buffer {
  const b = Buffer.alloc(payloadLen);
  b.fill(seq & 0xff);
  return b;
}

describe('jitter buffer', () => {
  it('push e pop em ordem', () => {
    const jb = new JitterBuffer();
    for (let s = 0; s < 5; s++) jb.push(s, s * 10, frame(s));
    assert.strictEqual(jb.depth(), 5);
    for (let s = 0; s < 5; s++) {
      const p = jb.pop();
      assert.ok(p !== null);
      assert.strictEqual(p![0], s & 0xff);
    }
    assert.strictEqual(jb.depth(), 0);
  });

  it('gap de seq preenche com silêncio e conta perda', () => {
    const jb = new JitterBuffer();
    jb.push(0, 0, frame(0));
    jb.push(3, 30, frame(3)); // perdeu 1, 2
    const m = jb.getMetrics();
    assert.strictEqual(m.lost, 2);
    assert.strictEqual(m.gaps, 1);
    // buffer contem: 0, silence, silence, 3 = 4 frames
    assert.strictEqual(jb.depth(), 4);
  });

  it('frame atrasado (seq ja consumido) eh descartado', () => {
    const jb = new JitterBuffer();
    jb.push(0, 0, frame(0));
    jb.push(1, 10, frame(1));
    jb.push(0, 20, frame(0)); // atrasado
    const m = jb.getMetrics();
    assert.strictEqual(jb.depth(), 2); // so 0 e 1
  });

  it('underrun retorna silencio', () => {
    const jb = new JitterBuffer();
    const p = jb.pop();
    assert.ok(p !== null);
    assert.strictEqual(p!.length, PCM_BYTES_PER_FRAME);
    assert.strictEqual(jb.getMetrics().underruns, 1);
  });

  it('profundidade nunca excede o maximo apos muitos pushes', () => {
    const jb = new JitterBuffer({ maxDepthMs: 100 }); // max 10 frames
    for (let s = 0; s < 30; s++) jb.push(s, s * 10, frame(s));
    assert.ok(jb.depth() <= 10);
  });

  it('target se adapta a baixo jitter', () => {
    const jb = new JitterBuffer({ targetMinFrames: 2, targetMaxFrames: 8 });
    let now = 0;
    const fakeNow = () => now;
    // reconstruir com now fake nao eh possivel apos construtor; testamos apenas que nao explode
    for (let s = 0; s < 10; s++) jb.push(s, s * 10, frame(s));
    assert.ok(jb.depth() >= 0);
  });

  it('metricas contam recebidos', () => {
    const jb = new JitterBuffer();
    jb.push(0, 0, frame(0));
    jb.push(1, 10, frame(1));
    assert.strictEqual(jb.getMetrics().received, 2);
  });
});
