use blocking::unblock;
use futures::channel::mpsc::channel;
use futures::StreamExt;
use std::time::{Duration, Instant};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_serial::{available_ports, SerialPortBuilderExt, SerialPortType};
use serialport::SerialPort;

use tauri::{command, AppHandle, State};
use tauri_plugin_cli::CliExt;

const READ_BUF_SIZE: usize = 1024;

// ZMK 键盘的默认 USB VID/PID
const ZMK_USB_VID: u16 = 0x1d50;
const ZMK_USB_PID: u16 = 0x615e;

/// 探测串口是否是键盘的监控口：
/// Some(true)  = 监控口（应答 PONG）
/// Some(false) = 能打开但不是监控口（通常是 Studio 改键口）
/// None        = 无法打开（可能被守护程序占用）
fn probe_monitor_port(port_name: &str) -> Option<bool> {
    let mut port = serialport::new(port_name, 115200)
        .timeout(Duration::from_millis(500))
        .open()
        .ok()?;

    let _ = port.write(b"PING\n");

    let mut buf = [0u8; 64];
    let mut got = 0usize;
    let deadline = Instant::now() + Duration::from_millis(600);
    while Instant::now() < deadline && got < buf.len() {
        match port.read(&mut buf[got..]) {
            Ok(0) | Err(_) => {
                std::thread::sleep(Duration::from_millis(20));
            }
            Ok(n) => {
                got += n;
                if String::from_utf8_lossy(&buf[..got]).contains("PONG") {
                    return Some(true);
                }
            }
        }
    }

    Some(String::from_utf8_lossy(&buf[..got]).contains("PONG"))
}

/// 给 ZMK 键盘的串口起一个容易识别的名字
fn keyboard_port_label(u: &serialport::UsbPortInfo, port_name: &str) -> String {
    let base = u
        .product
        .clone()
        .unwrap_or_else(|| "Nexus P.1".to_string());

    match probe_monitor_port(port_name) {
        Some(true) => format!("{} · 监控口（勿选）", base),
        Some(false) => format!("{} · Studio 改键口", base),
        None => format!("{} · 键盘串口（被占用）", base),
    }
}

#[command]
pub async fn serial_connect(
    id: String,
    app_handle: AppHandle,
    state: State<'_, super::commands::ActiveConnection<'_>>,
) -> Result<bool, String> {
    match tokio_serial::new(id, 9600).open_native_async() {
        Ok(mut port) => {
            #[cfg(unix)]
            port.set_exclusive(false)
                .expect("Unable to set serial port exclusive to false");

            let (mut reader, mut writer) = tokio::io::split(port);

            let ahc = app_handle.clone();
            let (send, mut recv) = channel(5);
            *state.conn.lock().await = Some(Box::new(send));

            let read_process = tauri::async_runtime::spawn(async move {
                use tauri::Manager;
                use tauri::Emitter;

                let mut buffer = vec![0; READ_BUF_SIZE];
                while let Ok(size) = reader.read(&mut buffer).await {
                    if size > 0 {
                        app_handle.emit("connection_data", &buffer[..size]);
                    } else {
                        break;
                    }
                }

                let state = app_handle.state::<super::commands::ActiveConnection>();
                *state.conn.lock().await = None;

                app_handle.emit("connection_disconnected", ());
            });

            tauri::async_runtime::spawn(async move {
                use tauri::Manager;

                while let Some(data) = recv.next().await {
                    let _res = writer.write(&data).await;
                }

                let state = ahc.state::<super::commands::ActiveConnection>();
                read_process.abort();
                *state.conn.lock().await = None;
            });

            Ok(true)
        }
        Err(e) => {
            Err(format!("Failed to open the serial port: {}", e.description))
        }
    }
}

#[command]
pub async fn serial_list_devices(app_handle: AppHandle) -> Result<Vec<super::commands::AvailableDevice>, ()> {
    let ports = unblock(|| available_ports()).await.unwrap();

    let mut candidates = ports
        .into_iter()
        .filter_map(|pi| {
            if let SerialPortType::UsbPort(u) = pi.port_type {
                let label = if u.vid == ZMK_USB_VID && u.pid == ZMK_USB_PID {
                    keyboard_port_label(&u, &pi.port_name)
                } else {
                    u.product.unwrap_or("Unnamed device".to_string())
                };
                Some(super::commands::AvailableDevice {
                    id: pi.port_name,
                    label,
                })
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    // Studio 改键口排在前面，方便选择
    candidates.sort_by_key(|d| {
        if d.label.contains("Studio 改键口") {
            0
        } else if d.label.contains("监控口") {
            2
        } else {
            1
        }
    });

    match app_handle.cli().matches() {
        Ok(m) => {
            if let Some(p) = m.args.get("serial-port") {
                if let serde_json::Value::String(path) = &p.value {
                    candidates.push(super::commands::AvailableDevice {
                        id: path.to_string(),
                        label: format!("CLI Port: {path}").to_string(),
                    })
                }
            }
        },
        Err(_) => {},
    }

    Ok(candidates)
}
