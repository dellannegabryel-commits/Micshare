import { createSocket, type RemoteInfo } from 'node:dgram';
import { AddressInfo } from 'node:net';
import { hostname as osHostname } from 'node:os';
import { encodeAudioFrame, decodeAudioFrame, AUDIO_PORT, PCM_BYTES_PER_FRAME } from '@micshare/protocol';
import { JitterBuffer } from './jitterBuffer.js';
import { MetricsCollector } from './metrics.js';
import { AudioSink } from './sink.js';
import { ControlServer } from './control.js';
import { BeaconSender, BeaconConfig } from './discovery.js';

export interface ServerConfig {
  audioPort?: number;
  deviceSubstring?: string;
  pairingCode?: string;
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

  constructor(private config: ServerConfig = {}) {
    this.setupErrorHandlers();
  }

  private setupErrorHandlers(): void {
    // Handle socket errors
    this.socket.on('error', (err: Error) => {
      console.error('[micshare] UDP socket error:', err.message);
    });

    // Handle process-level errors
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
      this.socket.bind(port, (err?: Error) => {
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
    } catch (err) {
      console.error('[micshare] Failed to open audio sink:', (err as Error).message);
      this.stop();
      throw err;
    }

    this.control = new ControlServer({
      port: 41236,
      pairingCode: this.config.pairingCode ?? '',
      onHello: async (token) => token === this.config.pairingCode,
      onMute: (v) => console.log('[controle] mute:', v),
      onVolume: (v) => console.log('[controle] volume:', v),
      onBye: (sid) => console.log('[controle] bye:', sid),
    });
    this.control.start();

    // Beacon UDP broadcast para descoberta
    const hostname = this.config.name ?? osHostname();
    this.beacon = new BeaconSender({
      name: hostname,
      audioPort: addr.port,
      ctrlPort: 41236,
      pairingCode: this.config.pairingCode ?? '',
    });
    this.beacon.start();

    this.socket.on('message', (buf: Buffer, rinfo: RemoteInfo) => {
      try {
        const frame = decodeAudioFrame(buf);
        if (!frame) return;
        this.jitter.push(frame.header.seq, frame.header.captureTs, frame.payload);
      } catch (err) {
        console.error('[micshare] Error processing audio frame:', (err as Error).message);
      }
    });

    // Loop de reprodução: puxa do jitter buffer a cada 10 ms
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

    this.started = true;

    console.log(`[micshare] servidor de áudio UDP na porta ${addr.port}`);
    console.log(`[micshare] controle WebSocket na porta 41236`);
    console.log(`[micshare] beacon ativo: ${hostname}:${addr.port}`);
    console.log(`[micshare] dispositivo de saída: ${this.config.deviceSubstring ?? 'padrão'}`);
  }

  private maybeLogStats(): void {
    if (!this.config.verbose) return;
    try {
      const m = this.jitter.getMetrics();
      const snapshot = this.metrics.update(m.received, m);
      console.log(
        `[stats] fps=${snapshot.fps} loss=${snapshot.lossPct}% gaps=${snapshot.gaps} ` +
        `buffer=${snapshot.bufferMs}ms underruns=${snapshot.underruns} ff=${snapshot.fastForwards} flush=${snapshot.flushes}`
      );
    } catch (err) {
      console.error('[micshare] Error logging stats:', (err as Error).message);
    }
  }

  stop(): void {
    if (this.sinkInterval) {
      clearInterval(this.sinkInterval);
      this.sinkInterval = null;
    }
    this.sink?.close();
    this.control?.stop();
    this.beacon?.stop();
    this.socket.close();
    this.started = false;
  }
}