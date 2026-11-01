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

use super::AudioControls;
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
    /// `true` se o dispositivo é um cabo virtual de áudio — ou seja, pode ser
    /// capturado por outros apps (Discord/OBS/Zoom) como microfone.
    pub is_virtual_cable: bool,
}

/// Marcadores de nome que identificam um cabo virtual de áudio.
///
/// No Windows o VB-Cable expõe o lado de **playback** (onde o PC escreve) como
/// `CABLE Input` e o lado de **recording** (o que o Discord/OBS captura) como
/// `CABLE Output`. O Micshare escreve em `CABLE Input`; o par `CABLE Output`
/// aparece como microfone nos apps de captura.
const VIRTUAL_CABLE_MARKERS: &[&str] = &[
    "cable input",
    "vb-audio",
    "vb-cable",
    "virtual audio cable",
    "virtual cable",
    "voicemeeter",
];

/// `true` se o dispositivo de saída é um cabo virtual (usável como microfone).
///
/// O PC escreve o áudio do celular nesse dispositivo; o outro par do cabo
/// (`CABLE Output`) aparece como microfone nos apps de gravação.
#[must_use]
pub fn is_virtual_cable(name: &str) -> bool {
    let lower = name.to_lowercase();
    VIRTUAL_CABLE_MARKERS
        .iter()
        .any(|marker| lower.contains(marker))
}

/// `true` se o dispositivo é a variante multicanal do cabo (ex.: `CABLE In 16ch`).
///
/// A variante 16ch serve para gravação multicanal profissional, mas o par
/// correspondente no outro lado não é o microfone padrão que os apps esperam.
#[must_use]
fn is_multichannel_variant(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("16ch") || lower.contains("multichannel")
}

/// Pontua um dispositivo como candidato a um pedido de seleção.
///
/// Nome exato > prefixo > substring. A pontuação permite desempate estável
/// quando vários dispositivos casam com o mesmo texto.
fn device_score(name: &str, needle: &str) -> Option<u32> {
    let name_lower = name.to_lowercase();
    let needle_lower = needle.to_lowercase();

    if name_lower == needle_lower {
        Some(100)
    } else if name_lower.starts_with(&needle_lower) {
        Some(80)
    } else if name_lower.contains(&needle_lower) {
        Some(60)
    } else {
        None
    }
}

/// Nome do cabo virtual de playback preferencial (o que o PC deve usar).
///
/// Prioriza `CABLE Input` estéreo sobre variantes multicanal (`CABLE In
/// 16ch`): o par correspondente (`CABLE Output`) é o que o Discord/OBS
/// captura como microfone comum.
#[must_use]
pub fn preferred_virtual_cable_name(names: &[String]) -> Option<String> {
    let candidates: Vec<&String> = names.iter().filter(|name| is_virtual_cable(name)).collect();

    candidates
        .iter()
        .filter(|name| !is_multichannel_variant(name))
        .max_by_key(|name| device_score(name, "cable input").unwrap_or(0))
        .or_else(|| {
            candidates
                .iter()
                .max_by_key(|name| device_score(name, "cable input").unwrap_or(0))
        })
        .map(|name| (*name).clone())
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
                is_virtual_cable: is_virtual_cable(&name),
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
    /// Mute/volume do PC, aplicados por amostra no caminho quente.
    controls: AudioControls,
}

