//! Conversão de taxa de amostragem (reamostragem linear).
//!
//! O celular captura a 48 kHz; o dispositivo de saída do PC pode rodar em
//! outra taxa (44,1 kHz, 16 kHz em fones Bluetooth HFP, ...). O reamostrador
//! converte o fluxo contínuo de 48 kHz para a taxa nativa do dispositivo.
//!
//! A interpolação é linear: para voz (faixa de interesse até ~8 kHz) o erro é
//! imperceptível, e o custo é de uma multiplicação por amostra.

/// Reamostrador de taxa fixa (entrada → saída).
#[derive(Debug, Clone)]
pub struct LinearResampler {
    /// Amostras de entrada por amostra de saída (`origem / destino`).
    step: f64,
    /// Posição fracionária dentro da janela atual.
    phase: f64,
    /// Última amostra da janela anterior (histórico).
    previous: i16,
}

impl LinearResampler {
    /// Cria um reamostrador de `source_rate` para `target_rate`.
    #[must_use]
    pub fn new(source_rate: u32, target_rate: u32) -> Self {
        let step = f64::from(source_rate) / f64::from(target_rate);
        Self {
            step,
            phase: 0.0,
            previous: 0,
        }
    }

    /// `true` quando as taxas são iguais (conversão é uma cópia).
    #[must_use]
    pub fn is_passthrough(&self) -> bool {
        (self.step - 1.0).abs() < f64::EPSILON
    }

    /// Converte um bloco de entrada, escrevendo em `output`.
    ///
    /// Retorna quantas amostras foram geradas. A fase é preservada entre as
    /// chamadas, de modo que o fluxo contínuo não sofre descontinuidade.
    pub fn process(&mut self, input: &[i16], output: &mut [i16]) -> usize {
        if input.is_empty() {
            return 0;
        }

        let mut produced = 0;
        let mut position = self.phase;

        while produced < output.len() {
            let window = position.floor() as isize;
            if window + 1 >= input.len() as isize + 1 {
                break;
            }

            let fraction = position - window as f64;
            let (before, after) = if window <= 0 {
                (self.previous, input[0])
            } else {
                (input[(window - 1) as usize], input[window as usize])
            };

            let value = f64::from(before) * (1.0 - fraction) + f64::from(after) * fraction;
            output[produced] = value.round().clamp(f64::from(i16::MIN), f64::from(i16::MAX)) as i16;

            produced += 1;
            position += self.step;
        }

        // A próxima janela começa na última amostra desta.
        self.phase = position - (input.len() as f64 + 1.0);
        self.previous = *input.last().unwrap_or(&0);

        produced
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn taxas_iguais_copia_amostras() {
        let mut resampler = LinearResampler::new(48_000, 48_000);
        assert!(resampler.is_passthrough());

        let input: Vec<i16> = (0..480).map(|i| i as i16).collect();
        let mut output = vec![0_i16; 480];

        let produced = resampler.process(&input, &mut output);

        assert_eq!(produced, 480);
        assert_eq!(output, input);
    }

    #[test]
    fn taxa_maior_gera_mais_amostras() {
        let mut resampler = LinearResampler::new(48_000, 96_000);
        let input = vec![1_i16; 480];
        let mut output = vec![0_i16; 960];

        let produced = resampler.process(&input, &mut output);

        assert_eq!(produced, 960);
        assert!(output.iter().all(|sample| *sample == 1));
    }

    #[test]
    fn taxa_menor_gera_menos_amostras() {
        let mut resampler = LinearResampler::new(48_000, 24_000);
        let input = vec![1_i16; 480];
        let mut output = vec![0_i16; 960];

        let produced = resampler.process(&input, &mut output);

        assert_eq!(produced, 240);
    }

    #[test]
    fn rampa_e_reamostrada_com_precisao() {
        let mut resampler = LinearResampler::new(48_000, 24_000);
        let input: Vec<i16> = (0..480).map(|i| i as i16).collect();
        let mut output = vec![0_i16; 960];

        let produced = resampler.process(&input, &mut output);

        assert_eq!(produced, 240);
        // A rampa de 0..480 vira 0..480 em 240 amostras (fator 2).
        for (index, sample) in output[..produced].iter().enumerate() {
            let expected = (index * 2) as i16;
            assert!(
                (*sample - expected).abs() <= 1,
                "amostra {index}: {} != {expected}",
                sample
            );
        }
    }

    #[test]
    fn fase_e_preservada_entre_blocos() {
        let mut resampler = LinearResampler::new(48_000, 44_100);
        let input = vec![10_i16; 480];

        let mut total = 0;
        for _ in 0..10 {
            let mut output = vec![0_i16; 512];
            total += resampler.process(&input, &mut output);
        }

        // 480 amostras de entrada a 48 kHz → 441 amostras a 44,1 kHz por bloco.
        let expected = (480.0 * 44_100.0 / 48_000.0 * 10.0).round() as usize;
        assert!(
            (total as i64 - expected as i64).abs() <= 2,
            "produziu {total}, esperado ~{expected}"
        );
    }
}
