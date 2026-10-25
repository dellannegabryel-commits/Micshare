import { createSocket, type RemoteInfo } from 'node:dgram';
import { AddressInfo } from 'node:net';
import { hostname as osHostname } from 'node:os';
import { encodeAudioFrame, decodeAudioFrame, AUDIO_PORT, PCM_BYTES_PER_FRAME, CODEC_OPUS } from '@micshare/protocol';
import { JitterBuffer } from './jitterBuffer.js';
import { MetricsCollector, MetricsSnapshot } from './metrics.js';
import { AudioSink } from './sink.js';
import { ControlServer } from './control.js';
import { BeaconSender, BeaconConfig } from './discovery.js';
import { createDecoder, OpusDecoderInstance } from './opus.js';

export function checkVBCableAvailable(): boolean {
  try {
    const naudiodon2 = require('naudiodon2');
    const devices = naudiodon2.getDevices();
    const outputDevices = devices.filter((d: any) => d.maxOutputChannels > 0);
    return outputDevices.some((d: any) => d.name.toLowerCase().includes('cable') || d.name.toLowerCase().includes('vb-audio'));
  } catch {
    return false;
  }
}

export interface ServerConfig {
  audioPort?: number;
  deviceSubstring?: string;
  verbose?: boolean;
  name?: string; // hostname do PC para beacon
}

export class AudioServer {
  private socket: ReturnType<typeof createSocket> = createSocket('udp4');
  private jitter = new JitterBuffer({ targetMinFrames: 2, targetMaxFrames: 8, maxDepthMs: 250, plcMaxFrames: 3 });
  private metrics = new MetricsCollector();
  private sink: AudioSink | null = null;
  private control: ControlServer | null = null;
  private sinkInterval: NodeJS.Timeout | null = null;
  private beacon: BeaconSender | null = null;
  private started = false;
  private sessionCount = 0;
  private lastStatsLine = '';
  private statsUpdateInterval: NodeJS.Timeout | null = null;
  private currentCodec: 'pcm' | 'opus' = 'pcm';
  private opusDecoder: OpusDecoderInstance | null = null;

  constructor(private config: ServerConfig = {}) {
    this.setupErrorHandlers();
  }

  private setupErrorHandlers(): void {
    this.socket.on('error', (err: Error) => {
      console.error('[micshare] UDP socket error:', err.message);
    });

    process.on('uncaughtException', (err: Error) => {
      console.error('[micshare] Uncaught exception:', err.message, err.stack);
      this.stop();
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      console.error('[micshare] Unhandled rejection:', reason);
      this.stop();
      process.exit(1);
    });
  }

