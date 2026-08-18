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

/// macOS 会为每个串口同时生成 /dev/tty.*（拨入）和 /dev/cu.*（呼叫）两个节点，
/// 只有 /dev/cu.* 适合被应用打开。列表与连接统一走 cu 路径，避免重复和
/// “No such file or directory”问题。
fn normalized_port_path(name: &str) -> String {
    #[cfg(target_os = "macos")]
    {
        if let Some(rest) = name.strip_prefix("/dev/tty.") {
            return format!("/dev/cu.{rest}");
        }
    }
    name.to_string()
}

/// 探测串口是否是键盘的监控口：
/// Some(true)  = 监控口（应答 PONG）
/// Some(false) = 能打开但不是监控口（通常是 Studio 改键口）
/// None        = 无法打开（可能被守护程序占用）
fn probe_monitor_port(port_name: &str) -> Option<bool> {
    let port_name = normalized_port_path(port_name);
    let mut port = serialport::new(&port_name, 9600)
        .timeout(Duration::from_millis(500))
        .open()
        .ok()?;

    let _ = port.write(b"PING\n");

    let mut buf = [0u8; 64];
    let mut got = 0usize;
    let deadline = Instant::now() + Duration::from_millis(1200);
    let mut retry_ping_at = Instant::now() + Duration::from_millis(500);
    while Instant::now() < deadline && got < buf.len() {
        match port.read(&mut buf[got..]) {
            Ok(0) | Err(_) => {
                if got == 0 && Instant::now() >= retry_ping_at {
                    let _ = port.write(b"PING\n");
                    retry_ping_at = Instant::now() + Duration::from_millis(500);
                }
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

/// 把打开串口的错误转成用户可理解的中文提示
fn serial_permission_hint() -> &'static str {
    if cfg!(target_os = "linux") {
        "无权限：请将当前用户加入 dialout 组并重新登录"
    } else if cfg!(target_os = "windows") {
        "端口被占用或无权限：请关闭占用该 COM 口的程序后重试"
    } else {
        "端口无法访问：请确认键盘已连接且未被其他程序占用"
    }
}

fn serial_open_error_text(port_name: &str) -> String {
    let port_name = normalized_port_path(port_name);
    let err = serialport::new(&port_name, 9600)
        .timeout(Duration::from_millis(100))
        .open()
        .err();
    if let Some(e) = err {
        let desc = e.description.to_lowercase();
        if desc.contains("permission") || desc.contains("access") || desc.contains("denied") {
            return serial_permission_hint().to_string();
        }
        format!("被占用：{}", e.description)
    } else {
        "被占用".to_string()
    }
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
        None => format!("{} · {}", base, serial_open_error_text(port_name)),
    }
}

#[command]
pub async fn serial_connect(
    id: String,
    app_handle: AppHandle,
    state: State<'_, super::commands::ActiveConnection<'_>>,
) -> Result<bool, String> {
    let id = normalized_port_path(&id);
    let mut opened = None;
    for attempt in 0..3 {
        match tokio_serial::new(&id, 9600).open_native_async() {
            Ok(port) => {
                opened = Some(port);
                break;
            }
            Err(_e) if attempt < 2 => {
                // macOS 上设备节点可能稍晚才创建完成，短暂重试可避免
                // “No such file or directory”。
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
            Err(e) => {
                let desc = e.description.to_lowercase();
                if desc.contains("permission")
                    || desc.contains("access")
                    || desc.contains("denied")
                {
                    return Err(serial_permission_hint().to_string());
                }
                return Err(format!("Failed to open the serial port: {}", e.description));
            }
        }
    }

    match opened {
        Some(mut port) => {
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
        None => unreachable!(),
    }
}

#[command]
pub async fn serial_list_devices(app_handle: AppHandle) -> Result<Vec<super::commands::AvailableDevice>, ()> {
    let ports = unblock(|| available_ports()).await.unwrap();

    let mut seen = std::collections::HashSet::new();
    let mut candidates = ports
        .into_iter()
        .filter_map(|pi| {
            if let SerialPortType::UsbPort(u) = pi.port_type {
                // macOS：tty.* 与 cu.* 是同一设备的两个节点，统一归一化为
                // cu.* 并去重，避免列表里出现重复口。
                let port_name = normalized_port_path(&pi.port_name);
                if !seen.insert(port_name.clone()) {
                    return None;
                }
                let label = if u.vid == ZMK_USB_VID && u.pid == ZMK_USB_PID {
                    keyboard_port_label(&u, &port_name)
                } else {
                    u.product.unwrap_or("Unnamed device".to_string())
                };
                Some(super::commands::AvailableDevice {
                    id: port_name,
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
