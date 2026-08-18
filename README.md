# ZMK Studio

Initial work on the ZMK Studio UI.

## KeyPlayer Studio

本项目交付物为 KeyPlayer Studio（fork 自 ZMK Studio），面向 KeyPlayer 定制键盘。

### 支持平台

| 平台 | 安装包 | 架构 |
| --- | --- | --- |
| Windows | exe / msi | x64 |
| macOS | dmg | universal2（Apple Silicon / Intel） |
| Linux | deb / AppImage | amd64（x86_64） |

### 任务监控平台差异

- 任务状态、token 消耗、屏幕推送、按键打开 Codex 任务：三端一致。
- 麦克风唤醒（mic-wake）：仅 Windows。
- 窗口切换：Windows 使用 UI 自动化 + `codex://` 深链；macOS / Linux 依赖 `codex://` 深链。
- 开机自启：Windows 启动文件夹；macOS LaunchAgent；Linux systemd 用户服务（无 systemd 时 XDG Autostart）。
