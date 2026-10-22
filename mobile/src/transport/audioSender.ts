import { createSocket } from 'react-native-udp';
import { encodeAudioFrame, PCM_BYTES_PER_FRAME } from '@micshare/protocol';

const FLAG_MUTED = 0x02;

export class AudioSender {
  private socket: ReturnType<typeof createSocket> | null = null;
  private targetIp: string = '';
  private targetPort: number = 0;
  private seq = 0;
  private captureTsBase = 0;
  private muted = false;

  async start(ip: string, port: number): Promise<void> {
    this.targetIp = ip;
    this.targetPort = port;
    this.seq = 0;
    this.captureTsBase = Date.now();

    this.socket = createSocket('udp4');
    await new Promise<void>((resolve, reject) => {
      this.socket!.on('error', reject);
      this.socket!.bind(0, () => resolve()); // random local port
    });
    console.log('[sender] UDP socket bound, target:', ip, port);
  }

  sendFrame(pcm: Int16Array): void {
    if (!this.socket || this.muted) return;

    // Ensure correct frame size
    let payload: Uint8Array;
    if (pcm.length === PCM_BYTES_PER_FRAME / 2) {
      payload = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    } else {
      // Resize if needed
      const fixed = new Int16Array(PCM_BYTES_PER_FRAME / 2);
      const len = Math.min(pcm.length, fixed.length);
      fixed.set(pcm.subarray(0, len));
      payload = new Uint8Array(fixed.buffer);
    }

    const captureTs = Date.now() - this.captureTsBase;
    const flags = this.muted ? FLAG_MUTED : 0;

    const frame = encodeAudioFrame({
      seq: this.seq++,
      captureTs,
      flags,
      payloadLen: payload.length,
      channels: 1,
      codec: 0, // PCM s16le
      payload: Buffer.from(payload),
    });

    try {
      this.socket!.send(frame, this.targetPort, this.targetIp);
    } catch (err) {
      console.error('[sender] send error:', err);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  stop(): void {
    this.socket?.close();
    this.socket = null;
    this.targetIp = '';
    this.targetPort = 0;
  }
}

export const audioSender = new AudioSender();