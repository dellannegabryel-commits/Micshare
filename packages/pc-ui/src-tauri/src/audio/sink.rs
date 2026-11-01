//! Saída de áudio via `cpal`.
//!
//! O callback do `cpal` roda em uma thread de tempo real: ele nunca bloqueia
//! e nunca aloca. O jitter buffer é acessado com `try_lock` — se o lock
//! estiver contended, o callback escreve silêncio.
//!
//! Pipeline:
//! - JitterBuffer entrega amostras **mono contínuas** a 48 kHz (taxa do pipeline).
//! - Se o dispositivo roda em taxa diferente, `LinearResampler` converte
//!   48 kHz → taxa nativa (interpolação linear, fase preservada entre blocos).
//! - O callback escreve **interleaved multicanal**: cada amostra mono é duplicada
//!   em todos os canais do dispositivo (fix do "bilu": antes tratava estéreo como mono).

use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig, SupportedStreamConfig};

use super::jitter::{JitterBuffer, PopStatus};
use super::resample::LinearResampler;

type DynError = Box<dyn std::error::Error + Send + Sync>;

/// Dispositivo de saída disponível no PC.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputDevice {
    /// Índice do dispositivo na lista do host.
    pub index: usize,
    /// Nome do dispositivo.
    pub name: String,
    /// `true` se for o dispositivo padrão do sistema.
    pub is_default: bool,
}

/// Lista os dispositivos de saída do host padrão de áudio.
pub fn output_devices() -> Result<Vec<OutputDevice>, DynError> {
    let host = cpal::default_host();
    let default_name = host
        .default_output_device()
        .map(|device| device_name(&device));

    let devices = host
        .output_devices()?
        .enumerate()
        .map(|(index, device)| {
            let name = device_name(&device);
            let is_default = default_name.as_deref() == Some(name.as_str());
            OutputDevice {
                index,
                name,
                is_default,
            }
        })
        .collect();

    Ok(devices)
}

/// Formatos de saída suportados por um dispositivo.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputFormat {
    /// Taxa de amostragem (Hz).
    pub sample_rate: u32,
    /// Número de canais.
    pub channels: u16,
    /// Formato das amostras (`I16`, `F32`, ...).
    pub format: String,
}

/// Configurações suportadas por um dispositivo de saída.
///
/// O dispositivo pode rodar em uma taxa diferente da do stream (ex.: fone
/// Bluetooth em HFP usa 16 kHz) — por isso a UI precisa conhecer os formatos
/// reais antes de abrir o stream.
pub fn supported_formats(name: &str) -> Result<Vec<OutputFormat>, DynError> {
    let host = cpal::default_host();

    for device in host.output_devices()? {
        if device_name(&device) != name {
            continue;
        }

        let mut formats = Vec::new();
        for range in device.supported_output_configs()? {
            formats.push(OutputFormat {
                sample_rate: range.min_sample_rate(),
                channels: range.channels(),
                format: format!("{:?}", range.sample_format()),
            });
        }
        return Ok(formats);
    }

    Err(format!("dispositivo '{name}' não encontrado").into())
}

/// Configuração padrão (taxa nativa) de um dispositivo de saída.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputDefaults {
    /// Taxa de amostragem nativa (Hz).
    pub sample_rate: u32,
    /// Número de canais.
    pub channels: u16,
    /// Formato das amostras (`I16`, `F32`, ...).
    pub format: String,
}

/// Configuração padrão do dispositivo de saída.
pub fn default_config(name: &str) -> Result<OutputDefaults, DynError> {
    let host = cpal::default_host();

    for device in host.output_devices()? {
        if device_name(&device) != name {
            continue;
        }

        let config = device.default_output_config()?;
        return Ok(OutputDefaults {
            sample_rate: config.sample_rate(),
            channels: config.channels(),
            format: format!("{:?}", config.sample_format()),
        });
    }

    Err(format!("dispositivo '{name}' não encontrado").into())
}

