//! 任务监控的一键下载 / 启动 / 停止。
//! 监控脚本由固件仓库发布流水线同步到 OSS：KeyPlayer/monitor/latest.json

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const MONITOR_MANIFEST_URL: &str =
    "https://keyplayer.oss-cn-shanghai.aliyuncs.com/KeyPlayer/monitor/latest.json";
fn platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unsupported"
    }
}

fn required_files(p: &str) -> &'static [&'static str] {
    match p {
        "windows" => &[
            "start-monitor.vbs",
            "start-monitor.bat",
            "stop-monitor.bat",
            "enable-autostart.bat",
            "install-startup.ps1",
            "watchdog.ps1",
            "codex-monitor.ps1",
            "ble-pusher.ps1",
            "ble-status.ps1",
            "mic-wake-monitor.ps1",
        ],
        "macos" => &[
            "keyplayer-monitor",
            "install_launchagent.sh",
            "uninstall_launchagent.sh",
        ],
        "linux" => &[
            "keyplayer-monitor",
            "install_linux.sh",
            "uninstall_linux.sh",
        ],
        _ => &[],
    }
}

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

/// 向客户端推送监控进度（前端据此显示“发现新版本/正在下载新文件…”）。
fn emit_progress(app: &AppHandle, stage: &str) -> Result<(), String> {
    app.emit("monitor_progress", stage)
        .map_err(|e| format!("推送监控进度失败：{e}"))
}

fn sanitize_file_name(name: &str) -> Result<String, String> {
    let safe = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| format!("非法文件名：{name}"))?;
    if safe.is_empty() || safe == "." || safe == ".." {
        return Err(format!("非法文件名：{name}"));
    }
    Ok(safe.to_string())
}

