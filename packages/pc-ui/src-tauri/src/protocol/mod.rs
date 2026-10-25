//! Micshare binary protocol definitions
//! Matches TypeScript implementation in packages/protocol

use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read, Write};
use thiserror::Error;

pub const MAGIC: u16 = 0x4D53; // "MS"
pub const VERSION: u8 = 1;
pub const HEADER_SIZE: usize = 16;
pub const MAX_PAYLOAD_LEN: u16 = 1472;
pub const SAMPLE_RATE: u32 = 48000;
pub const FRAME_MS: u32 = 10;
pub const SAMPLES_PER_FRAME: usize = 480;
pub const PCM_BYTES_PER_FRAME: usize = SAMPLES_PER_FRAME * 2;
pub const CODEC_PCM_S16LE: u8 = 0;
pub const CODEC_OPUS: u8 = 1;
pub const FLAG_SILENCE: u8 = 1 << 0;
pub const FLAG_MUTED: u8 = 1 << 1;

pub const BEACON_PORT: u16 = 41234;
pub const AUDIO_PORT: u16 = 41235;
pub const CTRL_PORT: u16 = 41236;

#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error("Invalid magic bytes: expected 0x4D53, got 0x{0:04X}")]
    InvalidMagic(u16),
    #[error("Unsupported version: {0}")]
    UnsupportedVersion(u8),
    #[error("Payload length mismatch: header says {header}, actual {actual}")]
    PayloadLengthMismatch { header: u16, actual: usize },
    #[error("Payload too large: {0} > {MAX_PAYLOAD_LEN}")]
    PayloadTooLarge(u16),
    #[error("Invalid channels: expected 1, got {0}")]
    InvalidChannels(u8),
    #[error("Unsupported codec: {0}")]
    UnsupportedCodec(u8),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Buffer too small: need {need}, have {have}")]
    BufferTooSmall { need: usize, have: usize },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct AudioFrameHeader {
    pub magic: u16,
    pub version: u8,
    pub flags: u8,
    pub seq: u32,
    pub capture_ts: u32,
    pub payload_len: u16,
    pub channels: u8,
    pub codec: u8,
}

impl AudioFrameHeader {
    pub fn new(seq: u32, capture_ts: u32, payload_len: u16, codec: u8) -> Self {
        Self {
            magic: MAGIC,
            version: VERSION,
            flags: 0,
            seq,
            capture_ts,
            payload_len,
            channels: 1,
            codec,
        }
    }

    pub fn is_muted(&self) -> bool {
        (self.flags & FLAG_MUTED) != 0
    }

    pub fn is_silence(&self) -> bool {
        (self.flags & FLAG_SILENCE) != 0
    }

    pub fn set_muted(&mut self, muted: bool) {
        if muted {
            self.flags |= FLAG_MUTED;
        } else {
            self.flags &= !FLAG_MUTED;
        }
    }

    pub fn encode(&self) -> [u8; HEADER_SIZE] {
        let mut buf = [0u8; HEADER_SIZE];
        buf[0..2].copy_from_slice(&self.magic.to_be_bytes());
        buf[2] = self.version;
        buf[3] = self.flags;
        buf[4..8].copy_from_slice(&self.seq.to_be_bytes());
        buf[8..12].copy_from_slice(&self.capture_ts.to_be_bytes());
        buf[12..14].copy_from_slice(&self.payload_len.to_be_bytes());
        buf[14] = self.channels;
        buf[15] = self.codec;
        buf
    }

