import { createSocket } from 'node:dgram';
import { encodeAudioFrame, PCM_BYTES_PER_FRAME } from '@micshare/protocol';

const sock = createSocket('udp4');
const ip = '127.0.0.1';
const port = 41235;

function sendFrame(seq: number, drop: boolean): void {
  if (drop) return;
  const payload = Buffer.alloc(PCM_BYTES_PER_FRAME);
  payload.fill(seq & 0xff);
  const frame = encodeAudioFrame({ seq, captureTs: seq * 10, flags: 0, payloadLen: payload.length, channels: 1, codec: 0, payload });
  sock.send(frame, port, ip);
}

let seq = 0;
const interval = setInterval(() => {
  const drop = Math.random() < 0.05; // 5% drop
  sendFrame(seq++, drop);
  if (seq > 500) {
    clearInterval(interval);
    sock.close();
    console.log('Fake client done');
    process.exit(0);
  }
}, 10);

console.log('Fake client sending 500 frames with 5% drop...');