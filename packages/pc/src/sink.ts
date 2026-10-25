import { PCM_BYTES_PER_FRAME, SAMPLE_RATE } from '@micshare/protocol';

export interface SinkConfig {
  deviceSubstring?: string;
  sampleRate?: number;
  frameMs?: number;
}

export class AudioSink {
  private audioOutput: any = null;
  private closed = false;

  constructor(private config: SinkConfig = {}) {}

  async open(): Promise<void> {
    let naudiodon2: any;
    try {
      naudiodon2 = await import('naudiodon2');
    } catch (err) {
      throw new Error(`naudiodon2 não disponível: ${(err as Error).message}. Instale com: npm install naudiodon2`);
    }

    const devices = naudiodon2.getDevices();

    // Log all output devices for debugging
    const outputDevices = devices.filter((d: any) => d.maxOutputChannels > 0);
    if (outputDevices.length === 0) throw new Error('nenhum dispositivo de saída encontrado');

    console.log('[sink] Dispositivos de saída disponíveis:');
    for (const d of outputDevices) {
      console.log(`  [${d.id}] ${d.name} (maxOutputChannels=${d.maxOutputChannels})`);
    }

    // Try to find VB-Cable with strictly 2 channels (avoiding 8-channel multi-channel endpoints like ID 7)
    let device = outputDevices.find((d: any) => {
      const name = d.name.toLowerCase();
      return (name.includes('cable') || name.includes('vbcable')) && d.maxOutputChannels === 2;
    });

    if (this.config.deviceSubstring) {
      const userSubstring = this.config.deviceSubstring.toLowerCase();
      const userDevice = outputDevices.find((d: any) =>
        d.name.toLowerCase().includes(userSubstring) && d.maxOutputChannels === 2
      );
      if (userDevice) {
        device = userDevice;
        console.log(`[sink] Usando dispositivo especificado pelo usuário (2 canais): ${device.name}`);
      }
    }

    if (!device) {
      device = outputDevices.find((d: any) => d.maxOutputChannels === 2) || outputDevices[0];
    }

    console.log(`[sink] usando dispositivo: ${device.name} (id=${device.id}, maxOutputChannels=${device.maxOutputChannels})`);

    // PortAudio callback: pull model - preenchemos buffer interno dinamicamente
    this.audioOutput = naudiodon2.AudioIO({
      outOptions: {
        sampleRate: this.config.sampleRate ?? SAMPLE_RATE,
        channelCount: 1,
        deviceId: device.id,
        sampleFormat: naudiodon2.SampleFormat16Bit,
        closeOnError: false,
      },
    });

    this.audioOutput.on('error', (err: Error) => {
      console.error('[sink] PortAudio error:', err.message);
    });

    try {
      this.audioOutput.start();
      console.log('[sink] PortAudio started successfully');
    } catch (err) {
      console.error('[sink] falha ao iniciar PortAudio:', (err as Error).message);
      throw err;
    }
  }

  write(samples: Int16Array): void {
    if (this.closed || !this.audioOutput) return;
    const buf = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
    try {
      this.audioOutput.write(buf);
    } catch (err) {
      // Ignorar erros de escrita em caso de encerramento
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
  }
}