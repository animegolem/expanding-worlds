// Prevents an extra console window on Windows in release. No-op on macOS.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ew_tauri_shell_spike_lib::run()
}
