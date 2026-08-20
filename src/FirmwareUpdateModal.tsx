import { useCallback, useEffect, useRef, useState } from "react";

import { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client/index";

import { GenericModal } from "./GenericModal";
import { useModalRef } from "./misc/useModalRef";
import { useI18n, TranslationKey } from "./i18n";
import { call_rpc } from "./rpc/logging";
import { SetLayerBindingResponse } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { find_uf2_drive, write_uf2_to_drive } from "./tauri/uf2";
import {
  downloadFirmwareFile,
  fetchFirmwareManifest,
  isNewerVersion,
  pickMainFirmware,
  sha256Hex,
  FirmwareManifest,
} from "./firmware/update";

type Phase = "idle" | "checking" | "result" | "updating" | "done" | "error";
type UpdateStep =
  | "bootloader"
  | "downloading"
  | "verifying"
  | "flashing"
  | "rebooting";

export interface FirmwareUpdateModalProps {
  open: boolean;
  onClose: () => void;
  conn: RpcConnection | null;
  currentVersion?: string;
  onUpdated?: (version: string) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForUf2Drive(timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const drive = await find_uf2_drive();
      if (drive) {
        return drive;
      }
    } catch {
      // 检测命令偶发失败时继续重试，不中断流程
    }
    await sleep(500);
  }
  return null;
}

async function waitForUf2DriveGone(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const drive = await find_uf2_drive();
      if (!drive) {
        return true;
      }
    } catch {
      // 检测命令偶发失败时继续重试
    }
    await sleep(500);
  }
  return false;
}

interface BootKeyBinding {
  layerId: number;
  keyPosition: number;
  original: {
    behaviorId: number;
    param1: number;
    param2: number;
  };
}

// 旧固件可能没有 rebootToBootloader RPC，但 ZMK 默认都会编译进 &bootloader 行为。
// 这里通过 Studio RPC 把最后一层的一个按键临时绑成 Bootloader，让用户按键进入刷机模式。
async function bindBootloaderKey(
  conn: RpcConnection
): Promise<BootKeyBinding | undefined> {
  try {
    // 1) 找到 Bootloader 行为的 local id（兼容 CRC16 或顺序 id 两种固件）
    const listResp = await call_rpc(conn, {
      behaviors: { listAllBehaviors: true },
    });
    const ids = listResp?.behaviors?.listAllBehaviors?.behaviors || [];
    let bootloaderId: number | undefined;
    for (const id of ids) {
      const detailResp = await call_rpc(conn, {
        behaviors: { getBehaviorDetails: { behaviorId: id } },
      });
      const dets = detailResp?.behaviors?.getBehaviorDetails;
      if (dets && dets.displayName === "Bootloader") {
        bootloaderId = dets.id;
        break;
      }
    }
    if (bootloaderId === undefined) {
      return undefined;
    }

    // 2) 取 keymap，选最后一层的第 1 个按键作为临时入口
    const keymapResp = await call_rpc(conn, { keymap: { getKeymap: true } });
    const layers = keymapResp?.keymap?.getKeymap?.layers || [];
    if (layers.length === 0) {
      return undefined;
    }
    const lastLayer = layers[layers.length - 1];
    const keyPosition = 0;
    const old = lastLayer.bindings?.[keyPosition];
    const original = old
      ? {
          behaviorId: old.behaviorId,
          param1: old.param1,
          param2: old.param2,
        }
      : { behaviorId: 0, param1: 0, param2: 0 };

    // 3) 临时绑定（不 save，重启后自动消失）
    const setResp = await call_rpc(conn, {
      keymap: {
        setLayerBinding: {
          layerId: lastLayer.id,
          keyPosition,
          binding: { behaviorId: bootloaderId, param1: 0, param2: 0 },
        },
      },
    });
    if (
      setResp?.keymap?.setLayerBinding !==
      SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK
    ) {
      return undefined;
    }

    return { layerId: lastLayer.id, keyPosition, original };
  } catch (e) {
    console.error("bindBootloaderKey failed", e);
    return undefined;
  }
}

async function restoreBootloaderKey(
  conn: RpcConnection,
  info: BootKeyBinding
) {
  try {
    await call_rpc(conn, {
      keymap: {
        setLayerBinding: {
          layerId: info.layerId,
          keyPosition: info.keyPosition,
          binding: info.original,
        },
      },
    });
  } catch (e) {
    console.error("restoreBootloaderKey failed", e);
  }
}

