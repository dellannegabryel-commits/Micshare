//! Audio capture, jitter buffer, and playback sink
//! Ported from TypeScript implementation

use crate::protocol::{
    AudioFrame, CODEC_PCM_S16LE, PCM_BYTES_PER_FRAME,
    SAMPLES_PER_FRAME, FRAME_MS,
};
use anyhow::{anyhow, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

const DEFAULT_TARGET_FRAMES: usize = 6;
const MAX_DEPTH_MS: u32 = 250;
const PLC_MAX_FRAMES: u32 = 3;

#[derive(Debug, Clone, Copy, Default, serde::Serialize, serde::Deserialize)]
pub struct JitterMetrics {
    pub received: u64,
    pub lost: u64,
    pub gaps: u64,
    pub buffer_ms: u32,
    pub underruns: u64,
    pub fast_forwards: u64,
    pub flushes: u64,
}

#[derive(Debug, Clone)]
struct BufferedFrame {
    seq: u32,
    capture_ts: u32,
    payload: Vec<u8>, // PCM s16le
}

pub struct JitterBuffer {
    buffer: VecDeque<BufferedFrame>,
    next_expected_seq: Option<u32>,
    last_capture_ts: Option<u32>,
    target_frames: usize,
    max_depth_frames: usize,
    read_pos: usize,
    metrics: JitterMetrics,
    plc_consecutive: u32,
    last_valid_sample: i16,
}

impl JitterBuffer {
    pub fn new() -> Self {
        Self {
            buffer: VecDeque::new(),
            next_expected_seq: None,
            last_capture_ts: None,
            target_frames: DEFAULT_TARGET_FRAMES,
            max_depth_frames: (MAX_DEPTH_MS / FRAME_MS) as usize,
            read_pos: 0,
            metrics: JitterMetrics::default(),
            plc_consecutive: 0,
            last_valid_sample: 0,
        }
    }

    pub fn push(&mut self, frame: AudioFrame) -> Result<()> {
        let header = frame.header;
        let payload = frame.payload;

        if payload.len() != PCM_BYTES_PER_FRAME {
            return Err(anyhow!("Invalid payload length: {}", payload.len()));
        }

        self.metrics.received += 1;

        if self.next_expected_seq.is_none() {
            self.next_expected_seq = Some(header.seq.wrapping_add(1));
        } else if header.seq != self.next_expected_seq.unwrap() {
            let expected = self.next_expected_seq.unwrap();
            let gap = header.seq.wrapping_sub(expected);
            if gap > 0 && gap < 1000 {
                self.metrics.lost += gap as u64;
                self.metrics.gaps += 1;
                // Insert silence frames for gap
                for g in 0..gap {
                    let silence = vec![0u8; PCM_BYTES_PER_FRAME];
                    self.buffer.push_back(BufferedFrame {
                        seq: expected.wrapping_add(g),
                        capture_ts: header.capture_ts,
                        payload: silence,
                    });
                }
            } else if gap != 0 {
                // Check for late/out-of-order
                if let Some(pos) = self.buffer.iter().position(|f| f.seq == header.seq) {
                    if pos < self.read_pos {
                        return Ok(()); // Already processed, drop
                    }
                }
            }
            self.next_expected_seq = Some(header.seq.wrapping_add(1));
        }

        // Check if already in buffer
        if !self.buffer.iter().any(|f| f.seq == header.seq) {
            self.buffer.push_back(BufferedFrame {
                seq: header.seq,
                capture_ts: header.capture_ts,
                payload,
            });
        }
        self.next_expected_seq = Some(header.seq.wrapping_add(1));
        self.last_capture_ts = Some(header.capture_ts);

        self.adapt_target(header.capture_ts);
        self.trim_depth();

        Ok(())
    }

    pub fn pop(&mut self) -> Vec<i16> {
        if self.buffer.is_empty() || self.read_pos >= self.buffer.len() {
            self.metrics.underruns += 1;
            if self.target_frames > 2 {
                self.target_frames -= 1;
            }
            // PLC: fade out last sample
            return self.generate_silence_with_fade();
        }

        // Get payload before potential drain
        let payload = self.buffer[self.read_pos].payload.clone();
        self.read_pos += 1;

        // Periodic cleanup
        if self.read_pos > 1000 {
            self.buffer.drain(0..self.read_pos);
            self.read_pos = 0;
        }

        self.metrics.buffer_ms = ((self.buffer.len().saturating_sub(self.read_pos)) * FRAME_MS as usize) as u32;

        // Convert PCM bytes to i16 samples
        let mut samples = Vec::with_capacity(SAMPLES_PER_FRAME);
        for chunk in payload.chunks_exact(2) {
            samples.push(i16::from_le_bytes([chunk[0], chunk[1]]));
        }
        if let Some(last) = samples.last() {
            self.last_valid_sample = *last;
            self.plc_consecutive = 0;
        }
        samples
    }

    fn generate_silence_with_fade(&mut self) -> Vec<i16> {
        let mut samples = Vec::with_capacity(SAMPLES_PER_FRAME);
        if self.plc_consecutive < PLC_MAX_FRAMES && self.last_valid_sample != 0 {
            let mut current = self.last_valid_sample as f32;
            for _ in 0..SAMPLES_PER_FRAME {
                current *= 0.80;
                samples.push(current.round() as i16);
            }
            self.plc_consecutive += 1;
        } else {
            // Full silence after max PLC frames
            samples.resize(SAMPLES_PER_FRAME, 0);
            self.plc_consecutive = 0;
            self.last_valid_sample = 0;
        }
        samples
    }

    pub fn metrics(&self) -> JitterMetrics {
        self.metrics
    }

    pub fn depth(&self) -> usize {
        self.buffer.len().saturating_sub(self.read_pos)
    }

    fn adapt_target(&mut self, capture_ts: u32) {
        if let Some(last_ts) = self.last_capture_ts {
            let jitter = (capture_ts as i32 - last_ts as i32).abs() - FRAME_MS as i32;
            if jitter > 15 {
                self.target_frames = (self.target_frames + 1).min(10);
            } else if jitter < 5 && self.depth() > self.target_frames + 2 {
                self.target_frames = (self.target_frames - 1).max(4);
            }
        }
    }

    fn trim_depth(&mut self) {
        while self.depth() > self.max_depth_frames {
            if !self.buffer.is_empty() {
                self.buffer.pop_front();
                if self.read_pos > 0 {
                    self.read_pos -= 1;
                }
                self.metrics.fast_forwards += 1;
            } else {
                break;
            }
        }
        // Full flush if way over
        if self.depth() > self.max_depth_frames * 2 {
            self.buffer.clear();
            self.read_pos = 0;
            self.next_expected_seq = None;
            self.metrics.flushes += 1;
        }
    }
}

impl Default for JitterBuffer {
    fn default() -> Self {
        Self::new()
    }
}

/// Audio output sink using cpal
pub struct AudioSink {
    stream: Option<cpal::Stream>,
    sample_rate: u32,
    device_name: String,
}

impl AudioSink {
    pub fn new(device_substring: Option<String>) -> Result<Self> {
        let host = cpal::default_host();
        let devices = host.devices()?;

        // Find matching device
        let device = if let Some(substr) = device_substring {
            let substr = substr.to_lowercase();
            devices
                .filter(|d| d.to_string().to_lowercase().contains(&substr))
                .next()
        } else {
            // Prefer VB-Cable with 2 channels
            devices
                .filter(|d| {
                    let name = d.to_string().to_lowercase();
                    let supports_stereo = d.supported_output_configs()
                        .map(|mut c| c.any(|c| c.channels() == 2))
                        .unwrap_or(false);
                    (name.contains("cable") || name.contains("vb-audio"))
                        && supports_stereo
                })
                .next()
                .or_else(|| host.default_output_device())
        }.ok_or_else(|| anyhow!("No suitable output device found"))?;

        let device_name = device.to_string();

        Ok(Self {
            stream: None,
            sample_rate: 48000,
            device_name,
        })
    }

    pub fn device_name(&self) -> &str {
        &self.device_name
    }

    pub fn start(&mut self, shared_buffer: Arc<Mutex<JitterBuffer>>) -> Result<()> {
        let host = cpal::default_host();
        let device = host
            .output_devices()?
            .find(|d| d.to_string() == self.device_name)
            .ok_or_else(|| anyhow!("Device not found: {}", self.device_name))?;

        let stream = device.build_output_stream(
            cpal::StreamConfig {
                channels: 1,
                sample_rate: self.sample_rate,
                buffer_size: cpal::BufferSize::Fixed(480),
            },
            move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                let mut buffer = shared_buffer.lock();
                let samples = buffer.pop();
                for (i, sample) in samples.iter().enumerate() {
                    if i < data.len() {
                        data[i] = *sample as f32 / i16::MAX as f32;
                    }
                }
                // Fill remaining with silence if needed
                for i in samples.len()..data.len() {
                    data[i] = 0.0;
                }
            },
            |err| eprintln!("Audio stream error: {}", err),
            None,
        )?;

        stream.play()?;
        self.stream = Some(stream);
        Ok(())
    }

    pub fn stop(&mut self) {
        if let Some(stream) = self.stream.take() {
            drop(stream);
        }
    }
}

