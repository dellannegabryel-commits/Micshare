import LiveAudioStream from 'react-native-live-audio-stream';
import { PermissionsAndroid, Platform } from 'react-native';
import { Buffer } from 'buffer';

const SAMPLE_RATE = 48000;
const CHANNELS = 1;
const FRAME_MS = 10;
const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_MS) / 1000; // 480 samples = 960 bytes (int16)
const FRAME_BYTES = SAMPLES_PER_FRAME * 2;

export interface CaptureCallbacks {
  onFrame: (pcm: Int16Array) => void;
  onError?: (err: Error) => void;
  onStart?: () => void;
  onStop?: () => void;
}

export class AudioCapture {
  private running = false;
  private callbacks: CaptureCallbacks | null = null;
  private bufferAcc: Uint8Array = new Uint8Array(0);

  static async requestPermission(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
        if (!permission) return true;
        const granted = await PermissionsAndroid.request(permission, {
          title: 'Permissão de Microfone',
          message: 'Micshare precisa acessar o microfone para transmitir áudio ao PC.',
          buttonNeutral: 'Perguntar depois',
          buttonNegative: 'Cancelar',
          buttonPositive: 'OK',
        });
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.error('[capture] permission error:', err);
        return false;
      }
    }
    return true;
  }

  async start(callbacks: CaptureCallbacks): Promise<void> {
    if (this.running) return;
    this.callbacks = callbacks;

    const granted = await AudioCapture.requestPermission();
    if (!granted) {
      throw new Error('Permissão de microfone negada');
    }

    LiveAudioStream.init({
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: 16,
      audioSource: 6, // VOICE_RECOGNITION
      bufferSize: FRAME_BYTES,
      wavFile: '',
    });

    LiveAudioStream.on('data', (base64Data: string) => {
      this.handleChunk(base64Data);
    });

    this.running = true;
    this.callbacks.onStart?.();
    LiveAudioStream.start();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.callbacks?.onStop?.();
    LiveAudioStream.stop();
    this.callbacks = null;
    this.bufferAcc = new Uint8Array(0);
  }

  isRunning(): boolean {
    return this.running;
  }

  private handleChunk(base64Data: string): void {
    if (!this.running || !this.callbacks) return;

    try {
      const buf = Buffer.from(base64Data, 'base64');
      const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);

      // Accumulate incoming bytes
      const combined = new Uint8Array(this.bufferAcc.length + u8.length);
      combined.set(this.bufferAcc);
      combined.set(u8, this.bufferAcc.length);
      this.bufferAcc = combined;

      while (this.bufferAcc.length >= FRAME_BYTES) {
        const frameBytes = this.bufferAcc.slice(0, FRAME_BYTES);
        this.bufferAcc = this.bufferAcc.slice(FRAME_BYTES);

        const pcm = new Int16Array(
          frameBytes.buffer,
          frameBytes.byteOffset,
          FRAME_BYTES / 2
        );
        this.callbacks.onFrame(pcm);
      }
    } catch (err) {
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

export const audioCapture = new AudioCapture();
