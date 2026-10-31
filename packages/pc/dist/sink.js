import { PCM_BYTES_PER_FRAME, SAMPLE_RATE } from '@micshare/protocol';
const MAX_GAIN = 4;
/** Carrega naudiodon2 tanto em CJS (namespace) quanto em ESM (default). */
async function loadNaudiodon() {
    const mod = await import('naudiodon2');
    return mod?.getDevices ? mod : mod?.default;
}
export class AudioSink {
    config;
    audioOutput = null;
    closed = false;
    gain = 1;
    device = null;
    requested = null;
    scratch = null;
    constructor(config = {}) {
        this.config = config;
    }
    static async listDevices() {
        const naudiodon2 = await loadNaudiodon();
        const devices = naudiodon2.getDevices();
        return devices
            .filter((d) => d.maxOutputChannels > 0)
            .map((d) => ({ id: d.id, name: d.name, channels: d.maxOutputChannels }));
    }
    async open(deviceSubstring) {
        const naudiodon2 = await loadNaudiodon();
        const devices = await AudioSink.listDevices();
        if (devices.length === 0)
            throw new Error('nenhum dispositivo de saída encontrado');
        const wanted = deviceSubstring ?? this.config.deviceSubstring;
        const device = this.pick(devices, wanted);
        this.audioOutput = naudiodon2.AudioIO({
            outOptions: {
                sampleRate: this.config.sampleRate ?? SAMPLE_RATE,
                channelCount: 1,
                deviceId: device.id,
                sampleFormat: naudiodon2.SampleFormat16Bit,
                closeOnError: false,
            },
        });
        this.audioOutput.on('error', (err) => {
            console.error('[sink] PortAudio error:', err.message);
        });
        try {
            this.audioOutput.start();
        }
        catch (err) {
            this.audioOutput = null;
            throw new Error(`falha ao iniciar PortAudio em "${device.name}": ${err.message}`);
        }
        this.device = device;
        this.requested = wanted ?? null;
        this.closed = false;
        console.log(`[sink] usando dispositivo: ${device.name} (id=${device.id}, maxOutputChannels=${device.channels})`);
    }
    /** Reabre o sink; em caso de falha, volta para o dispositivo anterior. */
    async reopen(deviceSubstring) {
        const previous = this.requested;
        const target = deviceSubstring ?? previous ?? undefined;
        this.close();
        try {
            await this.open(target);
            return this.device;
        }
        catch (err) {
            if (previous && previous !== target) {
                try {
                    await this.open(previous);
                }
                catch {
                    // mantém o erro original
                }
            }
            throw err;
        }
    }
    currentDevice() {
        return this.device;
    }
    requestedDevice() {
        return this.requested;
    }
    setGain(gain) {
        this.gain = Math.min(MAX_GAIN, Math.max(0, Number.isFinite(gain) ? gain : 1));
        return this.gain;
    }
    getGain() {
        return this.gain;
    }
    write(samples) {
        if (this.closed || !this.audioOutput)
            return;
        let data = samples;
        if (this.gain !== 1) {
            if (!this.scratch || this.scratch.length < samples.length) {
                this.scratch = new Int16Array(samples.length);
            }
            for (let i = 0; i < samples.length; i++) {
                const v = samples[i] * this.gain;
                this.scratch[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v | 0;
            }
            data = this.scratch.subarray(0, samples.length);
        }
        const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        try {
            this.audioOutput.write(buf);
        }
        catch {
            // escrita durante encerramento: ignora
        }
    }
    writeSilence() {
        this.write(new Int16Array(PCM_BYTES_PER_FRAME / 2));
    }
    close() {
        this.closed = true;
        this.device = null;
        if (this.audioOutput) {
            try {
                this.audioOutput.quit();
            }
            catch (err) {
                console.error('[sink] erro ao fechar PortAudio:', err.message);
            }
            this.audioOutput = null;
        }
    }
    pick(devices, wanted) {
        if (wanted) {
            const needle = wanted.toLowerCase();
            const match = devices.find((d) => d.name.toLowerCase().includes(needle) && d.channels === 2) ??
                devices.find((d) => d.name.toLowerCase().includes(needle));
            if (!match) {
                throw new Error(`dispositivo "${wanted}" não encontrado. Use "devices" para listar as saídas disponíveis.`);
            }
            return match;
        }
        const cable = devices.find((d) => /cable|vb-audio/i.test(d.name) && d.channels === 2);
        return cable ?? devices.find((d) => d.channels === 2) ?? devices[0];
    }
}