impl Drop for AudioSink {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Audio input capture (for testing or future mobile-like functionality)
pub struct AudioCapture {
    stream: Option<cpal::Stream>,
    sample_rate: u32,
    frame_tx: Option<crossbeam::channel::Sender<AudioFrame>>,
    seq: Arc<AtomicU32>,
}

impl AudioCapture {
    pub fn new() -> Self {
        Self {
            stream: None,
            sample_rate: 48000,
            frame_tx: None,
            seq: Arc::new(AtomicU32::new(0)),
        }
    }

    pub fn start(
        &mut self,
        device_substring: Option<String>,
        frame_tx: crossbeam::channel::Sender<AudioFrame>,
    ) -> Result<()> {
        let host = cpal::default_host();
        let device = if let Some(substr) = device_substring {
            host.input_devices()?
                .find(|d| d.to_string().to_lowercase().contains(&substr.to_lowercase()))
        } else {
            host.default_input_device()
        }.ok_or_else(|| anyhow!("No input device found"))?;

        let frame_tx = frame_tx.clone();
        let seq = self.seq.clone();

        let stream = device.build_input_stream(
            cpal::StreamConfig {
                channels: 1,
                sample_rate: 48000,
                buffer_size: cpal::BufferSize::Fixed(480),
            },
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                // Convert f32 [-1,1] to i16 PCM
                let mut payload = Vec::with_capacity(PCM_BYTES_PER_FRAME);
                for sample in data.iter().take(SAMPLES_PER_FRAME) {
                    let s = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                    payload.extend_from_slice(&s.to_le_bytes());
                }
                // Pad if needed
                while payload.len() < PCM_BYTES_PER_FRAME {
                    payload.extend_from_slice(&0i16.to_le_bytes());
                }

                let frame = AudioFrame::new(
                    seq.fetch_add(1, Ordering::Relaxed),
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u32,
                    payload,
                    CODEC_PCM_S16LE,
                ).unwrap();

                let _ = frame_tx.try_send(frame);
            },
            |err| eprintln!("Capture error: {}", err),
            None,
        )?;

