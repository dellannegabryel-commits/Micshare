// Jitter buffer adaptativo com relógio injetável (testável) e antirruído de underrun.
import {
  FLAG_SILENCE,
  PCM_BYTES_PER_FRAME,
  SAMPLE_RATE,
  SAMPLES_PER_FRAME,
} from '@micshare/protocol';

export interface JitterMetrics {
  received: number;
  lost: number;
  gaps: number;
  bufferMs: number;
  underruns: number;
  fastForwards: number;
  flushes: number;
}

export interface JitterConfig {
  targetMinFrames: number; // 2
  targetMaxFrames: number; // 8
  maxDepthMs: number;      // 250
  plcMaxFrames: number;    // 3
}

export class JitterBuffer {
  private buffer: Buffer[] = []; // PCM frames (s16le, 480 samples cada)
  private seqs: number[] = [];   // seq correspondente a cada frame no buffer
  private nextExpectedSeq: number | null = null;
  private lastCaptureTs: number | null = null;
  private targetFrames = 6;      // Aumentado para 6 para maior estabilidade contra jitter
  private maxDepthMs = 250;
  private readPos = 0;

  private metrics: JitterMetrics = {
    received: 0, lost: 0, gaps: 0, bufferMs: 0, underruns: 0, fastForwards: 0, flushes: 0,
  };

  private now: () => number;

  constructor(config: Partial<JitterConfig> = {}, now: () => number = Date.now) {
    this.targetFrames = config.targetMinFrames ?? 6;
    this.maxDepthMs = config.maxDepthMs ?? 250;
    this.now = now;
  }

  push(seq: number, captureTs: number, payload: Buffer): boolean {
    if (payload.length !== PCM_BYTES_PER_FRAME) return false;

    this.metrics.received += 1;

    if (this.nextExpectedSeq === null) {
      this.nextExpectedSeq = seq + 1;
    } else if (seq !== this.nextExpectedSeq) {
      const gap = (seq - this.nextExpectedSeq) & 0xffffffff;
      if (gap > 0 && gap < 1000) {
        this.metrics.lost += gap;
        this.metrics.gaps += 1;
        for (let g = 0; g < gap; g++) {
          this.buffer.push(Buffer.alloc(PCM_BYTES_PER_FRAME));
          this.seqs.push((this.nextExpectedSeq + g) & 0xffffffff);
        }
      } else if (gap !== 0) {
        const idx = this.seqs.indexOf(seq);
        if (idx === -1 || idx < this.readPos) {
          return true;
        }
      }
      this.nextExpectedSeq = seq + 1;
    }

    if (!this.seqs.includes(seq)) {
      this.buffer.push(payload);
      this.seqs.push(seq);
    }
    this.nextExpectedSeq = (seq + 1) & 0xffffffff;
    this.lastCaptureTs = captureTs;

    this.adaptTarget(captureTs);
    this.trimDepth();
    return true;
  }

  pop(): Buffer | null {
    if (this.buffer.length === 0 || this.readPos >= this.buffer.length) {
      this.metrics.underruns += 1;
      this.targetFrames = Math.max(this.targetFrames - 1, 2);

      // Retorna silêncio com rampa de decaimento suave para eliminar cliques/pipocos
      const silence = Buffer.alloc(PCM_BYTES_PER_FRAME);
      if (this.buffer.length > 0 && this.readPos > 0) {
        const lastFrame = this.buffer[this.readPos - 1];
        if (lastFrame && lastFrame.length >= 2) {
          const lastSample = lastFrame.readInt16LE(lastFrame.length - 2);
          let currentSample = lastSample;
          for (let i = 0; i < Math.min(100, silence.length / 2); i++) {
            currentSample = Math.round(currentSample * 0.80);
            silence.writeInt16LE(currentSample, i * 2);
          }
        }
      }
      return silence;
    }

    const frame = this.buffer[this.readPos];
    this.readPos += 1;

    if (this.readPos > 1000) {
      this.buffer = this.buffer.slice(this.readPos);
      this.seqs = this.seqs.slice(this.readPos);
      this.readPos = 0;
    }

    this.metrics.bufferMs = Math.round(((this.buffer.length - this.readPos) * 10) / 1);
    return frame;
  }

  depth(): number {
    return this.buffer.length - this.readPos;
  }

  getMetrics(): JitterMetrics {
    return { ...this.metrics };
  }

  private adaptTarget(captureTs: number): void {
    if (this.lastCaptureTs === null) return;
    const jitter = Math.abs(captureTs - this.lastCaptureTs) - 10;
    if (jitter > 15) {
      this.targetFrames = Math.min(this.targetFrames + 1, 10);
    } else if (jitter < 5 && this.depth() > this.targetFrames + 2) {
      this.targetFrames = Math.max(this.targetFrames - 1, 4);
    }
  }

  private trimDepth(): void {
    const maxFrames = Math.round(this.maxDepthMs / 10);
    while (this.depth() > maxFrames) {
      this.buffer.shift();
      this.seqs.shift();
      this.readPos = Math.max(0, this.readPos - 1);
      this.metrics.fastForwards += 1;
    }
    if (this.depth() > maxFrames * 2) {
      this.buffer = [];
      this.seqs = [];
      this.readPos = 0;
      this.nextExpectedSeq = null;
      this.metrics.flushes += 1;
    }
  }
}

export class JitterMetrics {}