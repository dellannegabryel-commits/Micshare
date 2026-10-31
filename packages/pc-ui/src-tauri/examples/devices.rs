//! Diagnóstico: lista os dispositivos de saída e seus formatos suportados.
//!
//! Uso: `cargo run --example devices`

use micshare_pc_ui_lib::audio::sink;

fn main() {
    let devices = sink::output_devices().expect("falha ao listar dispositivos");

    for device in &devices {
        let marker = if device.is_default { " (padrão)" } else { "" };
        println!("[{}] {}{}", device.index, device.name, marker);

        match sink::default_config(&device.name) {
            Ok(defaults) => println!(
                "      padrão: {} Hz · {} ch · {}",
                defaults.sample_rate, defaults.channels, defaults.format
            ),
            Err(err) => println!("      configuração padrão indisponível: {err}"),
        }

        match sink::supported_formats(&device.name) {
            Ok(formats) => {
                for format in formats {
                    println!(
                        "      {} Hz · {} ch · {}",
                        format.sample_rate, format.channels, format.format
                    );
                }
            }
            Err(err) => println!("      formatos indisponíveis: {err}"),
        }
    }
}