        stream.play()?;
        self.stream = Some(stream);
        Ok(())
    }

    pub fn stop(&mut self) {
        self.stream = None;
        self.frame_tx = None;
    }
}

impl Drop for AudioCapture {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jitter_buffer_basic() {
        let mut jb = JitterBuffer::new();
        let frame = AudioFrame::new(1, 1000, vec![0u8; PCM_BYTES_PER_FRAME], CODEC_PCM_S16LE).unwrap();
        jb.push(frame).unwrap();
        let samples = jb.pop();
        assert_eq!(samples.len(), SAMPLES_PER_FRAME);
    }

    #[test]
    fn test_jitter_buffer_gap() {
        let mut jb = JitterBuffer::new();
        // Push frame 1
        jb.push(AudioFrame::new(1, 1000, vec![0u8; PCM_BYTES_PER_FRAME], CODEC_PCM_S16LE).unwrap()).unwrap();
        // Push frame 5 (gap of 3)
        jb.push(AudioFrame::new(5, 1040, vec![0u8; PCM_BYTES_PER_FRAME], CODEC_PCM_S16LE).unwrap()).unwrap();

        let m = jb.metrics();
        assert_eq!(m.lost, 3);
        assert_eq!(m.gaps, 1);

        // Should get frame 1, then 3 silence frames, then frame 5
        for _ in 0..5 {
            jb.pop();
        }
    }
}