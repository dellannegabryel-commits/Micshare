import { spawn } from 'node:child_process';
import { PCM_BYTES_PER_FRAME, SAMPLE_RATE } from '@micshare/protocol';
export class AudioSink {
    config;
    proc = null;
    stream = null;
    closed = false;
    constructor(config = {}) {
        this.config = config;
    }
    async open() {
        if (this.config.forceFfplay) {
            return this.openFfplay();
        }
        try {
            const naudiodon2 = require('naudiodon2');
            const devices = naudiodon2.Device.getDevices();
            let device = devices.find((d) => d.name.includes(this.config.deviceSubstring || 'CABLE'));
            if (!device)
                device = devices[0];
            if (!device)
                throw new Error('nenhum dispositivo de saída encontrado');
            const ao = new naudiodon2.AudioOutput({
                sampleRate: this.config.sampleRate ?? SAMPLE_RATE,
                channelCount: 1,
                deviceId: device.id,
                closeOnError: false,
            });
            ao.on('data', (data) => {
                // callback de PortAudio pede dados; enfileiramos silêncio se não houver
            });
            // PortAudio pull model: não há stream de escrita direta. Usamos ffplay como fallback confiável
            // quando não houver suporte a push simples. Abaixo, fallback controlado.
            throw new Error('naudiodon2 pull-model sem push direto; use --sink=ffplay');
        }
        catch {
            return this.openFfplay();
        }
    }
    openFfplay() {
        const args = [
            '-f', 's16le',
            '-ar', String(this.config.sampleRate ?? SAMPLE_RATE),
            '-ac', '1',
            '-flags', 'low_delay',
            '-probesize', '32',
            '-i', 'pipe:0',
            '-nodisp',
        ];
        this.proc = spawn('ffplay', args, { stdio: ['pipe', 'ignore', 'pipe'] });
        this.stream = this.proc.stdin;
        this.proc.stderr?.on('data', () => { }); // descarta ruído do ffplay
        this.proc.on('exit', () => {
            this.stream = null;
            this.proc = null;
        });
        this.proc.on('error', (err) => {
            console.error('[sink] ffplay error:', err.message);
            this.stream = null;
            this.proc = null;
        });
        this.stream.on('error', (err) => {
            if (err.code !== 'EPIPE')
                console.error('[sink] stream error:', err.message);
        });
    }
    write(samples) {
        if (this.closed)
            return;
        const buf = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
        if (this.stream) {
            try {
                this.stream.write(buf);
            }
            catch {
                // sink indisponível, ignora frame
            }
        }
    }
    writeSilence() {
        this.write(new Int16Array(PCM_BYTES_PER_FRAME / 2));
    }
    close() {
        this.closed = true;
        if (this.stream) {
            try {
                this.stream.end();
            }
            catch { }
            this.stream = null;
        }
        if (this.proc) {
            this.proc.kill();
            this.proc = null;
        }
    }
}
