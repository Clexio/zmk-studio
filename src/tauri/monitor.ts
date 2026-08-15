import { invoke } from "@tauri-apps/api/core";

export interface MonitorStatus {
  installed: boolean;
  running: boolean;
  version: string;
}

export async function monitorInstall(): Promise<MonitorStatus> {
  return await invoke<MonitorStatus>("monitor_install");
}

export async function monitorStatus(): Promise<MonitorStatus> {
  return await invoke<MonitorStatus>("monitor_status");
}

export async function monitorStart(): Promise<MonitorStatus> {
  return await invoke<MonitorStatus>("monitor_start");
}

export async function monitorStop(): Promise<MonitorStatus> {
  return await invoke<MonitorStatus>("monitor_stop");
}
