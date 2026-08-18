import { useCallback, useEffect, useRef, useState } from "react";

import { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client/index";

import { GenericModal } from "./GenericModal";
import { useModalRef } from "./misc/useModalRef";
import { useI18n, TranslationKey } from "./i18n";
import { call_rpc } from "./rpc/logging";
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

  const startUpdate = useCallback(async () => {
    if (!latest || busyRef.current) {
      return;
    }
    busyRef.current = true;
    setPhase("updating");
    setStep("bootloader");
    setErrorKey("updateFailed");
    setErrorDetail("");
    try {
      // 1) 让键盘进入刷机模式（USB 连接时自动重启进引导程序）
      if (conn) {
        // 串口可能因重启/拔线而断开，RPC 可能永不返回；
        // 加 3 秒超时，保证流程一定能走到“等待刷机盘/重新检测”阶段
        const r = await Promise.race([
          call_rpc(conn, { core: { rebootToBootloader: true } }),
          new Promise<Error>((resolve) =>
            setTimeout(() => resolve(new Error("rpcTimeout")), 3000)
          ),
        ]);
        setBootManual(r instanceof Error);
      } else {
        setBootManual(true);
      }

      // 2) 等待 NRFMicroBOOT 盘出现（最多 60 秒；也可手动双击复位键）
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
              onClick={startUpdate}
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
