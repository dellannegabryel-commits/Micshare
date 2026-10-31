//! Saída de áudio via `cpal`.
//!
//! O callback do `cpal` roda em uma thread de tempo real: ele nunca bloqueia
//! e nunca aloca. O jitter buffer é acessado com `try_lock` — se o lock
//! estiver contended, o callback escreve silêncio.

use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};

use super::jitter::JitterBuffer;

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

/// Inicia a reprodução do jitter buffer em um dispositivo de saída.
///
/// `device_substring` seleciona o dispositivo pelo nome (ex.: `CABLE Input`);
/// sem ele, usa o dispositivo padrão do sistema.
///
/// Retorna o stream (que precisa ser mantido vivo) e o nome do dispositivo.
pub fn start_output(
    device_substring: Option<&str>,
    buffer: Arc<Mutex<JitterBuffer>>,
    frame_samples: usize,
) -> Result<(Stream, String), DynError> {
    let host = cpal::default_host();
    let device = select_device(&host, device_substring)?;
    let device_name = device_name(&device);

    let supported = device.default_output_config()?;
    let channels = supported.channels();

    let stream_config = StreamConfig {
        channels,
        sample_rate: crate::audio::SAMPLE_RATE,
        buffer_size: cpal::BufferSize::Fixed(frame_samples as u32),
    };

    let on_error = move |err| eprintln!("[áudio] erro no stream de saída: {err}");

    let stream = match supported.sample_format() {
        SampleFormat::I16 => device.build_output_stream(
            stream_config,
            move |data: &mut [i16], _: &cpal::OutputCallbackInfo| {
                fill_i16(data, &buffer, frame_samples);
            },
            on_error,
            None,
        )?,
        SampleFormat::F32 => device.build_output_stream(
            stream_config,
            move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                fill_f32(data, &buffer, frame_samples);
            },
            on_error,
            None,
        )?,
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

/// Escreve o próximo frame no buffer de saída (PCM s16).
fn fill_i16(data: &mut [i16], buffer: &Arc<Mutex<JitterBuffer>>, frame_samples: usize) {
    let Ok(mut guard) = buffer.try_lock() else {
        data.fill(0);
        return;
    };

    for chunk in data.chunks_mut(frame_samples) {
        match guard.pop() {
            Some(samples) => {
                let count = chunk.len().min(samples.len());
                chunk[..count].copy_from_slice(&samples[..count]);
                chunk[count..].fill(0);
            }
            None => chunk.fill(0),
        }
    }
}

/// Escreve o próximo frame no buffer de saída (PCM f32).
fn fill_f32(data: &mut [f32], buffer: &Arc<Mutex<JitterBuffer>>, frame_samples: usize) {
    let Ok(mut guard) = buffer.try_lock() else {
        data.fill(0.0);
        return;
    };

    for chunk in data.chunks_mut(frame_samples) {
        match guard.pop() {
            Some(samples) => {
                let count = chunk.len().min(samples.len());
                for (out, sample) in chunk[..count].iter_mut().zip(samples.iter()) {
                    *out = f32::from(*sample) / 32_768.0;
                }
                chunk[count..].fill(0.0);
            }
            None => chunk.fill(0.0),
        }
    }
}
