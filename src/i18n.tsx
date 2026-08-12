import React, { createContext, useContext } from "react";
import { useLocalStorageState } from "./misc/useLocalStorageState";

export type Language = "zh" | "en";

const en = {
  appName: "Studio",
  connectFailed: "Failed to connect to the chosen device",
  restoreStockSettings: "Restore Stock Settings",
  restoreStockSettingsTitle: "Restore Stock Settings",
  restoreStockSettingsDesc:
    "Settings reset will remove any customizations previously made in ZMK Studio and restore the stock keymap",
  continueQuestion: "Continue?",
  cancel: "Cancel",
  disconnect: "Disconnect",
  undo: "Undo",
  redo: "Redo",
  save: "Save",
  discard: "Discard",
  aboutZmkStudio: "About ZMK Studio",
  licenseNotice: "License NOTICE",
  welcome: "Welcome to ZMK Studio",
  selectDevice: "Select A Device:",
  device: "Device",
  selectConnectionType: "Select a connection type.",
  browserNotSupportedPart1:
    "Your browser is not supported. ZMK Studio uses either",
  browserNotSupportedPart2: "or",
  browserNotSupportedPart3: "(Linux only) to connect to ZMK devices.",
  toUseStudio: "To use ZMK Studio, either:",
  useSupportedBrowser:
    "Use a browser that supports the above web technologies, e.g. Chrome/Edge, or",
  downloadApp: "Download our cross platform application.",
  unlockTitle: "Unlock To Continue",
  unlockDesc1:
    "For security reasons, your keyboard requires unlocking before using ZMK Studio.",
  unlockDesc2:
    "If studio unlocking hasn't been added to your keymap or a combo, see the",
  unlockDoc: "Studio Unlock Behavior",
  unlockDesc3: "documentation for more information.",
  zmkProject: "The ZMK Project:",
  website: "website",
  githubIssues: "GitHub Issues",
  discordServer: "Discord Server",
  close: "Close",
  aboutText:
    "ZMK Studio is made possible thanks to the generous donation of time from our contributors, as well as the financial sponsorship from the following vendors:",
  layers: "Layers",
  newLayerName: "New Layer Name",
  keymapLayerAria: "Keymap Layer",
  keyName: "Key Name",
  keyNamePlaceholder: "e.g. Up",
  behavior: "Behavior:",
  layout: "Layout",
  zoomAuto: "Auto",
  unknown: "Unknown",
  knob: "Knob (Encoder)",
  knobHint: "Set the knob rotation behavior for this layer",
  knobLeft: "Left rotation",
  knobRight: "Right rotation",
  knobPress: "Knob press",
  downloadFor: "Download for",
  hideAllDownloads: "Hide all downloads",
  showAllDownloads: "Show all downloads",
  seeGithubReleases: "See GitHub Releases →",
  licenseText:
    "ZMK Studio is released under the open source Apache 2.0 license. A copy of the NOTICE file from the ZMK Studio repository is included here:",
  someComposite: "Some composite?",
  layerNameLabel: "Layer Name",
};

const zh: typeof en = {
  appName: "工作室",
  connectFailed: "无法连接到所选设备",
  restoreStockSettings: "恢复出厂设置",
  restoreStockSettingsTitle: "恢复出厂设置",
  restoreStockSettingsDesc:
    "恢复出厂设置将删除之前在 ZMK Studio 中做的所有自定义，并恢复默认键位",
  continueQuestion: "确定继续？",
  cancel: "取消",
  disconnect: "断开连接",
  undo: "撤销",
  redo: "重做",
  save: "保存",
  discard: "放弃更改",
  aboutZmkStudio: "关于 ZMK Studio",
  licenseNotice: "许可声明",
  welcome: "欢迎使用 ZMK Studio",
  selectDevice: "选择设备：",
  device: "设备",
  selectConnectionType: "选择连接方式：",
  browserNotSupportedPart1: "你的浏览器不受支持。ZMK Studio 需要使用",
  browserNotSupportedPart2: "或",
  browserNotSupportedPart3: "（仅限 Linux）来连接 ZMK 设备。",
  toUseStudio: "要使用 ZMK Studio，你可以：",
  useSupportedBrowser: "使用支持上述技术的浏览器（例如 Chrome / Edge），或",
  downloadApp: "下载我们的跨平台应用。",
  unlockTitle: "解锁以继续",
  unlockDesc1:
    "出于安全原因，你的键盘在使用 ZMK Studio 前需要先解锁。",
  unlockDesc2: "如果键盘没有添加解锁行为，请查看",
  unlockDoc: "Studio 解锁行为",
  unlockDesc3: "文档了解更多信息。",
  zmkProject: "ZMK 项目：",
  website: "官网",
  githubIssues: "GitHub Issues",
  discordServer: "Discord 服务器",
  close: "关闭",
  aboutText:
    "ZMK Studio 的诞生离不开贡献者们慷慨付出的时间，以及以下厂商提供的资金赞助：",
  layers: "层",
  newLayerName: "新层名",
  keymapLayerAria: "键位层",
  keyName: "按键名",
  keyNamePlaceholder: "如：上移",
  behavior: "行为：",
  layout: "布局",
  zoomAuto: "自动",
  unknown: "未知",
  knob: "旋钮（编码器）",
  knobHint: "设置该层旋钮旋转时的行为",
  knobLeft: "左旋",
  knobRight: "右旋",
  knobPress: "旋钮按下",
  downloadFor: "下载适用于",
  hideAllDownloads: "隐藏全部下载",
  showAllDownloads: "显示全部下载",
  seeGithubReleases: "查看 GitHub Releases →",
  licenseText:
    "ZMK Studio 以开源 Apache 2.0 许可证发布。这里包含来自 ZMK Studio 仓库的 NOTICE 文件副本：",
  someComposite: "复合参数？",
  layerNameLabel: "层名",
};

type TranslationKey = keyof typeof en;
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
