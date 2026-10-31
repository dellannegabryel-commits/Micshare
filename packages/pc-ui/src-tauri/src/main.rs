// Oculta o console no build de produção do Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    micshare_pc_ui_lib::run();
}
