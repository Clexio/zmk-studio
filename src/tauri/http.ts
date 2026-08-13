import { invoke } from "@tauri-apps/api/core";

export async function http_get_text(url: string): Promise<string> {
  return await invoke<string>("http_get_text", { url });
}

export async function http_get_bytes(url: string): Promise<Uint8Array> {
  const data = await invoke<number[]>("http_get_bytes", { url });
  return new Uint8Array(data);
}
