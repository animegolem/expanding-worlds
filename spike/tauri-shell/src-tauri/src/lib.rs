//! AI-IMP-240 Tauri v2 shell spike — Rust side.
//!
//! Five throwaway commands backing the WKWebView harness:
//!   - `sweep_config`  : env-driven run config (image count / autorun).
//!   - `texture_path`  : resolve+report the on-disk path for a texture.
//!   - `write_texture` : persist a base64 PNG painted in the WebView.
//!   - `write_blob`    : synth a raw N-MB file (asset-protocol ceiling probe).
//!   - `echo`          : IPC round-trip benchmark target.
//!   - `report_result` : write the run's summary JSON to disk (headless capture).
//!
//! Textures/blobs land in the app cache dir, which the asset-protocol
//! scope ($APPCACHE/**) exposes to `convertFileSrc`.

use base64::Engine as _;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

fn sanitize(hash: &str) -> String {
    hash.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

fn texture_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("textures");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[derive(Serialize)]
struct TexturePath {
    path: String,
    exists: bool,
}

#[tauri::command]
fn texture_path(app: tauri::AppHandle, hash: String) -> Result<TexturePath, String> {
    let file = texture_dir(&app)?.join(format!("{}.png", sanitize(&hash)));
    Ok(TexturePath {
        exists: file.exists(),
        path: file.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn write_texture(app: tauri::AppHandle, hash: String, b64: String) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.as_bytes())
        .map_err(|e| e.to_string())?;
    let file = texture_dir(&app)?.join(format!("{}.png", sanitize(&hash)));
    fs::write(&file, &bytes).map_err(|e| e.to_string())?;
    Ok(file.to_string_lossy().into_owned())
}

#[tauri::command]
fn write_blob(app: tauri::AppHandle, size_mb: u64) -> Result<String, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("blobs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("blob-{}mb.bin", size_mb));
    let want = (size_mb as usize) * 1024 * 1024;
    if !file.exists() || fs::metadata(&file).map(|m| m.len() as usize).unwrap_or(0) != want {
        // A cheap non-constant fill so nothing collapses it in transit.
        let mut buf = vec![0u8; want];
        for (i, b) in buf.iter_mut().enumerate() {
            *b = (i % 251) as u8;
        }
        fs::write(&file, &buf).map_err(|e| e.to_string())?;
    }
    Ok(file.to_string_lossy().into_owned())
}

/// IPC benchmark target: return the payload unchanged.
#[tauri::command]
fn echo(payload: String) -> String {
    payload
}

#[derive(Serialize)]
struct SweepConfig {
    images: u32,
    autorun: bool,
    #[serde(rename = "resultName")]
    result_name: String,
}

#[tauri::command]
fn sweep_config() -> SweepConfig {
    let images = std::env::var("EW_SPIKE_IMAGES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(100);
    // Autorun defaults ON so a scripted `tauri dev` captures without a click.
    let autorun = std::env::var("EW_SPIKE_AUTORUN").map(|v| v != "0").unwrap_or(true);
    let result_name = std::env::var("EW_SPIKE_RESULT").unwrap_or_else(|_| format!("sweep-{}", images));
    SweepConfig { images, autorun, result_name }
}

#[tauri::command]
fn report_result(app: tauri::AppHandle, name: String, json: String) -> Result<String, String> {
    let dir = match std::env::var("EW_SPIKE_RESULTS") {
        Ok(p) => PathBuf::from(p),
        Err(_) => app.path().app_cache_dir().map_err(|e| e.to_string())?.join("results"),
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("{}.json", sanitize(&name)));
    fs::write(&file, json.as_bytes()).map_err(|e| e.to_string())?;
    // Surface the path in the dev console so a scripted run can find it.
    eprintln!("[spike] report_result wrote {}", file.to_string_lossy());
    Ok(file.to_string_lossy().into_owned())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            sweep_config,
            texture_path,
            write_texture,
            write_blob,
            echo,
            report_result
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
