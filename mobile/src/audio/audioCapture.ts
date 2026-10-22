import { Audio, AudioStreamEncoding } from 'expo-audio';
import { requestRecordingPermissionsAsync } from 'expo-av';

const SAMPLE_RATE = 48000;
const CHANNELS = 1;
const FRAME_MS = 10;
const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_MS) / 1000; // 480

export interface CaptureCallbacks {
  onFrame: (pcm: Int16Array) => void;
  onError?: (err: Error) => void;
  onStart?: () => void;
  onStop?: () => void;
}

export class AudioCapture {
  private stream: InstanceType<typeof Audio.AudioStream> | null = null;
  private running = false;
  private callbacks: CaptureCallbacks | null = null;

  static async requestPermission(): Promise<boolean> {
    try {
      const { status } = await requestRecordingPermissionsAsync();
      return status === 'granted';
    } catch (err) {
      console.error('[capture] permission error:', err);
      return false;
    }
  }

  async start(callbacks: CaptureCallbacks): Promise<void> {
    if (this.running) return;
    this.callbacks = callbacks;

    const { status } = await requestRecordingPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permissão de microfone negada');
    }

    this.stream = new Audio.AudioStream({
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      encoding: 'int16' as AudioStreamEncoding,
      onBuffer: (buffer: any) => this.handleBuffer(buffer),
    });

    this.running = true;
    this.callbacks.onStart?.();
    await this.stream.start();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.callbacks?.onStop?.();
    this.stream?.stop();
    this.stream = null;
    this.callbacks = null;
  }

  isRunning(): boolean {
    return this.running;
  }

  private handleBuffer(buffer: any): void {
    if (!this.running || !this.callbacks) return;

    // buffer.data é ArrayBuffer (int16 LE)
    let pcm = new Int16Array(buffer.data);

    // Ajusta para exatamente 480 samples (pad/truncate)
    if (pcm.length !== SAMPLES_PER_FRAME) {
      const fixed = new Int16Array(SAMPLES_PER_FRAME);
      const len = Math.min(pcm.length, SAMPLES_PER_FRAME);
      fixed.set(pcm.subarray(0, len));
      pcm = fixed;
    }

    this.callbacks.onFrame(pcm);
  }
}

export const audioCapture = new AudioCapture();