//! 任务监控的一键下载 / 启动 / 停止。
//! 监控脚本由固件仓库发布流水线同步到 OSS：KeyPlayer/monitor/latest.json

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::Duration;

const MONITOR_MANIFEST_URL: &str =
    "https://keyplayer.oss-cn-shanghai.aliyuncs.com/KeyPlayer/monitor/latest.json";

#[derive(Serialize)]
pub struct MonitorStatus {
    pub installed: bool,
    pub running: bool,
    pub version: String,
}

#[derive(Deserialize)]
struct MonitorManifest {
    version: String,
    platforms: HashMap<String, PlatformFiles>,
}

#[derive(Deserialize)]
struct PlatformFiles {
    files: Vec<MonitorFile>,
}

#[derive(Deserialize)]
struct MonitorFile {
    name: String,
    url: String,
    sha256: String,
    size: Option<i64>,
}

fn monitor_dir() -> PathBuf {
    let base = if cfg!(target_os = "windows") {
        std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string())
    } else {
        std::env::var("HOME").unwrap_or_else(|_| ".".to_string())
    };
    PathBuf::from(base).join("KeyPlayerStudio").join("monitor")
}

fn monitor_is_running() -> bool {
    let addr = match "127.0.0.1:9753".parse::<std::net::SocketAddr>() {
        Ok(a) => a,
        Err(_) => return false,
    };
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect()
}

/// 轮询等待某个条件成立（用于“启动后等运行、停止后等退出”）
fn wait_until(mut cond: impl FnMut() -> bool, timeout: Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        if cond() {
            return true;
        }
        if std::time::Instant::now() >= deadline {
            return cond();
        }
        std::thread::sleep(Duration::from_millis(300));
    }
}

pub fn status() -> MonitorStatus {
    let dir = monitor_dir();
    let version_file = dir.join("version.txt");
    let installed = version_file.exists();
    let version = if installed {
        std::fs::read_to_string(&version_file).unwrap_or_default()
    } else {
        String::new()
    };
    MonitorStatus {
        installed,
        running: monitor_is_running(),
        version,
    }
}

#[tauri::command]
pub async fn monitor_install() -> Result<MonitorStatus, String> {
    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        return Err("当前系统暂不支持任务监控".to_string());
    };

    let text = crate::http_get_text(MONITOR_MANIFEST_URL.to_string())
        .await
        .map_err(|e| format!("获取监控清单失败：{e}"))?;
    let manifest: MonitorManifest =
        serde_json::from_str(&text).map_err(|e| format!("监控清单格式错误：{e}"))?;
    let platform_files = manifest
        .platforms
        .get(platform)
        .ok_or_else(|| "该平台监控暂未发布".to_string())?;

    let dir = monitor_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    for f in &platform_files.files {
        let safe_name = Path::new(&f.name)
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| format!("非法文件名：{}", f.name))?;
        if safe_name.is_empty() || safe_name == "." || safe_name == ".." {
            return Err(format!("非法文件名：{}", f.name));
        }
        let data = crate::http_get_bytes(f.url.clone())
            .await
            .map_err(|e| format!("下载 {} 失败：{e}", f.name))?;
        let actual = sha256_hex(&data);
        if !f.sha256.is_empty() && actual.to_lowercase() != f.sha256.to_lowercase() {
            return Err(format!("文件校验失败：{}", f.name));
        }
        std::fs::write(dir.join(safe_name), data).map_err(|e| e.to_string())?;
    }

    std::fs::write(dir.join("version.txt"), manifest.version.clone()).map_err(|e| e.to_string())?;
    Ok(status())
}

#[tauri::command]
pub fn monitor_status() -> MonitorStatus {
    status()
}

#[cfg(target_os = "windows")]
fn run_hidden(bat: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("cmd")
        .arg("/C")
        .arg(bat)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn stop_any_monitor_fallback() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // 与 停止任务监控.bat 等价的通用停止命令：
    // 按命令行特征杀掉 codex-monitor / ble-pusher / watchdog / 启动VBS
    let script = r#"Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='wscript.exe'" | Where-Object { $_.CommandLine -match 'codex-monitor|ble-pusher|watchdog|\.vbs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"#;
    std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-WindowStyle",
            "Hidden",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn monitor_start() -> Result<MonitorStatus, String> {
    if !monitor_dir().join("version.txt").exists() {
        monitor_install().await?;
    }

    #[cfg(target_os = "windows")]
    {
        let dir = monitor_dir();
        let startup_done = dir.join(".startup_done");
        if !startup_done.exists() {
            let startup_bat = dir.join("加入开机启动.bat");
            if startup_bat.exists() {
                run_hidden(&startup_bat)?;
            }
            let _ = std::fs::write(&startup_done, b"1");
        }
        let start_bat = dir.join("启动任务监控.bat");
        if start_bat.exists() {
            run_hidden(&start_bat)?;
        }
        // 等监控真正运行起来再返回，避免界面误显示“已关闭”
        wait_until(monitor_is_running, Duration::from_secs(15));
    }

    #[cfg(not(target_os = "windows"))]
    {
        if cfg!(target_os = "macos") {
            return Err("macOS 任务监控暂未开放一键启动（第二阶段）".to_string());
        }
    }

    Ok(status())
}

#[tauri::command]
pub fn monitor_stop() -> Result<MonitorStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let stop_bat = monitor_dir().join("停止任务监控.bat");
        if stop_bat.exists() {
            run_hidden(&stop_bat)?;
        } else {
            // 客户端还没下载过自己的脚本，但监控可能正从其它目录运行
            stop_any_monitor_fallback()?;
        }
        // 等监控真正退出再返回，避免界面误显示“已打开”
        wait_until(|| !monitor_is_running(), Duration::from_secs(10));
    }

    #[cfg(not(target_os = "windows"))]
    {
        if cfg!(target_os = "macos") {
            return Err("macOS 任务监控暂未开放一键停止（第二阶段）".to_string());
        }
    }

    Ok(status())
}
