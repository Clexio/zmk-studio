import { invoke } from "@tauri-apps/api/core";

export async function find_uf2_drive(): Promise<string | null> {
  return await invoke<string | null>("find_uf2_drive");
}

export async function write_uf2_to_drive(
  drive: string,
  data: Uint8Array
): Promise<void> {
  await invoke("write_uf2_to_drive", { drive, data });
}