async fn fetch_monitor_manifest() -> Result<MonitorManifest, String> {
    let text = crate::http_get_text(MONITOR_MANIFEST_URL.to_string())
        .await
        .map_err(|e| format!("获取监控清单失败：{e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("监控清单格式错误：{e}"))
}

fn local_file_matches(path: &Path, expected: &str) -> bool {
    if expected.is_empty() {
        return true;
    }
    let Ok(data) = std::fs::read(path) else {
        return false;
    };
    sha256_hex(&data).eq_ignore_ascii_case(expected)
}

/// 判断是否需要更新：版本号不同，或任一清单文件缺失/哈希不一致。
fn needs_update(manifest: &MonitorManifest, platform: &str) -> bool {
    let dir = monitor_dir();
    let version_file = dir.join("version.txt");
    let local_version = std::fs::read_to_string(&version_file).unwrap_or_default();
    if local_version.trim() != manifest.version.trim() {
        return true;
    }
    let Some(platform_files) = manifest.platforms.get(platform) else {
        return true;
    };
    platform_files
        .files
        .iter()
        .any(|f| !local_file_matches(&dir.join(&f.name), &f.sha256))
}

/// 把所有文件下载到 staging 目录并逐文件校验（不直接碰正式目录）。
async fn download_to_staging(platform_files: &PlatformFiles) -> Result<PathBuf, String> {
    let dir = monitor_dir();
    let staging = dir.join(".staging");
    if staging.exists() {
        std::fs::remove_dir_all(&staging).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;

    for f in &platform_files.files {
        let safe_name = sanitize_file_name(&f.name)?;
        let data = crate::http_get_bytes(f.url.clone())
            .await
            .map_err(|e| format!("下载 {} 失败：{e}", f.name))?;
        if !f.sha256.is_empty() && !sha256_hex(&data).eq_ignore_ascii_case(&f.sha256) {
            return Err(format!("文件校验失败：{}", f.name));
        }
        let target = staging.join(&safe_name);
        std::fs::write(&target, data).map_err(|e| format!("写入 {} 失败：{e}", f.name))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let meta = std::fs::metadata(&target).map_err(|e| e.to_string())?;
            let mut perm = meta.permissions();
            perm.set_mode(0o755);
            std::fs::set_permissions(&target, perm)
                .map_err(|e| format!("设置监控文件权限失败：{e}"))?;
        }
    }
    Ok(staging)
}

/// 用 staging 目录替换正式目录内容，最后写 version.txt；
/// 清理清单中已移除的旧脚本/二进制（保留 daily.json、日志等用户数据）。
fn apply_staged(
    staging: &Path,
    platform_files: &PlatformFiles,
    version: &str,
    _platform: &str,
) -> Result<(), String> {
    let dir = monitor_dir();
    for f in &platform_files.files {
        let safe_name = sanitize_file_name(&f.name)?;
        std::fs::copy(staging.join(&safe_name), dir.join(&safe_name))
            .map_err(|e| format!("替换 {} 失败：{e}", f.name))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let target = dir.join(&safe_name);
            let meta = std::fs::metadata(&target).map_err(|e| e.to_string())?;
            let mut perm = meta.permissions();
            perm.set_mode(0o755);
            std::fs::set_permissions(&target, perm)
                .map_err(|e| format!("设置监控文件权限失败：{e}"))?;
        }
    }

    // 只删除“上次发布清单里有、新清单里没有”的文件，避免误删用户文件
    let last_manifest_path = dir.join(".last_manifest");
    let new_names: HashSet<String> = platform_files
        .files
        .iter()
        .filter_map(|f| sanitize_file_name(&f.name).ok())
        .collect();
    if let Ok(content) = std::fs::read_to_string(&last_manifest_path) {
        for line in content.lines() {
            let name = line.trim();
            if name.is_empty() || name == "." || name == ".." {
                continue;
            }
            if !new_names.contains(name) {
                let _ = std::fs::remove_file(dir.join(name));
            }
        }
    }
    let mut manifest_content = String::new();
    for name in &new_names {
        manifest_content.push_str(name);
        manifest_content.push('\n');
    }
    let _ = std::fs::write(&last_manifest_path, manifest_content);

    std::fs::write(dir.join("version.txt"), version).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(staging);
    Ok(())
}

/// 监控包是否完整（版本标记 + 关键文件都在）。
/// 缺文件时视为未安装，启动前会重新下载，保证旧的不完整安装能自愈。
fn package_installed() -> bool {
    let dir = monitor_dir();
    if !dir.join("version.txt").exists() {
        return false;
    }
    required_files(platform()).iter().all(|f| dir.join(f).exists())
}

#[cfg(target_os = "windows")]
fn monitor_process_running() -> bool {
    let out = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe' OR Name='keyplayer-monitor.exe'\" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'KeyPlayerStudio[\\\\/]monitor' } | Select-Object -First 1",
        ])
        .output();
    match out {
        Ok(o) => !o.stdout.is_empty(),
        // 查询失败时回退为仅 TCP 判断，避免误报“未运行”
        Err(_) => true,
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn monitor_process_running() -> bool {
    let out = std::process::Command::new("pgrep")
        .args(["-f", "keyplayer-monitor"])
        .output();
    match out {
        Ok(o) => o.status.success(),
        Err(_) => true,
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn monitor_process_running() -> bool {
    true
}

// 进程检测结果短时缓存，避免 wait 循环每 300ms 拉起一次 powershell/pgrep
static PROCESS_CHECK_CACHE: Mutex<Option<(std::time::Instant, bool)>> = Mutex::new(None);

fn monitor_process_running_cached() -> bool {
    if let Ok(mut g) = PROCESS_CHECK_CACHE.lock() {
        if let Some((t, v)) = *g {
            if t.elapsed() < Duration::from_secs(2) {
                return v;
            }
        }
        let v = monitor_process_running();
        *g = Some((std::time::Instant::now(), v));
        v
    } else {
        monitor_process_running()
    }
}

/// 端口可连 + 确实是我们的监控进程，才认为“运行中”，避免其它进程占用 9753 造成误判
fn monitor_is_running() -> bool {
    let addr = match "127.0.0.1:9753".parse::<std::net::SocketAddr>() {
        Ok(a) => a,
        Err(_) => return false,
    };
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
        && monitor_process_running_cached()
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
    let installed = package_installed();
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
pub async fn monitor_install(app: AppHandle) -> Result<MonitorStatus, String> {
    let platform = platform();
    if platform == "unsupported" {
        return Err("当前系统暂不支持任务监控".to_string());
    }

    let manifest = fetch_monitor_manifest().await?;
    let platform_files = manifest
        .platforms
        .get(platform)
        .ok_or_else(|| "该平台监控暂未发布".to_string())?;

    std::fs::create_dir_all(monitor_dir()).map_err(|e| e.to_string())?;
    emit_progress(&app, "downloading")?;
    let staging = download_to_staging(platform_files).await?;
    emit_progress(&app, "replacing")?;
    apply_staged(&staging, platform_files, &manifest.version, platform)?;
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
    // 与 stop-monitor.bat 等价的通用停止命令：
    // 按命令行特征杀掉 codex-monitor / ble-pusher / watchdog / mic-wake-monitor / 启动VBS
    let script = r#"Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='wscript.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'codex-monitor|ble-pusher|watchdog|mic-wake-monitor|\.vbs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"#;
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

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn run_sh(script: &Path) -> Result<(), String> {
    let out = std::process::Command::new("sh")
        .arg(script)
        .output()
        .map_err(|e| format!("执行 {} 失败：{e}", script.display()))?;
    if out.status.success() {
        Ok(())
    } else {
        let msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(format!(
            "脚本 {} 执行失败：{}",
            script.display(),
            if msg.is_empty() {
                out.status.to_string()
            } else {
                msg
            }
        ))
    }
}

fn start_platform() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let dir = monitor_dir();
        let startup_done = dir.join(".startup_done");
        let startup_lnk = std::env::var("APPDATA")
            .map(|a| {
                PathBuf::from(a)
                    .join("Microsoft")
                    .join("Windows")
                    .join("Start Menu")
                    .join("Programs")
                    .join("Startup")
                    .join("CodexKeyboardMonitor.lnk")
            })
            .unwrap_or_default();
        if !startup_done.exists() || !startup_lnk.exists() {
            let startup_bat = dir.join("enable-autostart.bat");
            if startup_bat.exists() {
                run_hidden(&startup_bat)?;
            }
            let _ = std::fs::write(&startup_done, b"1");
        }
        let start_bat = dir.join("start-monitor.bat");
        if start_bat.exists() {
            run_hidden(&start_bat)?;
        }
        // 等监控真正运行起来再返回，避免界面误显示“已关闭”
        if !wait_until(monitor_is_running, Duration::from_secs(15)) {
            return Err("监控启动超时：请检查监控进程".to_string());
        }
    }

    #[cfg(target_os = "macos")]
    {
        let sh = monitor_dir().join("install_launchagent.sh");
        if sh.exists() {
            run_sh(&sh)?;
        }
        if !wait_until(monitor_is_running, Duration::from_secs(15)) {
            return Err("监控启动超时：请检查监控程序是否可执行（权限）".to_string());
        }
    }

    #[cfg(target_os = "linux")]
    {
        let sh = monitor_dir().join("install_linux.sh");
        if sh.exists() {
            run_sh(&sh)?;
        }
        if !monitor_is_running() {
            let bin = monitor_dir().join("keyplayer-monitor");
            if bin.exists() {
                std::process::Command::new(&bin)
                    .spawn()
                    .map_err(|e| format!("启动监控失败：{e}"))?;
            }
        }
        if !wait_until(monitor_is_running, Duration::from_secs(15)) {
            return Err("监控启动超时：请检查监控程序是否可执行（权限）".to_string());
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn monitor_start(app: AppHandle) -> Result<MonitorStatus, String> {
    let platform = platform();
    if platform == "unsupported" {
        return Err("当前系统暂不支持任务监控".to_string());
    }

    emit_progress(&app, "checking")?;

    match fetch_monitor_manifest().await {
        Ok(manifest) => {
            let platform_files = manifest
                .platforms
                .get(platform)
                .ok_or_else(|| "该平台监控暂未发布".to_string())?;
            if needs_update(&manifest, platform) {
                emit_progress(&app, "new_version")?;
                emit_progress(&app, "downloading")?;
                // 先下载并校验到 staging，成功后再停旧监控；
                // 否则下载失败会把正在运行的监控关掉，用户会以为监控坏了。
                let staging = download_to_staging(platform_files).await?;
                emit_progress(&app, "replacing")?;
                if monitor_is_running() {
                    monitor_stop()?;
                }
                apply_staged(&staging, platform_files, &manifest.version, platform)?;
            }
            emit_progress(&app, "starting")?;
            start_platform()?;
        }
        Err(e) => {
            if package_installed() {
                // OSS 拉取失败但本地已安装：继续启动本地版本，并提示检查失败
                emit_progress(&app, "check_failed_use_local")?;
                emit_progress(&app, "starting")?;
                start_platform()?;
            } else {
                return Err(format!("获取监控清单失败：{e}"));
            }
        }
    }

    Ok(status())
}

#[tauri::command]
pub fn monitor_stop() -> Result<MonitorStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let stop_bat = monitor_dir().join("stop-monitor.bat");
        if stop_bat.exists() {
            run_hidden(&stop_bat)?;
        } else {
            // 客户端还没下载过自己的脚本，但监控可能正从其它目录运行
            stop_any_monitor_fallback()?;
        }
        // 等监控真正退出再返回，避免界面误显示“已打开”
        if !wait_until(|| !monitor_is_running(), Duration::from_secs(10)) {
            return Err("监控停止超时：仍有监控进程在运行".to_string());
        }
    }

    #[cfg(target_os = "macos")]
    {
        let sh = monitor_dir().join("uninstall_launchagent.sh");
        if sh.exists() {
            run_sh(&sh)?;
        }
        if !wait_until(|| !monitor_is_running(), Duration::from_secs(10)) {
            return Err("监控停止超时：仍有监控进程在运行".to_string());
        }
    }

    #[cfg(target_os = "linux")]
    {
        let sh = monitor_dir().join("uninstall_linux.sh");
        if sh.exists() {
            run_sh(&sh)?;
        }
        if !wait_until(|| !monitor_is_running(), Duration::from_secs(10)) {
            return Err("监控停止超时：仍有监控进程在运行".to_string());
        }
    }

    Ok(status())
}
