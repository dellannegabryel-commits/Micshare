import { createSocket } from 'node:dgram';
import { hostname as osHostname } from 'node:os';
import { decodeAudioFrame, AUDIO_PORT } from '@micshare/protocol';
import { JitterBuffer } from './jitterBuffer.js';
import { MetricsCollector } from './metrics.js';
import { AudioSink } from './sink.js';
import { ControlServer } from './control.js';
import { BeaconSender } from './discovery.js';
export class AudioServer {
    config;
    socket = createSocket('udp4');
    jitter = new JitterBuffer({ targetMinFrames: 2, targetMaxFrames: 8, maxDepthMs: 250, plcMaxFrames: 3 });
    metrics = new MetricsCollector();
    sink = null;
    control = null;
    sinkInterval = null;
    beacon = null;
    constructor(config = {}) {
        this.config = config;
    }
    async start() {
        const port = this.config.audioPort ?? AUDIO_PORT;
        await new Promise((resolve, reject) => {
            this.socket.bind(port, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
        const addr = this.socket.address();
        this.sink = new AudioSink({ deviceSubstring: this.config.deviceSubstring });
        await this.sink.open();
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
        this.socket.on('message', (buf, rinfo) => {
            const frame = decodeAudioFrame(buf);
            if (!frame)
                return;
            this.jitter.push(frame.header.seq, frame.header.captureTs, frame.payload);
        });
        // Loop de reprodução: puxa do jitter buffer a cada 10 ms
        this.sinkInterval = setInterval(() => {
            const pcm = this.jitter.pop();
            if (pcm) {
                const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
                this.sink.write(samples);
            }
            else {
                this.sink.writeSilence();
            }
            this.maybeLogStats();
        }, 10);
        console.log(`[micshare] servidor de áudio UDP na porta ${addr.port}`);
        console.log(`[micshare] controle WebSocket na porta 41236`);
        console.log(`[micshare] beacon ativo: ${hostname}:${addr.port}`);
        console.log(`[micshare] dispositivo de saída: ${this.config.deviceSubstring ?? 'padrão'}`);
    }
    maybeLogStats() {
        if (!this.config.verbose)
            return;
        const m = this.jitter.getMetrics();
        const snapshot = this.metrics.update(m.received, m);
        console.log(`[stats] fps=${snapshot.fps} loss=${snapshot.lossPct}% gaps=${snapshot.gaps} ` +
            `buffer=${snapshot.bufferMs}ms underruns=${snapshot.underruns} ff=${snapshot.fastForwards} flush=${snapshot.flushes}`);
    }
    stop() {
        if (this.sinkInterval)
            clearInterval(this.sinkInterval);
        this.sink?.close();
        this.control?.stop();
        this.beacon?.stop();
        this.socket.close();
    }
}