/// Estado interno do callback de áudio (não `Sync`, vive na thread do stream).
struct Playout {
    /// Buffer mono do jitter (48 kHz).
    buffer: Arc<Mutex<JitterBuffer>>,
    /// Reamostrador 48 kHz → taxa do dispositivo (None = passthrough).
    resampler: Option<LinearResampler>,
    /// Canais do dispositivo de saída.
    channels: u16,
    /// Buffer temporário mono (48 kHz) para `pop_into`.
    mono_buf: Vec<i16>,
    /// Buffer temporário mono reamostrado (taxa do dispositivo).
    resampled_buf: Vec<i16>,
}

impl Playout {
    /// Cria o estado de playout a partir da configuração suportada do dispositivo.
    fn new(buffer: Arc<Mutex<JitterBuffer>>, supported: &SupportedStreamConfig) -> Self {
        let device_sample_rate = supported.sample_rate();
        let channels = supported.channels();

        let resampler = if device_sample_rate == crate::audio::SAMPLE_RATE {
            None
        } else {
            Some(LinearResampler::new(
                crate::audio::SAMPLE_RATE,
                device_sample_rate,
            ))
        };

        // Tamanho do buffer mono = 10 ms a 48 kHz = 480 amostras.
        let mono_buf = vec![0_i16; crate::audio::FRAME_SAMPLES];
        // Buffer reamostrado: pior caso 48k->192k = 4x, aloca com folga.
        let max_out = if let Some(r) = &resampler {
            (crate::audio::FRAME_SAMPLES as f64 * r.step).ceil() as usize + 16
        } else {
            crate::audio::FRAME_SAMPLES
        };
        let resampled_buf = vec![0_i16; max_out];

        Self {
            buffer,
            resampler,
            channels,
            mono_buf,
            resampled_buf,
        }
    }

    /// Callback para formato I16.
    fn fill_i16(&mut self, data: &mut [i16]) {
        self.fill_interleaved(data);
    }

    /// Callback para formato F32.
    fn fill_f32(&mut self, data: &mut [f32]) {
        // Converte para i16 no buffer mono, depois escreve como f32 normalizado.
        self.fill_interleaved_i16_then_convert(data);
    }

    /// Preenche `data` (interleaved multicanal) com amostras mono duplicadas.
    /// Usa buffers internos reutilizados (sem alocação no callback RT).
    fn fill_interleaved(&mut self, data: &mut [i16]) {
        let Ok(mut guard) = self.buffer.try_lock() else {
            data.fill(0);
            return;
        };

        let frames = data.len() / self.channels as usize;
        if frames == 0 {
            return;
        }

        // 1) Pega amostras mono contínuas do jitter buffer (48 kHz).
        let status = guard.pop_into(&mut self.mono_buf[..frames]);

        // 2) Reamostra se necessário (48 kHz → taxa do dispositivo).
        let (src, src_len) = if let Some(resampler) = &mut self.resampler {
            let produced = resampler.process(&self.mono_buf[..frames], &mut self.resampled_buf);
            (&self.resampled_buf[..produced], produced)
        } else {
            (&self.mono_buf[..frames], frames)
        };

        // 3) Escreve interleaved: cada amostra mono → todos os canais.
        //    Se src_len < frames (underrun), preenche o resto com silêncio.
        let mut src_idx = 0;
        for frame in 0..frames {
            let sample = if src_idx < src_len {
                let s = src[src_idx];
                src_idx += 1;
                s
            } else {
                0
            };
            for ch in 0..self.channels as usize {
                data[frame * self.channels as usize + ch] = sample;
            }
        }

        // Log de warmup/underrun (rate-limited via métricas do jitter).
        if matches!(status, PopStatus::Warmup | PopStatus::Underrun) {
            // Métricas já contabilizadas no JitterBuffer.
        }
    }

