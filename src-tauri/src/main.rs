// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::path::{Path, PathBuf};

use futures::lock::Mutex;

mod transport;
use transport::commands::{transport_close, transport_send_data, ActiveConnection};

use transport::gatt::{gatt_connect, gatt_list_devices};
use transport::serial::{serial_connect, serial_list_devices};

mod monitor;
use monitor::{monitor_install, monitor_start, monitor_status, monitor_stop};

/// 枚举系统中可能挂载了 UF2 刷机盘的根路径。
fn uf2_drive_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    #[cfg(target_os = "windows")]
    {
        for letter in b'A'..=b'Z' {
            candidates.push(PathBuf::from(format!("{}:\\", letter as char)));
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(entries) = std::fs::read_dir("/Volumes") {
            for entry in entries.flatten() {
                candidates.push(entry.path());
            }
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let bases = ["/media", "/run/media", "/mnt"];
        for base in bases {
            if let Ok(entries) = std::fs::read_dir(base) {
                for entry in entries.flatten() {
                    candidates.push(entry.path());
                }
            }
        }
    }

    candidates
}

/// 判断某个路径是否是 UF2 引导盘的根目录（通过引导盘标志文件识别）。
fn is_uf2_drive(root: &Path) -> bool {
    root.join("INFO_UF2.TXT").exists() || root.join("CURRENT.UF2").exists()
}

/// 查找当前已连接的 UF2 刷机盘（如 NRFMicroBOOT），返回盘符/挂载路径。
#[tauri::command]
fn find_uf2_drive() -> Option<String> {
    uf2_drive_candidates()
        .into_iter()
        .find(|root| is_uf2_drive(root))
        .map(|root| root.to_string_lossy().into_owned())
}

/// 把固件字节写入 UF2 刷机盘根目录（firmware.uf2），引导程序会自动完成烧录。
#[tauri::command]
fn write_uf2_to_drive(drive: String, data: Vec<u8>) -> Result<(), String> {
    let root = PathBuf::from(&drive);
    if !is_uf2_drive(&root) {
        return Err("Selected path is not an UF2 bootloader drive".to_string());
    }
    if data.is_empty() || data.len() % 512 != 0 {
        return Err("Invalid UF2 data".to_string());
    }
    std::fs::write(root.join("firmware.uf2"), data).map_err(|err| err.to_string())
}

/// 用后端直接请求文本（绕开 WebView 的跨域限制）。
#[tauri::command]
async fn http_get_text(url: String) -> Result<String, String> {
    let resp = reqwest::get(&url).await.map_err(|err| err.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    resp.text().await.map_err(|err| err.to_string())
}

/// 用后端直接下载字节（绕开 WebView 的跨域限制）。
#[tauri::command]
async fn http_get_bytes(url: String) -> Result<Vec<u8>, String> {
    let resp = reqwest::get(&url).await.map_err(|err| err.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    resp.bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|err| err.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .manage(ActiveConnection {
            conn: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            transport_send_data,
            transport_close,
            gatt_list_devices,
            gatt_connect,
            serial_list_devices,
            serial_connect,
            find_uf2_drive,
            write_uf2_to_drive,
            http_get_text,
            http_get_bytes,
            monitor_install,
            monitor_status,
            monitor_start,
            monitor_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
