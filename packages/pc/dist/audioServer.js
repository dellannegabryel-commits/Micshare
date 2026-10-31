import { createSocket } from 'node:dgram';
import { hostname as osHostname } from 'node:os';
import { decodeAudioFrame, AUDIO_PORT, BEACON_PORT, CTRL_PORT, CODEC_OPUS, } from '@micshare/protocol';
import { JitterBuffer } from './jitterBuffer.js';
import { MetricsCollector } from './metrics.js';
import { AudioSink } from './sink.js';
import { ControlServer } from './control.js';
import { BeaconSender } from './discovery.js';
import { createDecoder } from './opus.js';
import { VERSION, localAddresses, } from './serverState.js';
/** true se houver uma saída de áudio que pareça ser o cabo virtual. */
export async function checkVBCableAvailable() {
    try {
        const devices = await AudioSink.listDevices();
        return devices.some((d) => /cable|vb-audio/i.test(d.name));
    }
    catch {
        return false;
    }
}
export class AudioServer {
    config;
    socket = null;
    jitter = new JitterBuffer({ targetMinFrames: 2, targetMaxFrames: 8, maxDepthMs: 250, plcMaxFrames: 3 });
    metrics = new MetricsCollector();
    sink = null;
    control = null;
    sinkInterval = null;
    statsInterval = null;
    beacon = null;
    started = false;
    startedAt = Date.now();
    mute = false;
    volume = 1;
    sessions = new Map();
    currentCodec = 'pcm';
    opusDecoder = null;
    hostname = '';
    constructor(config = {}) {
        this.config = config;
        this.setupProcessHandlers();
    }
    // ------------------------------------------------------------------ ciclo de vida
    async start() {
        if (this.started) {
            console.warn('[micshare] servidor já iniciado');
            return;
        }
        const audioPort = this.config.audioPort ?? AUDIO_PORT;
        const controlPort = this.config.controlPort ?? CTRL_PORT;
        const beaconPort = this.config.beaconPort ?? BEACON_PORT;
        this.startedAt = Date.now();
        this.hostname = this.config.name ?? osHostname();
        this.started = true;
        const socket = createSocket('udp4');
        this.socket = socket;
        socket.on('error', (err) => {
            console.error('[micshare] UDP socket error:', err.message);
        });
        await new Promise((resolve, reject) => {
            socket.bind({ port: audioPort, address: '0.0.0.0' }, (err) => {
                if (err) {
                    console.error('[micshare] falha ao abrir UDP:', err.message);
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
        const bound = socket.address();
        // --- saída de áudio
        try {
            this.sink = new AudioSink({ deviceSubstring: this.config.deviceSubstring });
            await this.sink.open();
            this.sink.setGain(this.volume);
        }
        catch (err) {
            console.error('[micshare] falha ao abrir a saída de áudio:', err.message);
            await this.stop();
            throw err;
        }
        if (!this.config.deviceSubstring) {
            const hasCable = await checkVBCableAvailable();
            if (!hasCable) {
                console.warn('');
                console.warn('⚠  VB-Cable não detectado! O áudio vai para o dispositivo padrão,');
                console.warn('   mas Discord/OBS não o verão como microfone.');
                console.warn('   Instale com: npm run install-vbcable  (Admin + reiniciar)');
                console.warn('');
            }
        }
        // --- canal de controle (celular)
        this.control = new ControlServer({
            port: controlPort,
            audioPort: bound.port,
            targetBufferMs: 30,
            pairingCode: this.config.pairingCode,
            requirePairing: this.config.requirePairing,
            onHello: (session) => this.onSessionStart(session),
            onMute: (value) => this.setMute(value),
            onVolume: (value) => this.setVolume(value),
            onBye: (id) => this.onSessionEnd(id),
        });
        this.control.start();
        // --- beacon de descoberta
        this.beacon = new BeaconSender({
            name: this.hostname,
            audioPort: bound.port,
            ctrlPort: controlPort,
            beaconPort,
            intervalMs: this.config.beaconIntervalMs,
            pairingEnabled: this.config.requirePairing,
            pairingCode: this.config.pairingCode,
        });
        this.beacon.start();
        // --- entrada de áudio
        socket.on('message', (buf, rinfo) => {
            try {
                const frame = decodeAudioFrame(buf);
                if (!frame)
                    return;
                let pcmPayload;
                if (frame.header.codec === CODEC_OPUS) {
                    if (!this.opusDecoder)
                        return;
                    const decoded = this.opusDecoder.decode(new Uint8Array(frame.payload));
                    pcmPayload = Buffer.from(decoded.buffer, decoded.byteOffset, decoded.byteLength);
                }
                else {
                    pcmPayload = frame.payload;
                }
                this.jitter.push(frame.header.seq, frame.header.captureTs, pcmPayload);
            }
            catch (err) {
                console.error('[micshare] erro ao processar quadro de áudio:', err.message);
            }
        });
        // --- loop de reprodução (10 ms)
        this.sinkInterval = setInterval(() => {
            try {
                if (!this.sink)
                    return;
                if (this.mute) {
                    this.jitter.pop(); // mantém o jitter drenando
                    this.sink.writeSilence();
                    return;
                }
                const pcm = this.jitter.pop();
                if (pcm) {
                    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
                    this.sink.write(samples);
                }
                else {
                    this.sink.writeSilence();
                }
            }
            catch (err) {
                console.error('[micshare] erro no loop de áudio:', err.message);
            }
        }, 10);
        // --- estatísticas 1 Hz (broadcast para o celular + linha no terminal)
        this.statsInterval = setInterval(() => this.tickStats(), 1000);
        const device = this.sink.currentDevice();
        console.log(`[micshare] áudio UDP em 0.0.0.0:${bound.port}`);
        console.log(`[micshare] controle WebSocket em 0.0.0.0:${controlPort}`);
        console.log(`[micshare] beacon em 0.0.0.0:${beaconPort} (${this.hostname})`);
        console.log(`[micshare] saída de áudio: ${device ? device.name : 'indisponível'}`);
        console.log('[micshare] aguardando conexão...');
    }
    /** Shutdown gracioso: fecha timers, áudio, controle, beacon e UDP. */
    async stop() {
        if (this.sinkInterval) {
            clearInterval(this.sinkInterval);
            this.sinkInterval = null;
        }
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
        this.sink?.close();
        this.sink = null;
        const control = this.control;
        this.control = null;
        if (control)
            await control.stop();
        const beacon = this.beacon;
        this.beacon = null;
        if (beacon)
            await beacon.stop();
        const socket = this.socket;
        this.socket = null;
        if (socket) {
            await new Promise((resolve) => {
                try {
                    socket.close(() => resolve());
                }
                catch {
                    resolve();
                }
            });
        }
        this.sessions.clear();
        this.started = false;
    }
    /**
     * Reinicia parte do servidor sem derrubar o processo.
     * - sink: reabre apenas a saída de áudio
     * - control: fecha e reabre o WebSocket
     * - beacon: fecha e reabre o beacon
     * - all: shutdown completo + start (o cliente reconecta pelo beacon)
     */
    async restart(scope = 'all') {
        if (!this.started) {
            await this.start();
            return;
        }
        if (scope === 'all') {
            await this.stop();
            await this.start();
            return;
        }
        if (scope === 'sink') {
            if (!this.sink)
                throw new Error('saída de áudio não está aberta');
            await this.sink.reopen();
            return;
        }
        if (scope === 'control') {
            const port = this.controlPort();
            const audioPort = this.audioPort();
            this.control?.stop();
            this.control = new ControlServer({
                port,
                audioPort,
                targetBufferMs: 30,
                pairingCode: this.config.pairingCode,
                requirePairing: this.config.requirePairing,
                onHello: (session) => this.onSessionStart(session),
                onMute: (value) => this.setMute(value),
                onVolume: (value) => this.setVolume(value),
                onBye: (id) => this.onSessionEnd(id),
            });
            this.control.start();
            this.sessions.clear();
            return;
        }
        if (scope === 'beacon') {
            await this.beacon?.stop();
            this.beacon = new BeaconSender({
                name: this.hostname,
                audioPort: this.audioPort(),
                ctrlPort: this.controlPort(),
                beaconPort: this.config.beaconPort ?? BEACON_PORT,
                intervalMs: this.config.beaconIntervalMs,
                pairingEnabled: this.config.requirePairing,
                pairingCode: this.config.pairingCode,
            });
            this.beacon.start();
            return;
        }
        throw new Error(`escopo de restart inválido: ${scope}`);
    }
    // ------------------------------------------------------------------ controles
    setMute(value) {
        this.mute = value;
        return this.mute;
    }
    toggleMute() {
        return this.setMute(!this.mute);
    }
    isMuted() {
        return this.mute;
    }
    setVolume(value) {
        if (!Number.isFinite(value))
            throw new Error('volume precisa ser um número');
        this.volume = Math.min(4, Math.max(0, value));
        this.sink?.setGain(this.volume);
        return this.volume;
    }
    getVolume() {
        return this.volume;
    }
    /** Troca o dispositivo de saída em runtime. */
    async setDevice(substring) {
        if (!this.sink)
            throw new Error('saída de áudio não está aberta');
        return this.sink.reopen(substring);
    }
    /** Encerra uma sessão (ou todas). Devolve quantas foram fechadas. */
    disconnect(target = 'all') {
        if (!this.control)
            return 0;
        const closed = this.control.disconnect(target);
        if (target === 'all')
            this.sessions.clear();
        return closed;
    }
    async setPairing(enabled, code = '') {
        this.config.requirePairing = enabled;
        this.config.pairingCode = code;
        this.control?.setPairing(enabled, code);
        if (this.beacon)
            this.beacon.setPairing(enabled, code);
    }
    setBeaconEnabled(enabled) {
        this.beacon?.setEnabled(enabled);
    }
    setBeaconInterval(ms) {
        this.beacon?.setIntervalMs(ms);
    }
    getPairing() {
        return {
            enabled: this.config.requirePairing === true,
            code: this.config.pairingCode ?? '',
        };
    }
    // ------------------------------------------------------------------ leitura de estado
    getStatus() {
        const jitterMetrics = this.jitter.getMetrics();
        const device = this.sink?.currentDevice() ?? null;
        return {
            version: VERSION,
            pid: process.pid,
            startedAt: this.startedAt,
            uptimeMs: Date.now() - this.startedAt,
            running: this.started,
            ports: {
                audio: this.audioPort(),
                control: this.controlPort(),
                beacon: this.beacon?.getBeaconPort() ?? this.config.beaconPort ?? BEACON_PORT,
            },
            addresses: localAddresses(),
            device: device ? { ...device, requested: this.sink?.requestedDevice() ?? null } : null,
            codec: this.currentCodec,
            mute: this.mute,
            volume: this.volume,
            beacon: {
                running: this.beacon?.isRunning() ?? false,
                intervalMs: this.beacon?.getIntervalMs() ?? this.config.beaconIntervalMs ?? 1000,
                pairingEnabled: this.beacon?.isPairingEnabled() ?? this.config.requirePairing ?? false,
            },
            sessions: [...this.sessions.values()].map((s) => ({ ...s })),
            metrics: this.metrics.peek(jitterMetrics),
        };
    }
    getSessions() {
        return [...this.sessions.values()].map((s) => ({ ...s }));
    }
    getMetrics() {
        return this.metrics.peek(this.jitter.getMetrics());
    }
    getJitterMetrics() {
        return this.jitter.getMetrics();
    }
    isRunning() {
        return this.started;
    }
    // ------------------------------------------------------------------ internos
    audioPort() {
        const addr = this.socket?.address();
        return addr?.port ?? this.config.audioPort ?? AUDIO_PORT;
    }
    controlPort() {
        return this.config.controlPort ?? CTRL_PORT;
    }
    tickStats() {
        const jitter = this.jitter.getMetrics();
        const snapshot = this.metrics.update(jitter.received, jitter);
        this.control?.broadcastStats({
            lossPct: snapshot.lossPct,
            bufferMs: snapshot.bufferMs,
            seqGaps: snapshot.gaps,
        });
        if (this.config.verbose) {
            const sessions = this.sessions.size;
            const prefix = sessions > 0 ? `conectado (${sessions})` : 'aguardando conexão...';
            process.stdout.write(`\r[micshare] ${prefix} | fps=${snapshot.fps} loss=${snapshot.lossPct}% ` +
                `buffer=${snapshot.bufferMs}ms gaps=${snapshot.gaps} underruns=${snapshot.underruns}   `);
        }
    }
    onSessionStart(session) {
        this.sessions.set(session.id, session);
        this.currentCodec = session.codec;
        if (session.codec === 'opus') {
            this.opusDecoder = createDecoder();
        }
        else {
            this.opusDecoder = null;
        }
        console.log(`\r[micshare] conectado: ${session.id} (${session.ip}) codec=${session.codec} | sessões: ${this.sessions.size}`);
    }
    onSessionEnd(sessionId) {
        this.sessions.delete(sessionId);
        if (this.sessions.size === 0) {
            this.opusDecoder = null;
            this.currentCodec = 'pcm';
        }
        console.log(`\r[micshare] desconectado: ${sessionId} | sessões: ${this.sessions.size}`);
    }
    setupProcessHandlers() {
        process.on('uncaughtException', (err) => {
            console.error('[micshare] exceção não tratada:', err.message, err.stack);
            void this.stop().finally(() => process.exit(1));
        });
        process.on('unhandledRejection', (reason) => {
            console.error('[micshare] promise rejeitada sem tratamento:', reason);
            void this.stop().finally(() => process.exit(1));
        });
    }
}
