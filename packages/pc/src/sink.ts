import { PCM_BYTES_PER_FRAME, SAMPLE_RATE } from '@micshare/protocol';

export interface SinkConfig {
  deviceSubstring?: string;
  sampleRate?: number;
  frameMs?: number;
}

export class AudioSink {
  private audioOutput: any = null;
  private buffer: Int16Array[] = [];
  private closed = false;
  private maxBufferFrames = 20; // ~200ms buffer

  constructor(private config: SinkConfig = {}) {}

  async open(): Promise<void> {
    let naudiodon2: any;
    try {
      naudiodon2 = await import('naudiodon2');
    } catch (err) {
      throw new Error(`naudiodon2 não disponível: ${(err as Error).message}. Instale com: npm install naudiodon2`);
    }

    const devices = naudiodon2.getDevices();

    // Filtrar apenas dispositivos de saída (maxOutputChannels > 0)
    const outputDevices = devices.filter((d: any) => d.maxOutputChannels > 0);
    if (outputDevices.length === 0) throw new Error('nenhum dispositivo de saída encontrado');

    let device = outputDevices.find((d: any) => d.name.includes(this.config.deviceSubstring || 'CABLE'));
    if (!device) device = outputDevices[0];

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

    this.audioOutput.on('data', (data: Buffer) => {
      // PortAudio pede dados - consumimos do nosso buffer interno
      const frameSize = PCM_BYTES_PER_FRAME;
      if (this.buffer.length > 0) {
        const frame = this.buffer.shift()!;
        const buf = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
        buf.copy(data);
      } else {
        // underrun - preenche com silêncio
        data.fill(0);
      }
    });

    this.audioOutput.on('error', (err: Error) => {
      console.error('[sink] PortAudio error:', err.message);
      // Não crashar o processo, apenas logar
    });

    this.audioOutput.on('close', () => {
      console.log('[sink] PortAudio closed');
    });

    try {
      this.audioOutput.start();
    } catch (err) {
      console.error('[sink] falha ao iniciar PortAudio:', (err as Error).message);
      throw err;
    }
  }

  write(samples: Int16Array): void {
    if (this.closed) return;
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

  writeSilence(): void {
    this.write(new Int16Array(PCM_BYTES_PER_FRAME / 2));
  }

  close(): void {
    this.closed = true;
    if (this.audioOutput) {
      try {
        this.audioOutput.quit();
      } catch (err) {
        console.error('[sink] erro ao fechar PortAudio:', (err as Error).message);
      }
      this.audioOutput = null;
    }
    this.buffer = [];
  }
}