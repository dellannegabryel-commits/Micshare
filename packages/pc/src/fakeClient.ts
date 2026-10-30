// Cliente falso: envia quadros PCM por UDP (tom de 440 Hz) e, opcionalmente,
// abre a sessão de controle via WebSocket para testar `clients`/`disconnect`.
//
// Uso:
//   node dist/fakeClient.js [--host 127.0.0.1] [--port 41235] [--frames 500]
//                           [--drop 0.05] [--hello] [--control-port 41236]
//                           [--codec pcm|opus] [--token 123456]
import { createSocket } from 'node:dgram';
import { parseArgs } from 'node:util';
import { encodeAudioFrame, encodeCtrl, PCM_BYTES_PER_FRAME, SAMPLE_RATE } from '@micshare/protocol';
import WebSocket from 'ws';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    port: { type: 'string' },
    frames: { type: 'string' },
    drop: { type: 'string' },
    hello: { type: 'boolean' },
    'control-port': { type: 'string' },
    codec: { type: 'string' },
    token: { type: 'string' },
  },
});

const host = values.host ?? '127.0.0.1';
const port = Number(values.port ?? 41235);
const totalFrames = Number(values.frames ?? 500);
const dropRate = Number(values.drop ?? 0.05);
const controlPort = Number(values['control-port'] ?? 41236);
const codec = values.codec === 'opus' ? 'opus' : 'pcm';
const wireCodec = codec === 'opus' ? 'opus' : 'pcm16';
const token = values.token ?? '';

if (!Number.isFinite(port) || !Number.isFinite(totalFrames) || totalFrames <= 0) {
  console.error('porta/quadros inválidos');
  process.exit(1);
}

const sock = createSocket('udp4');
const samplesPerFrame = PCM_BYTES_PER_FRAME / 2;
const amplitude = 0.3 * 32767;

function makeFrame(seq: number): Buffer {
  const payload = Buffer.alloc(PCM_BYTES_PER_FRAME);
  const t0 = seq * (samplesPerFrame / SAMPLE_RATE);
  for (let i = 0; i < samplesPerFrame; i++) {
    const t = t0 + i / SAMPLE_RATE;
    payload.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * t) * amplitude), i * 2);
  }
  return encodeAudioFrame({
    seq,
    captureTs: Math.round(seq * 10),
    flags: 0,
    payloadLen: payload.length,
    channels: 1,
    codec: 0,
    payload,
  });
}

let ws: WebSocket | null = null;

function openControlSession(): void {
  ws = new WebSocket(`ws://${host}:${controlPort}`);
  ws.on('open', () => {
    ws?.send(
      encodeCtrl({
        t: 'hello',
        v: 1,
        token,
        sampleRate: SAMPLE_RATE,
        channels: 1,
        codec: wireCodec,
        frameMs: 10,
      })
    );
  });
  ws.on('message', (data) => console.log('[fakeClient] ctrl:', data.toString()));
  ws.on('error', (err) => console.error('[fakeClient] ws error:', err.message));
}

if (values.hello) openControlSession();

let seq = 0;
let sent = 0;

const interval = setInterval(() => {
  const drop = Math.random() < dropRate;
  if (!drop) {
    sock.send(makeFrame(seq), port, host);
    sent += 1;
  }
  seq += 1;

  if (seq >= totalFrames) {
    clearInterval(interval);
    finish();
  }
}, 10);

async function finish(): Promise<void> {
  // dá tempo do servidor drenar o jitter buffer antes de encerrar a sessão
  await new Promise((r) => setTimeout(r, 1000));
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(encodeCtrl({ t: 'bye' }));
    await new Promise((r) => setTimeout(r, 100));
    ws.close();
  }
  await new Promise<void>((resolve) => sock.close(() => resolve()));
  console.log(`Fake client done: ${sent}/${totalFrames} quadros enviados para ${host}:${port}`);
  process.exit(0);
}

console.log(
  `Fake client: ${totalFrames} quadros (~${((totalFrames * 10) / 1000).toFixed(1)}s) ` +
    `para ${host}:${port}, drop ${(dropRate * 100).toFixed(0)}%` +
    (values.hello ? `, controle ws://${host}:${controlPort} (${codec})` : '')
);