    pub fn decode(buf: &[u8]) -> Result<Self, ProtocolError> {
        if buf.len() < HEADER_SIZE {
            return Err(ProtocolError::BufferTooSmall {
                need: HEADER_SIZE,
                have: buf.len(),
            });
        }
        let magic = u16::from_be_bytes([buf[0], buf[1]]);
        if magic != MAGIC {
            return Err(ProtocolError::InvalidMagic(magic));
        }
        let version = buf[2];
        if version != VERSION {
            return Err(ProtocolError::UnsupportedVersion(version));
        }
        let flags = buf[3];
        let seq = u32::from_be_bytes([buf[4], buf[5], buf[6], buf[7]]);
        let capture_ts = u32::from_be_bytes([buf[8], buf[9], buf[10], buf[11]]);
        let payload_len = u16::from_be_bytes([buf[12], buf[13]]);
        if payload_len > MAX_PAYLOAD_LEN {
            return Err(ProtocolError::PayloadTooLarge(payload_len));
        }
        let channels = buf[14];
        if channels != 1 {
            return Err(ProtocolError::InvalidChannels(channels));
        }
        let codec = buf[15];
        if codec != CODEC_PCM_S16LE && codec != CODEC_OPUS {
            return Err(ProtocolError::UnsupportedCodec(codec));
        }
        Ok(Self {
            magic,
            version,
            flags,
            seq,
            capture_ts,
            payload_len,
            channels,
            codec,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioFrame {
    pub header: AudioFrameHeader,
    pub payload: Vec<u8>,
}

impl AudioFrame {
    pub fn new(seq: u32, capture_ts: u32, payload: Vec<u8>, codec: u8) -> Result<Self, ProtocolError> {
        if payload.len() > MAX_PAYLOAD_LEN as usize {
            return Err(ProtocolError::PayloadTooLarge(payload.len() as u16));
        }
        let header = AudioFrameHeader::new(seq, capture_ts, payload.len() as u16, codec);
        Ok(Self { header, payload })
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(HEADER_SIZE + self.payload.len());
        buf.extend_from_slice(&self.header.encode());
        buf.extend_from_slice(&self.payload);
        buf
    }

    pub fn decode(buf: &[u8]) -> Result<Self, ProtocolError> {
        let header = AudioFrameHeader::decode(buf)?;
        if buf.len() != HEADER_SIZE + header.payload_len as usize {
            return Err(ProtocolError::PayloadLengthMismatch {
                header: header.payload_len,
                actual: buf.len() - HEADER_SIZE,
            });
        }
        let payload = buf[HEADER_SIZE..].to_vec();
        Ok(Self { header, payload })
    }
}

/// Control messages over WebSocket (JSON)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "t")]
pub enum CtrlMessage {
    #[serde(rename = "hello")]
    Hello {
        v: u8,
        token: String,
        sample_rate: u32,
        channels: u8,
        codec: String,
        frame_ms: u32,
        #[serde(default)]
        supported_codecs: Vec<String>,
    },
    #[serde(rename = "mute")]
    Mute { value: bool },
    #[serde(rename = "volume")]
    Volume { value: f32 },
    #[serde(rename = "bye")]
    Bye,
    #[serde(rename = "welcome")]
    Welcome {
        session_id: String,
        audio_port: u16,
        target_buffer_ms: u32,
        codec: String,
    },
    #[serde(rename = "stats")]
    Stats {
        loss_pct: f32,
        buffer_ms: u32,
        seq_gaps: u32,
        reconnects: u32,
    },
    #[serde(rename = "error")]
    Error { code: String, message: String },
}

impl CtrlMessage {
    pub fn encode(&self) -> String {
        serde_json::to_string(self).unwrap()
    }

    pub fn decode(text: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_header_encode_decode() {
        let header = AudioFrameHeader::new(1, 1000, 960, CODEC_PCM_S16LE);
        let encoded = header.encode();
        let decoded = AudioFrameHeader::decode(&encoded).unwrap();
        assert_eq!(header, decoded);
    }

    #[test]
    fn test_frame_encode_decode() {
        let payload = vec![0u8; PCM_BYTES_PER_FRAME];
        let frame = AudioFrame::new(42, 5000, payload, CODEC_PCM_S16LE).unwrap();
        let encoded = frame.encode();
        let decoded = AudioFrame::decode(&encoded).unwrap();
        assert_eq!(frame.header.seq, decoded.header.seq);
        assert_eq!(frame.payload.len(), decoded.payload.len());
    }

    #[test]
    fn test_ctrl_message_hello() {
        let msg = CtrlMessage::Hello {
            v: 1,
            token: "".to_string(),
            sample_rate: 48000,
            channels: 1,
            codec: "pcm16".to_string(),
            frame_ms: 10,
            supported_codecs: vec!["pcm".to_string(), "opus".to_string()],
        };
        let encoded = msg.encode();
        let decoded = CtrlMessage::decode(&encoded).unwrap();
        assert!(matches!(decoded, CtrlMessage::Hello { .. }));
    }
}