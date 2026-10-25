//! Opus decoder wrapper
//! Uses the @evan/opus crate or similar

use anyhow::Result;

pub struct OpusDecoder {
    // State will be added when we integrate actual Opus decoding
    sample_rate: u32,
    channels: u32,
}

impl OpusDecoder {
    pub fn new(sample_rate: u32, channels: u32) -> Result<Self> {
        // TODO: Initialize actual Opus decoder
        Ok(Self { sample_rate, channels })
    }

    pub fn decode(&mut self, data: &[u8]) -> Result<Vec<i16>> {
        // TODO: Actual Opus decoding
        // For now, return silence
        Ok(vec![0i16; 960]) // 10ms at 48kHz mono
    }

    pub fn reset(&mut self) {
        // TODO: Reset decoder state
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_opus_decoder_creation() {
        let decoder = OpusDecoder::new(48000, 1);
        assert!(decoder.is_ok());
    }
}