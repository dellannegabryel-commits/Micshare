import { PCM_BYTES_PER_FRAME, SAMPLE_RATE } from '@micshare/protocol';
export class AudioSink {
    config;
    audioOutput = null;
    buffer = [];
    closed = false;
    maxBufferFrames = 20; // ~200ms buffer
    constructor(config = {}) {
        this.config = config;
    }
    async open() {
        const naudiodon2 = await import('naudiodon2');
        const devices = naudiodon2.getDevices();
        // Filtrar apenas dispositivos de saída (maxOutputChannels > 0)
        const outputDevices = devices.filter((d) => d.maxOutputChannels > 0);
        if (outputDevices.length === 0)
            throw new Error('nenhum dispositivo de saída encontrado');
        let device = outputDevices.find((d) => d.name.includes(this.config.deviceSubstring || 'CABLE'));
        if (!device)
            device = outputDevices[0];
        console.log(`[sink] usando dispositivo: ${device.name} (id=${device.id}, maxOutputChannels=${device.maxOutputChannels})`);
        // PortAudio callback: pull model - preenchemos buffer interno
        this.audioOutput = naudiodon2.AudioIO({
            outOptions: {
                sampleRate: this.config.sampleRate ?? SAMPLE_RATE,
                channelCount: 1,
                deviceId: device.id,
                closeOnError: false,
            },
        });
        this.audioOutput.on('data', (data) => {
            // PortAudio pede dados - consumimos do nosso buffer interno
            const frameSize = PCM_BYTES_PER_FRAME;
            if (this.buffer.length > 0) {
                const frame = this.buffer.shift();
                const buf = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
                buf.copy(data);
            }
            else {
                // underrun - preenche com silêncio
                data.fill(0);
            }
        });
        this.audioOutput.on('error', (err) => {
            console.error('[sink] PortAudio error:', err.message);
        });
        this.audioOutput.start();
    }
    write(samples) {
        if (this.closed)
            return;
        // push para buffer interno (limitado)
        if (this.buffer.length < this.maxBufferFrames) {
            this.buffer.push(samples);
        }
        // se buffer cheio, descarta frame mais antigo (fast-forward)
        else if (this.buffer.length > 0) {
            this.buffer.shift();
            this.buffer.push(samples);
        }
    }
    writeSilence() {
        this.write(new Int16Array(PCM_BYTES_PER_FRAME / 2));
    }
    close() {
        this.closed = true;
        if (this.audioOutput) {
            this.audioOutput.quit();
            this.audioOutput = null;
        }
        this.buffer = [];
    }
}