  async start(): Promise<void> {
    if (this.started) {
      console.warn('[micshare] Server already started');
      return;
    }

    const port = this.config.audioPort ?? AUDIO_PORT;

    await new Promise<void>((resolve, reject) => {
      this.socket.bind({ port, address: '0.0.0.0' }, (err?: Error) => {
        if (err) {
          console.error('[micshare] Failed to bind UDP socket:', err.message);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    const addr = this.socket.address() as AddressInfo;

    try {
      this.sink = new AudioSink({ deviceSubstring: this.config.deviceSubstring });
      await this.sink.open();

      if (!checkVBCableAvailable() && !this.config.deviceSubstring) {
        console.warn('');
        console.warn('⚠  VB-Cable não detectado! O áudio será reproduzido no dispositivo padrão,');
        console.warn('   mas Discord/OBS não o verão como microfone.');
        console.warn('   Instale com: npm run install-vbcable  (precisa de Admin + reiniciar)');
        console.warn('');
      }
    } catch (err) {
      console.error('[micshare] Failed to open audio sink:', (err as Error).message);
      this.stop();
      throw err;
    }

    this.control = new ControlServer({
      port: 41236,
      pairingCode: '',
      defaultCodec: 'opus',
      onHello: async (sid, codec) => {
        this.currentCodec = codec;
        if (codec === 'opus') {
          this.opusDecoder = createDecoder();
          console.log('[micshare] Opus decoder initialized');
        } else {
          this.opusDecoder = null;
        }
        this.sessionCount++;
        console.log(`\r[micshare] conectado: ${sid} | codec: ${codec} | sessões ativas: ${this.sessionCount}`);
        return true;
      },
      onMute: (v) => console.log('[controle] mute:', v),
      onVolume: (v) => console.log('[controle] volume:', v),
      onBye: (sid) => this.onSessionEnd(sid),
    });
    this.control.start();

    const hostname = this.config.name ?? osHostname();
    this.beacon = new BeaconSender({
      name: hostname,
      audioPort: addr.port,
      ctrlPort: 41236,
      pairingCode: '',
    });
    this.beacon.start();

    this.socket.on('message', (buf: Buffer, rinfo: RemoteInfo) => {
      try {
        const frame = decodeAudioFrame(buf);
        if (!frame) return;

        let pcmPayload: Buffer;
        if (frame.header.codec === CODEC_OPUS && this.opusDecoder) {
          // Decode Opus to PCM
          const decoded = this.opusDecoder.decode(new Uint8Array(frame.payload));
          pcmPayload = Buffer.from(decoded.buffer, decoded.byteOffset, decoded.byteLength);
        } else {
          // PCM frame
          pcmPayload = frame.payload;
        }
        this.jitter.push(frame.header.seq, frame.header.captureTs, pcmPayload);
      } catch (err) {
        console.error('[micshare] Error processing audio frame:', (err as Error).message);
      }
    });

    this.sinkInterval = setInterval(() => {
      try {
        const pcm = this.jitter.pop();
        if (pcm) {
          const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
          this.sink!.write(samples);
        } else {
          this.sink!.writeSilence();
        }
        this.maybeLogStats();
      } catch (err) {
        console.error('[micshare] Error in audio playback loop:', (err as Error).message);
      }
    }, 10);

    if (this.config.verbose) {
      this.statsUpdateInterval = setInterval(() => this.printStatusLine(), 1000);
    }

    this.started = true;

    console.log(`[micshare] servidor de áudio UDP na porta ${addr.port} (0.0.0.0)`);
    console.log(`[micshare] controle WebSocket na porta 41236 (0.0.0.0)`);
    console.log(`[micshare] beacon ativo: ${hostname}:${addr.port}`);
    console.log(`[micshare] dispositivo de saída: ${this.config.deviceSubstring ?? 'padrão'}`);
    console.log('[micshare] aguardando conexão...');
  }

  private onSessionEnd(sessionId: string): void {
    this.sessionCount = Math.max(0, this.sessionCount - 1);
    console.log(`\r[micshare] desconectado: ${sessionId} | sessões ativas: ${this.sessionCount}`);
  }

  private printStatusLine(): void {
    const m = this.jitter.getMetrics();
    const snapshot: MetricsSnapshot = this.metrics.update(m.received, m);

    let status = '';
    if (this.sessionCount > 0) {
      status = `conectado (${this.sessionCount}) | fps=${snapshot.fps} loss=${snapshot.lossPct}% buffer=${snapshot.bufferMs}ms gaps=${snapshot.gaps} underruns=${snapshot.underruns}`;
    } else {
      status = 'aguardando conexão...';
    }

    process.stdout.write(`\r[micshare] ${status}   `);
    this.lastStatsLine = status;
  }

  maybeLogStats(): void {
    if (!this.config.verbose) return;
  }

  stop(): void {
    if (this.sinkInterval) {
      clearInterval(this.sinkInterval);
      this.sinkInterval = null;
    }
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
      this.statsUpdateInterval = null;
      process.stdout.write('\r' + ' '.repeat(120) + '\r');
    }
    this.sink?.close();
    this.control?.stop();
    this.beacon?.stop();
    this.socket.close();
    this.started = false;
  }
}