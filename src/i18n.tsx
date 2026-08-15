import React, { createContext, useContext } from "react";
import { useLocalStorageState } from "./misc/useLocalStorageState";

export type Language = "zh" | "en";

const en = {
  appName: "KeyPlayer Studio",
  connectFailed: "Failed to connect to the chosen device",
  restoreStockSettings: "Restore Stock Settings",
  restoreStockSettingsTitle: "Restore Stock Settings",
  restoreStockSettingsDesc:
    "Settings reset will remove any customizations previously made in KeyPlayer Studio and restore the stock keymap",
  continueQuestion: "Continue?",
  cancel: "Cancel",
  disconnect: "Disconnect",
  undo: "Undo",
  redo: "Redo",
  save: "Save",
  discard: "Discard",
  aboutZmkStudio: "About KeyPlayer Studio",
  licenseNotice: "License NOTICE",
  welcome: "Welcome to KeyPlayer Studio",
  selectDevice: "Select A Device:",
  device: "Device",
  selectConnectionType: "Select a connection type.",
  browserNotSupportedPart1:
    "Your browser is not supported. KeyPlayer Studio uses either",
  browserNotSupportedPart2: "or",
  browserNotSupportedPart3: "(Linux only) to connect to KeyPlayer devices.",
  toUseStudio: "To use KeyPlayer Studio, either:",
  useSupportedBrowser:
    "Use a browser that supports the above web technologies, e.g. Chrome/Edge, or",
  downloadApp: "Download our cross platform application.",
  unlockTitle: "Unlock To Continue",
  unlockDesc1:
    "For security reasons, your keyboard requires unlocking before using KeyPlayer Studio.",
  unlockDesc2:
    "If studio unlocking hasn't been added to your keymap or a combo, see the",
  unlockDoc: "Studio Unlock Behavior",
  unlockDesc3: "documentation for more information.",
  zmkProject: "The KeyPlayer Project:",
  website: "website",
  githubIssues: "GitHub Issues",
  discordServer: "Discord Server",
  close: "Close",
  aboutText:
    "KeyPlayer Studio is made possible thanks to the generous donation of time from our contributors, as well as the financial sponsorship from the following vendors:",
  layers: "Layers",
  newLayerName: "New Layer Name",
  keymapLayerAria: "Keymap Layer",
  keyName: "Key Naming",
  keyNamePlaceholder: "e.g. Up",
  behavior: "Behavior:",
  dailyTokens: "Daily Token Usage",
  dailyTokensTitle: "Daily Token Usage History",
  layout: "Layout",
  zoomAuto: "Auto",
  unknown: "Unknown",
  knob: "Knob (Encoder)",
  knobHint: "Set the knob rotation behavior for this layer",
  knobLeft: "Left rotation",
  knobRight: "Right rotation",
  knobPress: "Knob press",
  knobBehavior: "Encoder behavior",
  knobLeftEvent: "Left rotation event",
  knobRightEvent: "Right rotation event",
  knobEventHint: "Pick events for left and right rotation",
  knobUpdateFirmware: "Update firmware to customize knob events",
  knobBadge: "Knob",
  keySettings: "Key Settings",
  selectedKey: "Selected key",
  button: "Button",
  searchKey: "Search keys...",
  searchMedia: "Search media keys...",
  searchKeyMedia: "Search keys/media...",
  selectBehavior: "Select behavior",
  keepCurrentBehavior: "Keep current behavior",
  eventKindKey: "Key",
  eventKindConsumer: "Media key",
  downloadFor: "Download for",
  hideAllDownloads: "Hide all downloads",
  showAllDownloads: "Show all downloads",
  seeGithubReleases: "See GitHub Releases →",
  licenseText:
    "ZMK Studio is released under the open source Apache 2.0 license. A copy of the NOTICE file from the ZMK Studio repository is included here:",
  someComposite: "Some composite?",
  layerNameLabel: "Layer Name",
  firmwareUpdate: "Firmware Update",
  currentVersion: "Current version",
  latestVersion: "Latest version",
  checkForUpdates: "Check for updates",
  checkingForUpdates: "Checking for updates",
  updateAvailable: "A new firmware version is available.",
  upToDate: "Your firmware is up to date.",
  updateNow: "Update now",
  noUpdateSource:
    "Firmware update source is not configured. Please set FIRMWARE_MANIFEST_URL first.",
  checkFailed:
    "Failed to check for firmware updates. Please check your network connection.",
  enteringBootloader: "Sending keyboard into bootloader mode...",
  downloadingFirmware: "Downloading firmware",
  verifyingFirmware: "Verifying firmware...",
  flashingFirmware: "Flashing firmware. Do not unplug the keyboard!",
  waitingForReboot: "Waiting for the keyboard to reboot...",
  firmwareUpdateDone: "Firmware update complete!",
  updateFailed: "Firmware update failed.",
  noDrive:
    "Bootloader drive not detected. Make sure the keyboard is connected via USB, or double-click the reset button.",
  noFile: "No firmware file found in the update manifest.",
  hashMismatch:
    "Firmware verification failed. The download may be corrupted.",
  restoreDefault: "Restore default",
  factoryDefault: "Factory default",
  bootloaderUsbHint:
    "The serial connection will drop after the keyboard reboots. This is normal. Keep the keyboard connected and wait...",
  bootloaderAutoHint: "Sending reboot-to-bootloader command to the keyboard…",
  bootloaderManualHint:
    "If the firmware is too old to switch automatically:\n1. Hold the reset button and double-tap it (or press the key bound to &bootloader).\n2. Wait until a drive named NRFMicroBOOT appears.\n3. The update will continue automatically.",
  retryDetect: "Re-check drive",
  stillMounted:
    "The bootloader drive is still mounted. The firmware write may have failed.",
  firmwareUpdateDoneHint:
    "If the keyboard does not reconnect automatically, select it again from the device list.",
  firmwareUpdateWarnings:
    "Note: The update takes about 1-3 minutes. Do not close this window during the update; closing it may break existing features.\nNote: An unknown disk folder may pop up during the update; do not close it.\nNote: Bluetooth pairing information will be lost after the update. Power the keyboard off and on, remove the old pairing on both the computer and the keyboard, then pair again. Otherwise Bluetooth will not connect.",
  monitorToggle: "Task Monitor",
  monitorToggleDesc: "One-click download/start/stop the task monitor",
  monitorOn: "On",
  monitorOff: "Off",
  monitorStarting: "Starting monitor…",
  monitorStopping: "Stopping monitor…",
};

