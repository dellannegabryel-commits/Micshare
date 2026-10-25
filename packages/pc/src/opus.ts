import { Encoder, Decoder, ctl } from '@evan/opus';

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
  decode(packet: Uint8Array): Int16Array;
  reset(): void;
}

export function createEncoder(frameMs: number = 20): OpusEncoderInstance {
  const samplesPerFrame = (OPUS_SAMPLE_RATE * frameMs) / 1000;
  const enc = new Encoder(OPUS_SAMPLE_RATE, OPUS_CHANNELS, ctl.application.voip);
  enc.ctl(ctl.set.bitrate, 24000);       // 24 kbps
  enc.ctl(ctl.set.complexity, 10);       // Max quality
  enc.ctl(ctl.set.signal, ctl.signal.voice);
  enc.ctl(ctl.set.vbr, 1);               // VBR enabled
  enc.ctl(ctl.set.inband_fec, 1);        // FEC enabled
  enc.ctl(ctl.set.dtx, 0);               // DTX disabled
  console.log(`[opus] Encoder created: 24kbps VBR FEC ${frameMs}ms`);

  return {
    encode(pcm: Int16Array): Uint8Array {
      // pcm is Int16Array of samplesPerFrame samples
      const out = enc.encode(pcm, samplesPerFrame);
      return out;
    },
    reset() {
      enc.ctl(ctl.set.reset_state, 1);
    }
  };
}

export function createDecoder(frameMs: number = 20): OpusDecoderInstance {
  const samplesPerFrame = (OPUS_SAMPLE_RATE * frameMs) / 1000;
  const dec = new Decoder(OPUS_SAMPLE_RATE, OPUS_CHANNELS);
  console.log(`[opus] Decoder created ${frameMs}ms`);

  return {
    decode(packet: Uint8Array): Int16Array {
      const out = dec.decode(packet, samplesPerFrame);
      return new Int16Array(out.buffer, out.byteOffset, out.length);
    },
    reset() {
      dec.ctl(ctl.set.reset_state, 1);
    }
  };
}

// PLC: Generate concealment frame on loss
export function decodeWithPLC(decoder: OpusDecoderInstance, packet: Uint8Array | null): Int16Array {
  if (packet === null || packet.length === 0) {
    // Opus decoder handles PLC when passed null/empty
    return decoder.decode(new Uint8Array(0));
  }
  return decoder.decode(packet);
}