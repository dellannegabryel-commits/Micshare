// Jitter buffer adaptativo com relógio injetável (testável).
import { PCM_BYTES_PER_FRAME, } from '@micshare/protocol';
export class JitterBuffer {
    buffer = []; // PCM frames (s16le, 480 samples cada)
    seqs = []; // seq correspondente a cada frame no buffer
    nextExpectedSeq = null;
    lastCaptureTs = null;
    targetFrames = 4;
    maxDepthMs = 250;
    readPos = 0; // índice lógico dentro do buffer (não fazemos shift para evitar cópia)
    metrics = {
        received: 0, lost: 0, gaps: 0, bufferMs: 0, underruns: 0, fastForwards: 0, flushes: 0,
    };
    now;
    constructor(config = {}, now = Date.now) {
        this.targetFrames = config.targetMinFrames ?? 4;
        this.maxDepthMs = config.maxDepthMs ?? 250;
        this.now = now;
    }
    // Recebe um frame decodificado. Retorna true se aceito.
    push(seq, captureTs, payload) {
        if (payload.length !== PCM_BYTES_PER_FRAME)
            return false;
        this.metrics.received += 1;
        if (this.nextExpectedSeq === null) {
            this.nextExpectedSeq = seq + 1;
        }
        else if (seq !== this.nextExpectedSeq) {
            // gap ou reordenação detectados
            const gap = (seq - this.nextExpectedSeq) & 0xffffffff;
            if (gap > 0 && gap < 1000) {
                // seq > nextExpectedSeq: frames perdidos (gap)
                this.metrics.lost += gap;
                this.metrics.gaps += 1;
                // preenche gap com silêncio para manter o alinhamento do sink
                for (let g = 0; g < gap; g++) {
                    this.buffer.push(Buffer.alloc(PCM_BYTES_PER_FRAME));
                    this.seqs.push((this.nextExpectedSeq + g) & 0xffffffff);
                }
            }
            else if (gap !== 0) {
                // seq < nextExpectedSeq: frame atrasado (reordenação tardia)
                // se já passamos dessa posição no buffer, descarta
                const idx = this.seqs.indexOf(seq);
                if (idx === -1 || idx < this.readPos) {
                    return true; // descarta silenciosamente
                }
            }
            this.nextExpectedSeq = seq + 1;
        }
        // evita duplicar se já existe no buffer (reordenação dentro da janela)
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
    // Lê o próximo frame para reprodução. Retorna Buffer ou null se underrun.
    pop() {
        if (this.buffer.length === 0 || this.readPos >= this.buffer.length) {
            this.metrics.underruns += 1;
            this.targetFrames = Math.max(this.targetFrames - 1, 2);
            return Buffer.alloc(PCM_BYTES_PER_FRAME); // silêncio
        }
        const frame = this.buffer[this.readPos];
        this.readPos += 1;
        // compacta ocasionalmente para não crescer indefinidamente
        if (this.readPos > 1000) {
            this.buffer = this.buffer.slice(this.readPos);
            this.seqs = this.seqs.slice(this.readPos);
            this.readPos = 0;
        }
        this.metrics.bufferMs = Math.round(((this.buffer.length - this.readPos) * 10) / 1); // frames * 10 ms
        return frame;
    }
    depth() {
        return this.buffer.length - this.readPos;
    }
    getMetrics() {
        return { ...this.metrics };
    }
    adaptTarget(captureTs) {
        if (this.lastCaptureTs === null)
            return;
        const jitter = Math.abs(captureTs - this.lastCaptureTs) - 10; // desvio do intervalo de 10 ms
        if (jitter > 15) {
            this.targetFrames = Math.min(this.targetFrames + 1, 8);
        }
        else if (jitter < 5 && this.depth() > this.targetFrames + 2) {
            this.targetFrames = Math.max(this.targetFrames - 1, 2);
        }
    }
    trimDepth() {
        const maxFrames = Math.round(this.maxDepthMs / 10);
        while (this.depth() > maxFrames) {
            // descarta o frame mais antigo (fast-forward)
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
export class JitterMetrics {
}