const zh: typeof en = {
  appName: "KeyPlayer Studio",
  connectFailed: "无法连接到所选设备",
  restoreStockSettings: "恢复出厂设置",
  restoreStockSettingsTitle: "恢复出厂设置",
  restoreStockSettingsDesc:
    "恢复出厂设置将删除之前在 KeyPlayer Studio 中做的所有自定义，并恢复默认键位",
  continueQuestion: "确定继续？",
  cancel: "取消",
  disconnect: "断开连接",
  undo: "撤销",
  redo: "重做",
  save: "保存",
  discard: "放弃更改",
  aboutZmkStudio: "关于 KeyPlayer Studio",
  licenseNotice: "许可声明",
  welcome: "欢迎使用 KeyPlayer Studio",
  selectDevice: "选择设备：",
  device: "设备",
  selectConnectionType: "选择连接方式：",
  browserNotSupportedPart1: "你的浏览器不受支持。KeyPlayer Studio 需要使用",
  browserNotSupportedPart2: "或",
  browserNotSupportedPart3: "（仅限 Linux）来连接 KeyPlayer 设备。",
  toUseStudio: "要使用 KeyPlayer Studio，你可以：",
  useSupportedBrowser: "使用支持上述技术的浏览器（例如 Chrome / Edge），或",
  downloadApp: "下载我们的跨平台应用。",
  unlockTitle: "解锁以继续",
  unlockDesc1:
    "出于安全原因，你的键盘在使用 KeyPlayer Studio 前需要先解锁。",
  unlockDesc2: "如果键盘没有添加解锁行为，请查看",
  unlockDoc: "Studio 解锁行为",
  unlockDesc3: "文档了解更多信息。",
  zmkProject: "KeyPlayer 项目：",
  website: "官网",
  githubIssues: "GitHub Issues",
  discordServer: "Discord 服务器",
  close: "关闭",
  aboutText:
    "KeyPlayer Studio 的诞生离不开贡献者们慷慨付出的时间，以及以下厂商提供的资金赞助：",
  layers: "层",
  newLayerName: "新层名",
  keymapLayerAria: "键位层",
  keyName: "按键命名",
  keyNamePlaceholder: "如：上移",
  behavior: "行为：",
  dailyTokens: "每日 token 消耗",
  dailyTokensTitle: "每日 token 消耗记录",
  layout: "布局",
  zoomAuto: "自动",
  unknown: "未知",
  knob: "旋钮（编码器）",
  knobHint: "设置该层旋钮旋转时的行为",
  knobLeft: "左旋",
  knobRight: "右旋",
  knobPress: "旋钮按下",
  knobBehavior: "编码器行为",
  knobLeftEvent: "左旋事件",
  knobRightEvent: "右旋事件",
  knobEventHint: "为左旋和右旋分别选择事件",
  knobUpdateFirmware: "请更新固件后即可自定义旋钮左右事件",
  knobBadge: "旋钮",
  keySettings: "按键设置",
  selectedKey: "选中按键",
  button: "按钮",
  searchKey: "搜索按键...",
  searchMedia: "搜索媒体键...",
  searchKeyMedia: "搜索按键/媒体键...",
  selectBehavior: "选择行为",
  keepCurrentBehavior: "保持当前行为",
  eventKindKey: "按键",
  eventKindConsumer: "媒体键",
  downloadFor: "下载适用于",
  hideAllDownloads: "隐藏全部下载",
  showAllDownloads: "显示全部下载",
  seeGithubReleases: "查看 GitHub Releases →",
  licenseText:
    "ZMK Studio 以开源 Apache 2.0 许可证发布。这里包含来自 ZMK Studio 仓库的 NOTICE 文件副本：",
  someComposite: "复合参数？",
  layerNameLabel: "层名",
  firmwareUpdate: "固件更新",
  currentVersion: "当前版本",
  latestVersion: "最新版本",
  checkForUpdates: "检查更新",
  checkingForUpdates: "正在检查更新",
  updateAvailable: "发现新版本固件",
  upToDate: "固件已是最新版本",
  updateNow: "立即更新",
  noUpdateSource: "固件更新源尚未配置，请先在客户端配置中填写更新源地址",
  checkFailed: "检查固件更新失败，请检查网络连接",
  enteringBootloader: "正在让键盘进入刷机模式…",
  downloadingFirmware: "正在下载固件",
  verifyingFirmware: "正在校验固件…",
  flashingFirmware: "正在烧录固件，请勿拔出键盘！",
  waitingForReboot: "正在等待键盘重启…",
  firmwareUpdateDone: "固件更新完成！",
  updateFailed: "固件更新失败",
  noDrive: "未检测到刷机盘，请确认键盘已通过 USB 连接，或双击复位键进入刷机模式",
  noFile: "更新清单中没有找到固件文件",
  hashMismatch: "固件校验失败，下载的文件可能已损坏",
  restoreDefault: "恢复默认",
  factoryDefault: "出厂默认",
  bootloaderUsbHint:
    "键盘重启后串口断开属正常现象，请保持键盘连接，等待 U 盘弹出…",
  bootloaderAutoHint: "正在向键盘发送重启到刷机模式指令…",
  bootloaderManualHint:
    "如果键盘固件较旧，无法自动进入刷机模式：\n1. 按住复位键快速双击（或按键盘上绑定 &bootloader 的按键）。\n2. 等待电脑出现 NRFMicroBOOT 磁盘。\n3. 出现后更新会自动继续。",
  retryDetect: "重新检测磁盘",
  stillMounted: "刷机盘仍然存在，固件写入可能失败",
  firmwareUpdateDoneHint: "如键盘未自动重连，请在设备列表中选择键盘重新连接",
  firmwareUpdateWarnings:
    "注：版本更新耗时约1-3分钟，更新途中请勿关闭窗口，关闭窗口可能导致现有功能失效。\n注：更新时可能会弹出未知磁盘文件夹，请勿关闭。\n注：固件更新后蓝牙配对信息失效，请将键盘手动关机重启，并且删除设备端和键盘端的蓝牙配对信息，重新配对。否则蓝牙无法连接成功。",
  monitorToggle: "任务监控",
  monitorToggleDesc: "一键下载/启动/停止任务监控",
  monitorOn: "已打开",
  monitorOff: "已关闭",
  monitorStarting: "正在打开监控…",
  monitorStopping: "正在关闭监控…",
};

export type TranslationKey = keyof typeof en;
export type I18nTranslate = (key: TranslationKey) => string;

const LanguageContext = createContext<{
  lang: Language;
  setLang: (l: Language) => void;
}>({ lang: "zh", setLang: () => {} });

export const LanguageProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [lang, setLang] = useLocalStorageState<Language>(
    "zmk-studio-language",
    "zh"
  );
  React.useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useI18n() {
  const { lang, setLang } = useContext(LanguageContext);
  const t = (key: TranslationKey): string => {
    const table = lang === "zh" ? zh : en;
    return table[key] ?? en[key] ?? key;
  };
  return { t, lang, setLang };
}

export function LanguagePicker() {
  const { lang, setLang } = useI18n();
  return (
    <select
      className="h-7 rounded px-1 text-sm bg-base-200 text-base-content"
      value={lang}
      onChange={(e) => setLang(e.target.value as Language)}
      title="Language / 语言"
    >
      <option value="zh">中文</option>
      <option value="en">English</option>
    </select>
  );
}
