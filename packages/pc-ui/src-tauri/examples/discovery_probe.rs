//! Diagnóstico: lista os destinos de broadcast do beacon de descoberta.
//!
//! Uso: `cargo run --example discovery_probe`

use micshare_pc_ui_lib::discovery::targets::broadcast_targets;
use micshare_pc_ui_lib::protocol::DISCOVERY_PORT;

fn main() {
    println!("porta de descoberta: {DISCOVERY_PORT}");
    println!("destinos do beacon:");
    for target in broadcast_targets(DISCOVERY_PORT) {
        println!("  - {target}");
    }
}
