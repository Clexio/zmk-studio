import { FIRMWARE_MANIFEST_URL, FIRMWARE_MAIN_FILE } from "./config";

export interface FirmwareManifestFile {
  name: string;
  url: string;
  sha256: string;
  size: number;
}

export interface FirmwareManifest {
  version: string;
  released_at?: string;
  board?: string;
  shield?: string;
  files: FirmwareManifestFile[];
}

export class FirmwareUpdateError extends Error {}

export async function fetchFirmwareManifest(): Promise<FirmwareManifest> {
  if (!FIRMWARE_MANIFEST_URL) {
    throw new FirmwareUpdateError("NOT_CONFIGURED");
  }

  const resp = await fetch(FIRMWARE_MANIFEST_URL, { cache: "no-store" });
  if (!resp.ok) {
    throw new FirmwareUpdateError(`HTTP ${resp.status}`);
  }

  const data = (await resp.json()) as FirmwareManifest;
  if (!data || typeof data.version !== "string" || !Array.isArray(data.files)) {
    throw new FirmwareUpdateError("BAD_MANIFEST");
  }

  return data;
}

export async function downloadFirmwareFile(
  file: FirmwareManifestFile,
  onProgress?: (loaded: number, total: number) => void
): Promise<Uint8Array> {
  const resp = await fetch(file.url, { cache: "no-store" });
  if (!resp.ok) {
    throw new FirmwareUpdateError(`HTTP ${resp.status}`);
  }

  const total = Number(resp.headers.get("content-length")) || file.size || 0;
  if (!resp.body) {
    return new Uint8Array(await resp.arrayBuffer());
  }

  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
      loaded += value.length;
      onProgress?.(loaded, total);
    }
  }

  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    data as unknown as BufferSource
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// 版本形如 fw-20260813-442afa5；先按日期部分比较新旧，日期相同再比较整个字符串。
export function isNewerVersion(
  latest: string,
  current: string | undefined
): boolean {
  if (!current || current === "unknown" || current === "") {
    return true;
  }

  const dateOf = (v: string) => {
    const m = v.match(/fw-(\d{8})/);
    return m ? Number(m[1]) : 0;
  };

  const l = dateOf(latest);
  const c = dateOf(current);
  if (l !== c) {
    return l > c;
  }
  return latest !== current;
}

export function pickMainFirmware(
  manifest: FirmwareManifest
): FirmwareManifestFile | undefined {
  return (
    manifest.files.find((f) => f.name === FIRMWARE_MAIN_FILE) ||
    manifest.files.find(
      (f) =>
        f.name.endsWith(".uf2") &&
        !f.name.includes("log") &&
        !f.name.includes("settings_reset")
    )
  );
}
