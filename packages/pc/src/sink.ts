import { PCM_BYTES_PER_FRAME, SAMPLE_RATE } from '@micshare/protocol';
import type { DeviceInfo } from './serverState.js';

export interface SinkConfig {
  deviceSubstring?: string;
  sampleRate?: number;
  frameMs?: number;
}

const MAX_GAIN = 4;

/** Carrega naudiodon2 tanto em CJS (namespace) quanto em ESM (default). */
async function loadNaudiodon(): Promise<any> {
  const mod: any = await import('naudiodon2');
  return mod?.getDevices ? mod : mod?.default;
}

export class AudioSink {
  private audioOutput: any = null;
  private closed = false;
  private gain = 1;
  private device: DeviceInfo | null = null;
  private requested: string | null = null;
  private scratch: Int16Array | null = null;

  constructor(private config: SinkConfig = {}) {}

  static async listDevices(): Promise<DeviceInfo[]> {
    const naudiodon2 = await loadNaudiodon();
    const devices = naudiodon2.getDevices() as Array<{ id: number; name: string; maxOutputChannels: number }>;
    return devices
      .filter((d) => d.maxOutputChannels > 0)
      .map((d) => ({ id: d.id, name: d.name, channels: d.maxOutputChannels }));
  }

  async open(deviceSubstring?: string): Promise<void> {
    const naudiodon2 = await loadNaudiodon();
    const devices = await AudioSink.listDevices();
    if (devices.length === 0) throw new Error('nenhum dispositivo de saída encontrado');

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

    this.audioOutput.on('error', (err: Error) => {
      console.error('[sink] PortAudio error:', err.message);
    });

    try {
      this.audioOutput.start();
    } catch (err) {
      this.audioOutput = null;
      throw new Error(`falha ao iniciar PortAudio em "${device.name}": ${(err as Error).message}`);
    }

    this.device = device;
    this.requested = wanted ?? null;
    this.closed = false;
    console.log(`[sink] usando dispositivo: ${device.name} (id=${device.id}, maxOutputChannels=${device.channels})`);
  }

  /** Reabre o sink; em caso de falha, volta para o dispositivo anterior. */
  async reopen(deviceSubstring?: string): Promise<DeviceInfo> {
    const previous = this.requested;
    const target = deviceSubstring ?? previous ?? undefined;
    this.close();
    try {
      await this.open(target);
      return this.device!;
    } catch (err) {
      if (previous && previous !== target) {
        try {
          await this.open(previous);
        } catch {
          // mantém o erro original
        }
      }
      throw err;
    }
  }

  currentDevice(): DeviceInfo | null {
    return this.device;
  }

  requestedDevice(): string | null {
    return this.requested;
  }

  setGain(gain: number): number {
    this.gain = Math.min(MAX_GAIN, Math.max(0, Number.isFinite(gain) ? gain : 1));
    return this.gain;
  }

  getGain(): number {
    return this.gain;
  }

  write(samples: Int16Array): void {
    if (this.closed || !this.audioOutput) return;

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
    } catch {
      // escrita durante encerramento: ignora
    }
  }

  writeSilence(): void {
    this.write(new Int16Array(PCM_BYTES_PER_FRAME / 2));
  }

  close(): void {
    this.closed = true;
    this.device = null;
    if (this.audioOutput) {
      try {
        this.audioOutput.quit();
      } catch (err) {
        console.error('[sink] erro ao fechar PortAudio:', (err as Error).message);
      }
      this.audioOutput = null;
    }
  }

  private pick(devices: DeviceInfo[], wanted?: string | null): DeviceInfo {
    if (wanted) {
      const needle = wanted.toLowerCase();
      const match =
        devices.find((d) => d.name.toLowerCase().includes(needle) && d.channels === 2) ??
        devices.find((d) => d.name.toLowerCase().includes(needle));
      if (!match) {
        throw new Error(
          `dispositivo "${wanted}" não encontrado. Use "devices" para listar as saídas disponíveis.`
        );
      }
      return match;
    }

    const cable = devices.find((d) => /cable|vb-audio/i.test(d.name) && d.channels === 2);
    return cable ?? devices.find((d) => d.channels === 2) ?? devices[0];
  }
}
