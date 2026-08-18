import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAndroid,
  faApple,
  faLinux,
  faWindows,
  IconDefinition,
} from "@fortawesome/free-brands-svg-icons";
import { DownloadIcon } from "lucide-react";
import { APP_MANIFEST_URL } from "./firmware/config";
import { http_get_text } from "./tauri/http";
import { useI18n } from "./i18n";

type Platform = "windows" | "mac" | "linux" | "ios" | "android" | "unknown";

const PlatformMetadata: Record<
  Platform,
  { name: string; icon: IconDefinition }
> = {
  windows: {
    name: "Windows",
    icon: faWindows,
  },
  mac: {
    name: "macOS",
    icon: faApple,
  },
  linux: {
    name: "Linux",
    icon: faLinux,
  },
  ios: {
    name: "iOS",
    icon: faApple,
  },
  android: {
    name: "Android",
    icon: faAndroid,
  },
  unknown: {
    name: "Unknown",
    icon: faAndroid,
  },
};

type DownloadLink = {
  name: string;
  urlPattern: RegExp;
};

const DownloadLinks: Record<string, DownloadLink> = {
  windows_exe: {
    name: "Windows (exe)",
    urlPattern: /.*\.exe/,
  },
  windows_msi: {
    name: "Windows (msi)",
    urlPattern: /.*\.msi/,
  },
  macos: {
    name: "macOS",
    urlPattern: /.*\.dmg/,
  },
  linux_appimage: {
    name: "Linux (AppImage)",
    urlPattern: /.*\.AppImage/,
  },
  linux_deb: {
    name: "Linux (deb)",
    urlPattern: /.*\.deb/,
  },
};

const PlatformLinks: Record<Platform, DownloadLink[]> = {
  windows: [DownloadLinks.windows_exe, DownloadLinks.windows_msi],
  mac: [DownloadLinks.macos],
  linux: [DownloadLinks.linux_appimage, DownloadLinks.linux_deb],
  ios: [],
  android: [],
  unknown: [],
};

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";

  const userAgent = window.navigator.userAgent.toLowerCase();

  if (userAgent.includes("win")) return "windows";
  if (userAgent.includes("mac")) return "mac";
  if (userAgent.includes("linux")) return "linux";
  if (/iphone|ipad|ipod/.test(userAgent)) return "ios";
  if (userAgent.includes("android")) return "android";

  return "unknown";
}

function getUrlFromPattern(assets: string[], pattern: RegExp) {
  const asset = assets.find((asset) => pattern.test(asset));
  return asset;
}

async function loadManifest(): Promise<any> {
  // 桌面端走 Rust 后端读取，彻底绕开 CORS；浏览器模式用 fetch + 超时/重试
  if (window.__TAURI_INTERNALS__) {
    const text = await http_get_text(APP_MANIFEST_URL);
    return JSON.parse(text);
  }

  const doFetch = (signal: AbortSignal) =>
    fetch(APP_MANIFEST_URL, { signal }).then((r) => {
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      return r.json();
    });

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      return await doFetch(controller.signal);
    } catch (e) {
      lastError = e;
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw lastError;
}

export const Download = () => {
  const { t } = useI18n();
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [showAll, setShowAll] = useState(false);
  const [assets, setAssets] = useState<string[]>([]);
  const [version, setVersion] = useState<string>("");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const platform = detectPlatform();
    setPlatform(platform);
    if (PlatformLinks[platform].length === 0) {
      setShowAll(true);
    }

    // 从 OSS 读取 KeyPlayer 自己的安装包清单，避免误链到上游 ZMK Studio
    loadManifest()
      .then((manifest: any) => {
        const urls: string[] = [];
        const platforms = manifest?.platforms || {};
        for (const pf of ["windows", "macos", "linux"]) {
          for (const f of platforms[pf]?.files || []) {
            if (typeof f?.url === "string") {
              urls.push(f.url);
            }
          }
        }
        setAssets(urls);
        setVersion(manifest?.version || "");
      })
      .catch((e) => {
        console.error("Failed to load download manifest", e);
        setLoadError(true);
      });
  }, []);

  return (
    <div className="bg-base-200 text-base-content min-h-full w-full flex flex-col justify-center items-center p-10 pb-48">
      <img src="/logo.png" alt="KeyPlayer" className="w-48 rounded-2xl" />
      <div className="text-3xl mb-1">KeyPlayer Studio</div>
      <div className="text-md mb-1 opacity-70">
        {version || "0.3.2"}
      </div>
      <div className="bg-base-100 p-8 max-w-md w-full m-2 rounded-lg shadow-lg">
        {loadError ? (
          <p className="text-sm opacity-70">{t("downloadUnavailable")}</p>
        ) : assets.length === 0 ? (
          <p className="text-sm opacity-70">{t("loadingDownloads")}</p>
        ) : PlatformLinks[platform].length > 0 ? (
          <>
            <div className="flex flex-col gap-3 mb-3">
              {PlatformLinks[platform].map((link, i) => (
                (() => {
                  const url = getUrlFromPattern(assets, link.urlPattern);
                  if (!url) {
                    return (
                      <span
                        key={link.name}
                        className={`p-3 text-lg rounded-lg justify-center items-center gap-3 flex opacity-50 ${
                          i === 0
                            ? "bg-primary text-primary-content"
                            : "bg-base-100 border border-base-300 text-base-content"
                        }`}
                      >
                        <FontAwesomeIcon icon={PlatformMetadata[platform].icon} className="h-6"/>{" "}
                        {t("downloadFor")} {link.name}
                      </span>
                    );
                  }
                  return (
                    <a
                      key={link.name}
                      href={url}
                      className={`p-3 text-lg rounded-lg justify-center items-center gap-3 flex ${
                        i === 0
                          ? "bg-primary hover:opacity-85 active:opacity-70 text-primary-content"
                          : "bg-base-100 border border-base-300 text-base-content hover:bg-base-200"
                      }`}
                    >
                      <FontAwesomeIcon icon={PlatformMetadata[platform].icon} className="h-6"/>{" "}
                      {t("downloadFor")} {link.name}
                    </a>
                  );
                })()
              ))}
            </div>
          </>
        ) : null}
        <div className="flex flex-col gap-3">
          {PlatformLinks[platform].length > 0 && assets.length > 0 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-primary text-left hover:underline"
            >
              {showAll ? t("hideAllDownloads") : t("showAllDownloads")}
            </button>
          )}
          {showAll && (
            <div>
              {Object.entries(PlatformLinks).map(([platform, links]) => (
                <div key={platform}>
                  {links.map((link) => (
                    (() => {
                      const url = getUrlFromPattern(assets, link.urlPattern);
                      if (!url) {
                        return (
                          <span
                            key={link.name}
                            className="flex gap-1 mb-3 text-base-content opacity-50"
                          >
                            <DownloadIcon className="w-5" />
                            {link.name}
                          </span>
                        );
                      }
                      return (
                        <a
                          key={link.name}
                          href={url}
                          className="flex gap-1 mb-3 text-base-content hover:underline"
                        >
                          <DownloadIcon className="w-5" />
                          {link.name}
                        </a>
                      );
                    })()
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