impl Playout {
    /// Cria o estado de playout a partir da configuração suportada do dispositivo.
    fn new(
        buffer: Arc<Mutex<JitterBuffer>>,
        supported: &SupportedStreamConfig,
        controls: AudioControls,
    ) -> Self {
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
            controls,
        }
    }

    /// Ganho atual em fixed-point (0 se mutado; 1000 = 100%).
    ///
    /// Leitura relaxed de átomos — segura no caminho RT.
    #[inline]
    fn gain(&self) -> i32 {
        if self.controls.muted() {
            0
        } else {
            self.controls.volume() as i32
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

        // 3) Escreve interleaved: cada amostra mono → todos os canais, com o
        //    ganho do PC (mute → 0; volume fixed-point 1000 = 100%).
        //    Se src_len < frames (underrun), preenche o resto com silêncio.
        let gain = self.gain();
        let mut src_idx = 0;
        for frame in 0..frames {
            let sample = if src_idx < src_len {
                let s = apply_gain(src[src_idx], gain);
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
        let gain = self.gain();
        let gain_f32 = gain as f32 / crate::audio::VOLUME_UNITY as f32;
        for frame in 0..frames {
            let sample_i16 = if src_idx < src_len {
                let s = src[src_idx];
                src_idx += 1;
                s
            } else {
                0
            };
            let sample_f32 = (f32::from(sample_i16) / 32_768.0) * gain_f32;
            for ch in 0..self.channels as usize {
                data[frame * self.channels as usize + ch] = sample_f32;
            }
        }

        if matches!(status, PopStatus::Warmup | PopStatus::Underrun) {
            // Métricas já contabilizadas no JitterBuffer.
        }
    }
}

/// Constrói o stream de saída no dispositivo, **sem iniciar a reprodução**.
///
/// Separar a construção do `play()` é o que permite o hot-swap transacional:
/// o novo stream é aberto (validando o dispositivo e sua configuração) enquanto
/// o antigo ainda toca; só depois o antigo é derrubado e o novo é iniciado.
/// Assim os dois streams nunca consomem o jitter buffer ao mesmo tempo.
///
/// Retorna o stream (que precisa ser mantido vivo) e o nome do dispositivo.
pub fn build_output(
    device_substring: Option<&str>,
    buffer: Arc<Mutex<JitterBuffer>>,
    controls: AudioControls,
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
            let mut playout = Playout::new(buffer_clone, &supported, controls);
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
            let mut playout = Playout::new(buffer_clone, &supported, controls);
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

    Ok((stream, device_name))
}

/// Inicia a reprodução do jitter buffer em um dispositivo de saída.
///
/// `device_substring` seleciona o dispositivo pelo nome (ex.: `CABLE Input`);
/// sem ele, usa o dispositivo padrão do sistema. `controls` aplica mute/volume
/// do PC no caminho quente do callback.
///
/// Retorna o stream (que precisa ser mantido vivo) e o nome do dispositivo.
pub fn start_output(
    device_substring: Option<&str>,
    buffer: Arc<Mutex<JitterBuffer>>,
    controls: AudioControls,
    _frame_samples: usize, // mantido para compatibilidade; não usado
) -> Result<(Stream, String), DynError> {
    let (stream, device_name) = build_output(device_substring, buffer, controls)?;
    stream.play()?;
    Ok((stream, device_name))
}

/// Aplica o ganho do PC a uma amostra i16 (fixed-point: 1000 = 100%).
///
/// Satura em vez de estourar quando o volume excede 100%. Seguro em tempo
/// real: aritmética inteira, sem alocação.
#[inline]
#[must_use]
fn apply_gain(sample: i16, gain: i32) -> i16 {
    let scaled = i32::from(sample) * gain / super::VOLUME_UNITY as i32;
    scaled.clamp(i32::from(i16::MIN), i32::from(i16::MAX)) as i16
}

/// Nome legível do dispositivo.
fn device_name(device: &Device) -> String {
    device
        .description()
        .map(|description| description.name().to_owned())
        .unwrap_or_else(|_| device.to_string())
}

/// Seleciona o dispositivo de saída pelo nome.
///
/// Sem `device_substring`, a preferência é:
/// 1. o **cabo virtual** (`CABLE Input`) — é o único destino cujo par aparece
///    como microfone no Discord/OBS/Zoom, que é o propósito do Micshare;
/// 2. o dispositivo padrão do sistema.
///
/// Com `device_substring`, procura por correspondência exata → prefixo →
/// substring, escolhendo sempre o melhor score (desempate estável).
fn select_device(host: &cpal::Host, device_substring: Option<&str>) -> Result<Device, DynError> {
    let devices: Vec<Device> = host.output_devices()?.collect();
    let names: Vec<String> = devices.iter().map(device_name).collect();

    let Some(needle) = device_substring else {
        // Sem escolha explícita: prefere o cabo virtual para que o áudio já
        // chegue como microfone nos apps de captura.
        let preferred = preferred_virtual_cable_name(&names);
        if let Some(preferred) = preferred {
            if let Some(index) = names.iter().position(|name| *name == preferred) {
                return Ok(devices[index].clone());
            }
        }

        return host
            .default_output_device()
            .ok_or_else(|| "nenhum dispositivo de saída disponível".into());
    };

    // Melhor score entre os dispositivos que casam com o pedido.
    let best = names
        .iter()
        .enumerate()
        .filter_map(|(index, name)| device_score(name, needle).map(|score| (score, index)))
        .max_by_key(|(score, index)| (*score, std::cmp::Reverse(*index)));

    match best {
        Some((_, index)) => Ok(devices[index].clone()),
        None => Err(format!("dispositivo de saída '{needle}' não encontrado").into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::{AudioControls, VOLUME_UNITY};

    #[test]
    fn gain_unity_preserva_a_amostra() {
        assert_eq!(apply_gain(12_345, VOLUME_UNITY as i32), 12_345);
        assert_eq!(apply_gain(-12_345, VOLUME_UNITY as i32), -12_345);
    }

    #[test]
    fn gain_zero_zera_a_amostra() {
        assert_eq!(apply_gain(12_345, 0), 0);
        assert_eq!(apply_gain(-32_768, 0), 0);
    }

    #[test]
    fn gain_dobro_duplica_e_satura() {
        assert_eq!(apply_gain(10_000, 2_000), 20_000);
        // 32_767 × 2 satura no limite de i16, não estoura.
        assert_eq!(apply_gain(i16::MAX, 2_000), i16::MAX);
        assert_eq!(apply_gain(i16::MIN, 4_000), i16::MIN);
    }

    #[test]
    fn controles_mute_zera_o_gain() {
        let controls = AudioControls::new();
        assert!(!controls.muted());
        assert_eq!(controls.volume(), VOLUME_UNITY);

        controls.set_mute(true);
        assert!(controls.muted());

        controls.set_mute(false);
        assert!(!controls.muted());
    }

    #[test]
    fn controles_volume_clampa_no_maximo() {
        let controls = AudioControls::new();
        controls.set_volume(9_999);
        assert_eq!(controls.volume(), crate::audio::VOLUME_MAX);

        controls.set_volume(500);
        assert_eq!(controls.volume(), 500);
    }

    #[test]
    fn detecta_cabo_virtual_por_nome() {
        assert!(is_virtual_cable("CABLE Input (VB-Audio Virtual Cable)"));
        assert!(is_virtual_cable("CABLE In 16ch (VB-Audio Virtual Cable)"));
        assert!(is_virtual_cable("VoiceMeeter Output"));
        assert!(!is_virtual_cable("Fones de ouvido (2- JBL Tune 720BT)"));
        assert!(!is_virtual_cable(
            "4 - AAA (AMD High Definition Audio Device)"
        ));
    }

    #[test]
    fn prefere_cable_input_estereo_sobre_multicanal() {
        let names = vec![
            "Fones de ouvido (2- JBL Tune 720BT)".to_owned(),
            "CABLE In 16ch (VB-Audio Virtual Cable)".to_owned(),
            "CABLE Input (VB-Audio Virtual Cable)".to_owned(),
        ];

        assert_eq!(
            preferred_virtual_cable_name(&names),
            Some("CABLE Input (VB-Audio Virtual Cable)".to_owned())
        );
    }

    #[test]
    fn sem_cabo_virtual_retorna_none() {
        let names = vec![
            "Fones de ouvido (2- JBL Tune 720BT)".to_owned(),
            "4 - AAA (AMD High Definition Audio Device)".to_owned(),
        ];
        assert_eq!(preferred_virtual_cable_name(&names), None);
    }

    #[test]
    fn score_prefere_exato_sobre_prefixo_sobre_substring() {
        assert_eq!(device_score("CABLE Input", "CABLE Input"), Some(100));
        assert_eq!(
            device_score("CABLE Input (VB-Audio)", "CABLE Input"),
            Some(80)
        );
        assert_eq!(device_score("VB CABLE Input", "CABLE Input"), Some(60));
        assert_eq!(device_score("JBL Tune", "CABLE Input"), None);
    }
}