    /// Versão para F32: usa fill_interleaved em buffer i16 temporário e converte.
    fn fill_interleaved_i16_then_convert(&mut self, data: &mut [f32]) {
        let frames = data.len() / self.channels as usize;
        if frames == 0 {
            return;
        }

        // Reutiliza um buffer i16 temporário alocado uma vez.
        // Aloca se necessário (só na primeira chamada ou se tamanho mudar).
        if self.mono_buf.len() < frames {
            self.mono_buf.resize(frames, 0);
            if let Some(r) = &self.resampler {
                let max_out = (frames as f64 * r.step).ceil() as usize + 16;
                self.resampled_buf.resize(max_out, 0);
            }
        }

        let Ok(mut guard) = self.buffer.try_lock() else {
            data.fill(0.0);
            return;
        };

        let status = guard.pop_into(&mut self.mono_buf[..frames]);

        let (src, src_len) = if let Some(resampler) = &mut self.resampler {
            let produced = resampler.process(&self.mono_buf[..frames], &mut self.resampled_buf);
            (&self.resampled_buf[..produced], produced)
        } else {
            (&self.mono_buf[..frames], frames)
        };

        let mut src_idx = 0;
        for frame in 0..frames {
            let sample_i16 = if src_idx < src_len {
                let s = src[src_idx];
                src_idx += 1;
                s
            } else {
                0
            };
            let sample_f32 = f32::from(sample_i16) / 32_768.0;
            for ch in 0..self.channels as usize {
                data[frame * self.channels as usize + ch] = sample_f32;
            }
        }

        if matches!(status, PopStatus::Warmup | PopStatus::Underrun) {
            // Métricas já contabilizadas no JitterBuffer.
        }
    }
}

/// Inicia a reprodução do jitter buffer em um dispositivo de saída.
///
/// `device_substring` seleciona o dispositivo pelo nome (ex.: `CABLE Input`);
/// sem ele, usa o dispositivo padrão do sistema.
///
/// Retorna o stream (que precisa ser mantido vivo) e o nome do dispositivo.
pub fn start_output(
    device_substring: Option<&str>,
    buffer: Arc<Mutex<JitterBuffer>>,
    _frame_samples: usize, // mantido para compatibilidade; não usado
) -> Result<(Stream, String), DynError> {
    let host = cpal::default_host();
    let device = select_device(&host, device_substring)?;
    let device_name = device_name(&device);

    // Usa a configuração PADRÃO do dispositivo (taxa/canais/formato nativos).
    let supported = device.default_output_config()?;
    let _channels = supported.channels();
    let sample_format = supported.sample_format();

    // Clona o que precisamos para o callback.
    let buffer_clone = Arc::clone(&buffer);

    let stream = match sample_format {
        SampleFormat::I16 => {
            let config: StreamConfig = supported.into();
            let mut playout = Playout::new(buffer_clone, &supported);
            device.build_output_stream(
                config,
                move |data: &mut [i16], _: &cpal::OutputCallbackInfo| {
                    playout.fill_i16(data);
                },
                move |err| eprintln!("[áudio] erro no stream de saída: {err}"),
                None,
            )?
        }
        SampleFormat::F32 => {
            let config: StreamConfig = supported.into();
            let mut playout = Playout::new(buffer_clone, &supported);
            device.build_output_stream(
                config,
                move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    playout.fill_f32(data);
                },
                move |err| eprintln!("[áudio] erro no stream de saída: {err}"),
                None,
            )?
        }
        other => return Err(format!("formato de saída não suportado: {other}").into()),
    };

    stream.play()?;
    Ok((stream, device_name))
}

/// Nome legível do dispositivo.
fn device_name(device: &Device) -> String {
    device
        .description()
        .map(|description| description.name().to_owned())
        .unwrap_or_else(|_| device.to_string())
}

/// Seleciona o dispositivo de saída pelo nome.
fn select_device(host: &cpal::Host, device_substring: Option<&str>) -> Result<Device, DynError> {
    let Some(needle) = device_substring else {
        return host
            .default_output_device()
            .ok_or_else(|| "nenhum dispositivo de saída disponível".into());
    };

    let needle = needle.to_lowercase();
    host.output_devices()?
        .find(|device| device_name(device).to_lowercase().contains(&needle))
        .ok_or_else(|| format!("dispositivo de saída '{needle}' não encontrado").into())
}
