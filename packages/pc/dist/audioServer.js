import { createSocket } from 'node:dgram';
import { hostname as osHostname } from 'node:os';
import { decodeAudioFrame, AUDIO_PORT } from '@micshare/protocol';
import { JitterBuffer } from './jitterBuffer.js';
import { MetricsCollector } from './metrics.js';
import { AudioSink } from './sink.js';
import { ControlServer } from './control.js';
import { BeaconSender } from './discovery.js';
export function checkVBCableAvailable() {
    try {
        const naudiodon2 = require('naudiodon2');
        const devices = naudiodon2.getDevices();
        const outputDevices = devices.filter((d) => d.maxOutputChannels > 0);
        return outputDevices.some((d) => d.name.toLowerCase().includes('cable') || d.name.toLowerCase().includes('vb-audio'));
    }
    catch {
        return false;
    }
}
export class AudioServer {
    config;
    socket = createSocket('udp4');
    jitter = new JitterBuffer({ targetMinFrames: 2, targetMaxFrames: 8, maxDepthMs: 250, plcMaxFrames: 3 });
    metrics = new MetricsCollector();
    sink = null;
    control = null;
    sinkInterval = null;
    beacon = null;
    started = false;
    sessionCount = 0;
    lastStatsLine = '';
    statsUpdateInterval = null;
    constructor(config = {}) {
        this.config = config;
        this.setupErrorHandlers();
    }
    setupErrorHandlers() {
        this.socket.on('error', (err) => {
            console.error('[micshare] UDP socket error:', err.message);
        });
        process.on('uncaughtException', (err) => {
            console.error('[micshare] Uncaught exception:', err.message, err.stack);
            this.stop();
            process.exit(1);
        });
        process.on('unhandledRejection', (reason) => {
            console.error('[micshare] Unhandled rejection:', reason);
            this.stop();
            process.exit(1);
        });
    }
    async start() {
        if (this.started) {
            console.warn('[micshare] Server already started');
            return;
        }
        const port = this.config.audioPort ?? AUDIO_PORT;
        await new Promise((resolve, reject) => {
            this.socket.bind({ port, address: '0.0.0.0' }, (err) => {
                if (err) {
                    console.error('[micshare] Failed to bind UDP socket:', err.message);
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
        const addr = this.socket.address();
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
        }
        catch (err) {
            console.error('[micshare] Failed to open audio sink:', err.message);
            this.stop();
            throw err;
        }
        this.control = new ControlServer({
            port: 41236,
            onMute: (v) => console.log('[controle] mute:', v),
            onVolume: (v) => console.log('[controle] volume:', v),
            onBye: (sid) => this.onSessionEnd(sid),
            onHello: (sid) => { this.sessionCount++; console.log(`\r[micshare] conectado: ${sid} | sessões ativas: ${this.sessionCount}`); },
        });
        this.control.start();
        const hostname = this.config.name ?? osHostname();
        this.beacon = new BeaconSender({
            name: hostname,
            audioPort: addr.port,
            ctrlPort: 41236,
        });
        this.beacon.start();
        this.socket.on('message', (buf, rinfo) => {
            try {
                const frame = decodeAudioFrame(buf);
                if (!frame)
                    return;
                this.jitter.push(frame.header.seq, frame.header.captureTs, frame.payload);
            }
            catch (err) {
                console.error('[micshare] Error processing audio frame:', err.message);
            }
        });
        this.sinkInterval = setInterval(() => {
            try {
                const pcm = this.jitter.pop();
                if (pcm) {
                    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
                    this.sink.write(samples);
                }
                else {
                    this.sink.writeSilence();
                }
                this.maybeLogStats();
            }
            catch (err) {
                console.error('[micshare] Error in audio playback loop:', err.message);
            }
        }, 10);
        // Status line update (1 Hz) - only if verbose
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
    onSessionEnd(sessionId) {
        this.sessionCount = Math.max(0, this.sessionCount - 1);
        console.log(`\r[micshare] desconectado: ${sessionId} | sessões ativas: ${this.sessionCount}`);
    }
    printStatusLine() {
        const m = this.jitter.getMetrics();
        const snapshot = this.metrics.update(m.received, m);
        let status = '';
        if (this.sessionCount > 0) {
            status = `conectado (${this.sessionCount}) | fps=${snapshot.fps} loss=${snapshot.lossPct}% buffer=${snapshot.bufferMs}ms gaps=${snapshot.gaps} underruns=${snapshot.underruns}`;
        }
        else {
            status = 'aguardando conexão...';
        }
        // Use carriage return to update same line
        process.stdout.write(`\r[micshare] ${status}   `);
        this.lastStatsLine = status;
    }
    maybeLogStats() {
        if (!this.config.verbose)
            return;
        // Stats printed via printStatusLine interval
    }
    stop() {
        if (this.sinkInterval) {
            clearInterval(this.sinkInterval);
            this.sinkInterval = null;
        }
        if (this.statsUpdateInterval) {
            clearInterval(this.statsUpdateInterval);
            this.statsUpdateInterval = null;
            // Clear the status line
            process.stdout.write('\r' + ' '.repeat(120) + '\r');
        }
        this.sink?.close();
        this.control?.stop();
        this.beacon?.stop();
        this.socket.close();
        this.started = false;
    }
}