export const FirmwareUpdateModal = ({
  open,
  onClose,
  conn,
  currentVersion,
  onUpdated,
}: FirmwareUpdateModalProps) => {
  const { t } = useI18n();
  const modalRef = useModalRef(open);
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState<UpdateStep>("bootloader");
  const [bootManual, setBootManual] = useState(false);
  const [bootKeyPosition, setBootKeyPosition] = useState<number | null>(null);
  const [latest, setLatest] = useState<FirmwareManifest | null>(null);
  const [errorKey, setErrorKey] = useState<TranslationKey>("checkFailed");
  const [errorDetail, setErrorDetail] = useState("");
  const busyRef = useRef(false);
  const checkedRef = useRef(false);

  const checkUpdates = useCallback(async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setPhase("checking");
    setErrorKey("checkFailed");
    setErrorDetail("");
    try {
      const manifest = await fetchFirmwareManifest();
      setLatest(manifest);
      setPhase("result");
    } catch (e: any) {
      setPhase("error");
      setErrorKey(
        (e?.message === "NOT_CONFIGURED"
          ? "noUpdateSource"
          : "checkFailed") as TranslationKey
      );
      setErrorDetail(e?.message ? String(e.message) : String(e));
    } finally {
      busyRef.current = false;
    }
  }, []);

  const runUpdate = useCallback(async (skipReboot: boolean) => {
    if (!latest || busyRef.current) {
      return;
    }
    busyRef.current = true;
    setPhase("updating");
    setStep("bootloader");
    setErrorKey("updateFailed");
    setErrorDetail("");
    setBootKeyPosition(null);
    let bootKeyBinding: BootKeyBinding | undefined;
    try {
      // 1) 让键盘进入刷机模式（USB 连接时自动重启进引导程序）
      if (conn) {
        if (!skipReboot) {
          // call_rpc 已有 5 秒超时：串口断开会以 "No response" 结束，
          // 丢包/无响应会以 RPC timeout 结束。这里最多重试 3 次，
          // 确保指令尽量送达键盘。
          let rebooted = false;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await call_rpc(conn, { core: { rebootToBootloader: true } });
              rebooted = true;
              break;
            } catch (e: any) {
              // 固件成功重启后不会回响应（No RPC response received），
              // 这种情况视为指令已送达。
              if (
                e === "No response" ||
                (e instanceof Error && e.message === "No RPC response received")
              ) {
                rebooted = true;
                break;
              }
              if (attempt < 2) {
                await sleep(1000);
              }
            }
          }
          if (rebooted) {
            // 键盘即将复位：主动关闭串口管道，让 macOS 尽快释放 CDC 端口，
            // 避免复位后端口一直被标记为“被占用”。
            try {
              await conn.request_writable.close();
            } catch {
              // 设备可能已重启、管道已关闭，忽略即可
            }
            setBootManual(false);
          } else {
            // 旧固件不支持 rebootToBootloader：临时绑定 Bootloader 键，
            // 引导用户按键进入刷机模式，而不是要求拆机按复位键。
            bootKeyBinding = await bindBootloaderKey(conn);
            if (bootKeyBinding) {
              setBootKeyPosition(bootKeyBinding.keyPosition);
              setBootManual(false);
            } else {
              setBootManual(true);
            }
          }
        } else {
          // 重试路径（点击“重新检测磁盘”）：键盘可能仍在正常运行，
          // 重新尝试临时绑定刷机键，引导用户按键进入刷机模式。
          bootKeyBinding = await bindBootloaderKey(conn);
          if (bootKeyBinding) {
            setBootKeyPosition(bootKeyBinding.keyPosition);
            setBootManual(false);
          } else {
            setBootManual(true);
          }
        }
      } else {
        setBootManual(true);
      }

      // 2) 等待 NRFMicroBOOT 盘出现（最长 120 秒）
      const drive = await waitForUf2Drive(120000);
      if (!drive) {
        setBootManual(true);
        throw new Error("noDrive");
      }

      // 3) 下载最新固件
      setStep("downloading");
      const file = pickMainFirmware(latest);
      if (!file) {
        throw new Error("noFile");
      }
      const data = await downloadFirmwareFile(file);

      // 4) SHA-256 校验
      setStep("verifying");
      const hash = await sha256Hex(data);
      if (
        file.sha256 &&
        hash.toLowerCase() !== file.sha256.toLowerCase()
      ) {
        throw new Error("hashMismatch");
      }

      // 5) 写入 U 盘，引导程序自动烧录并重启
      setStep("flashing");
      let writeError: unknown = null;
      try {
        await write_uf2_to_drive(drive, data);
      } catch (e) {
        // 引导程序写完最后一块会立即重启并弹出 U 盘，
        // 此时写入可能报“设备断开”，但烧录实际已经完成，属正常现象。
        writeError = e;
        console.warn("UF2 write reported an error (drive may have reset):", e);
      }
      setStep("rebooting");
      const driveGone = await waitForUf2DriveGone(30000);
      if (!driveGone) {
        if (writeError !== null) {
          const err = new Error("writeFailed") as Error & { cause?: unknown };
          err.cause = writeError;
          throw err;
        }
        throw new Error("stillMounted");
      }

      setPhase("done");
      onUpdated?.(latest.version);
    } catch (e: any) {
      if (bootKeyBinding && conn) {
        await restoreBootloaderKey(conn, bootKeyBinding);
      }
      setPhase("error");
      setErrorKey((e?.message as TranslationKey) || "updateFailed");
      setErrorDetail(
        e?.cause !== undefined
          ? String(e.cause)
          : e?.message
            ? String(e.message)
            : String(e)
      );
    } finally {
      busyRef.current = false;
    }
  }, [latest, conn]);

  const startUpdate = useCallback(async () => {
    await runUpdate(false);
  }, [runUpdate]);

  const retryDrive = useCallback(async () => {
    await runUpdate(true);
  }, [runUpdate]);

  useEffect(() => {
    if (open) {
      if (!checkedRef.current) {
        checkedRef.current = true;
        checkUpdates();
      }
    } else {
      checkedRef.current = false;
      setPhase("idle");
      setLatest(null);
      setErrorKey("checkFailed");
      setErrorDetail("");
      setBootManual(false);
      setBootKeyPosition(null);
    }
  }, [open, checkUpdates]);

  const updateAvailable =
    latest != null && isNewerVersion(latest.version, currentVersion);

  return (
    <GenericModal ref={modalRef} className="max-w-[60vw]">
      <h2 className="my-2 text-lg">{t("firmwareUpdate")}</h2>

      <div className="flex flex-col gap-2 min-w-[24rem]">
        <div className="text-sm">
          <span>{t("currentVersion")}: </span>
          <span className="font-mono">{currentVersion || t("unknown")}</span>
        </div>

        {phase === "checking" && <p>{t("checkingForUpdates")}…</p>}

        {phase === "result" && latest && (
          <>
            <div className="text-sm">
              <span>{t("latestVersion")}: </span>
              <span className="font-mono">{latest.version}</span>
            </div>
            {updateAvailable ? (
              <p>{t("updateAvailable")}</p>
            ) : (
              <p>{t("upToDate")}</p>
            )}
          </>
        )}

        {phase === "updating" && (
          <div className="flex flex-col gap-2">
            {step === "bootloader" && (
              <>
                <p>{t("enteringBootloader")}</p>
                {bootManual ? (
                  <p className="text-lg opacity-90 whitespace-pre-line">
                    {t("bootloaderManualHint")}
                  </p>
                ) : bootKeyPosition !== null ? (
                  <p className="text-lg opacity-90 whitespace-pre-line">
                    {t("bootloaderKeyHint").replace(
                      "{pos}",
                      String(bootKeyPosition + 1)
                    )}
                  </p>
                ) : (
                  <p className="text-xs opacity-70">
                    {t("bootloaderAutoHint")}
                  </p>
                )}
              </>
            )}
            {step === "downloading" && (
              <p>{t("downloadingFirmware")}…</p>
            )}
            {step === "verifying" && <p>{t("verifyingFirmware")}</p>}
            {step === "flashing" && <p>{t("flashingFirmware")}</p>}
            {step === "rebooting" && <p>{t("waitingForReboot")}</p>}
          </div>
        )}

        {phase === "done" && (
          <>
            <p>{t("firmwareUpdateDone")}</p>
            <p className="text-xs opacity-70">
              {t("firmwareUpdateDoneHint")}
            </p>
          </>
        )}

        {phase === "error" && (
          <>
            <p>{t(errorKey)}</p>
            {errorDetail && (
              <p className="text-xs opacity-70 break-all">{errorDetail}</p>
            )}
            {errorKey === "noDrive" && (
              <p className="text-lg opacity-90 whitespace-pre-line">
                {t("bootloaderManualHint")}
              </p>
            )}
          </>
        )}

        <div className="text-sm bg-base-200 border border-base-300 rounded p-2 whitespace-pre-line">
          {t("firmwareUpdateWarnings")}
        </div>

        <div className="flex justify-end my-2 gap-3">
          {phase === "error" && errorKey === "noDrive" && (
            <button
              className="rounded bg-primary text-primary-content hover:opacity-90 px-3 py-2"
              onClick={retryDrive}
            >
              {t("retryDetect")}
            </button>
          )}
          {phase === "result" && updateAvailable && (
            <button
              className="rounded bg-primary text-primary-content hover:opacity-90 px-3 py-2"
              onClick={startUpdate}
            >
              {t("updateNow")}
            </button>
          )}
          {phase === "result" && !updateAvailable && (
            <button
              className="rounded bg-base-200 hover:bg-base-300 px-3 py-2"
              onClick={checkUpdates}
            >
              {t("checkForUpdates")}
            </button>
          )}
          {phase === "checking" && (
            <button
              className="rounded bg-base-200 hover:bg-base-300 px-3 py-2"
              disabled
            >
              {t("checkingForUpdates")}
            </button>
          )}
          <button
            className="rounded bg-base-200 hover:bg-base-300 px-3 py-2 disabled:opacity-40"
            disabled={phase === "updating"}
            onClick={onClose}
          >
            {t("close")}
          </button>
        </div>
      </div>
    </GenericModal>
  );
};
