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
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForUf2Drive(timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const drive = await find_uf2_drive();
    if (drive) {
      return drive;
    }
    await sleep(500);
  }
  return null;
}

async function waitForUf2DriveGone(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const drive = await find_uf2_drive();
    if (!drive) {
      return true;
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
}: FirmwareUpdateModalProps) => {
  const { t } = useI18n();
  const modalRef = useModalRef(open);
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState<UpdateStep>("bootloader");
  const [latest, setLatest] = useState<FirmwareManifest | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorKey, setErrorKey] = useState<TranslationKey>("checkFailed");
  const busyRef = useRef(false);
  const checkedRef = useRef(false);

  const checkUpdates = useCallback(async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setPhase("checking");
    setErrorKey("checkFailed");
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
    setProgress(0);
    setErrorKey("updateFailed");
    try {
      // 1) 让键盘进入刷机模式（USB 连接时自动重启进引导程序）
      if (conn) {
        call_rpc(conn, { core: { rebootToBootloader: true } }).catch(() => {});
      }

      // 2) 等待 NRFMicroBOOT 盘出现（最多 60 秒；也可手动双击复位键）
      const drive = await waitForUf2Drive(60000);
      if (!drive) {
        throw new Error("noDrive");
      }

      // 3) 下载最新固件
      setStep("downloading");
      const file = pickMainFirmware(latest);
      if (!file) {
        throw new Error("noFile");
      }
      const data = await downloadFirmwareFile(file, (loaded, total) => {
        setProgress(total ? Math.round((loaded / total) * 100) : 0);
      });

      // 4) SHA-256 校验
      setStep("verifying");
      setProgress(0);
      const hash = await sha256Hex(data);
      if (
        file.sha256 &&
        hash.toLowerCase() !== file.sha256.toLowerCase()
      ) {
        throw new Error("hashMismatch");
      }

      // 5) 写入 U 盘，引导程序自动烧录并重启
      setStep("flashing");
      await write_uf2_to_drive(drive, data);
      await waitForUf2DriveGone(30000);

      setPhase("done");
    } catch (e: any) {
      setPhase("error");
      setErrorKey((e?.message as TranslationKey) || "updateFailed");
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
            {step === "bootloader" && <p>{t("enteringBootloader")}</p>}
            {step === "downloading" && (
              <p>
                {t("downloadingFirmware")}: {progress}%
              </p>
            )}
            {step === "verifying" && <p>{t("verifyingFirmware")}</p>}
            {step === "flashing" && <p>{t("flashingFirmware")}</p>}
            {step === "rebooting" && <p>{t("waitingForReboot")}</p>}
            {step === "downloading" && (
              <progress
                className="w-full"
                value={progress}
                max={100}
              />
            )}
          </div>
        )}

        {phase === "done" && <p>{t("firmwareUpdateDone")}</p>}

        {phase === "error" && <p>{t(errorKey)}</p>}

        <div className="flex justify-end my-2 gap-3">
          {phase === "result" && updateAvailable && (
            <button
              className="rounded bg-base-200 hover:bg-base-300 px-3 py-2"
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
            className="rounded bg-base-200 hover:bg-base-300 px-3 py-2"
            onClick={onClose}
          >
            {t("close")}
          </button>
        </div>
      </div>
    </GenericModal>
  );
};
