import { Encoder, Decoder } from '@evan/opus';

export const OPUS_FRAME_MS = 20;
export const OPUS_SAMPLE_RATE = 48000;
export const OPUS_CHANNELS = 1;
export const OPUS_SAMPLES_PER_FRAME = (OPUS_SAMPLE_RATE * OPUS_FRAME_MS) / 1000; // 960 samples
export const OPUS_MAX_PACKET_BYTES = 1275;

export interface OpusEncoderInstance {
  encode(pcm: Int16Array): Uint8Array;
  reset(): void;
}

export interface OpusDecoderInstance {
  /** devolve PCM s16le cru (2 bytes por amostra) */
  decode(packet: Uint8Array): Uint8Array;
  reset(): void;
}

export function createEncoder(frameMs: number = OPUS_FRAME_MS): OpusEncoderInstance {
  const enc = new Encoder({ channels: 1, sample_rate: 48000, application: 'voip' });
  enc.bitrate = 24000;
  enc.complexity = 10;
  enc.signal = 'voice';
  enc.vbr = true;
  enc.inband_fec = true;
  enc.dtx = false;
  enc.expert_frame_duration = frameMs as 5 | 10 | 20 | 40 | 60 | 80 | 2.5 | 100 | 120;
  console.log(`[opus] Encoder criado: 24kbps VBR FEC ${frameMs}ms`);

  return {
    encode(pcm: Int16Array): Uint8Array {
      return enc.encode(pcm);
    },
    reset(): void {
      enc.reset();
    },
  };
}

export function createDecoder(frameMs: number = OPUS_FRAME_MS): OpusDecoderInstance {
  const dec = new Decoder({ channels: 1, sample_rate: 48000 });
  console.log(`[opus] Decoder criado ${frameMs}ms`);

  return {
    decode(packet: Uint8Array): Uint8Array {
      return dec.decode(packet);
    },
    reset(): void {
      dec.reset();
    },
  };
}

/** PLC: pacote vazio faz o decoder do Opus gerar o quadro de ocultação. */
export function decodeWithPLC(decoder: OpusDecoderInstance, packet: Uint8Array | null): Uint8Array {
  return decoder.decode(packet ?? new Uint8Array(0));
}
