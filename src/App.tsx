import { AppHeader } from "./AppHeader";

import { create_rpc_connection } from "@zmkfirmware/zmk-studio-ts-client";
import { call_rpc } from "./rpc/logging";

import type { Notification } from "@zmkfirmware/zmk-studio-ts-client/studio";
import { ConnectionState, ConnectionContext } from "./rpc/ConnectionContext";
import { Dispatch, useCallback, useEffect, useRef, useState } from "react";
import { ConnectModal, TransportFactory } from "./ConnectModal";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { connect as serial_connect } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import {
  connect as tauri_serial_connect,
  list_devices as serial_list_devices,
} from "./tauri/serial";
import Keyboard from "./keyboard/Keyboard";
import { UndoRedoContext, useUndoRedo } from "./undoRedo";
import { usePub, useSub } from "./usePubSub";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { LockStateContext } from "./rpc/LockStateContext";
import { UnlockModal } from "./UnlockModal";
import { valueAfter } from "./misc/async";
import { AppFooter } from "./AppFooter";
import { LicenseNoticeModal } from "./misc/LicenseNoticeModal";
import { FirmwareUpdateModal } from "./FirmwareUpdateModal";
import { useI18n } from "./i18n";
import { useToast } from "./misc/Toast";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: object;
  }
}

// Tauri 环境只保留后端串口传输，避免 WebView 暴露 navigator.serial 时出现重复 USB 条目
const TRANSPORTS: TransportFactory[] = window.__TAURI_INTERNALS__
  ? [
      {
        label: "USB",
        pick_and_connect: {
          connect: tauri_serial_connect,
          list: serial_list_devices,
        },
      },
    ]
  : (navigator.serial
      ? [{ label: "USB", connect: serial_connect }]
      : []);

async function listen_for_notifications(
  notification_stream: ReadableStream<Notification>,
  signal: AbortSignal
): Promise<void> {
  let reader = notification_stream.getReader();
  const onAbort = () => {
    reader.cancel();
    reader.releaseLock();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  do {
    let pub = usePub();

    try {
      let { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      console.log("Notification", value);
      pub("rpc_notification", value);

      const subsystem = Object.entries(value).find(
        ([_k, v]) => v !== undefined
      );
      if (!subsystem) {
        continue;
      }

      const [subId, subData] = subsystem;
      const event = Object.entries(subData).find(([_k, v]) => v !== undefined);

      if (!event) {
        continue;
      }

      const [eventName, eventData] = event;
      const topic = ["rpc_notification", subId, eventName].join(".");

      pub(topic, eventData);
    } catch (e) {
      signal.removeEventListener("abort", onAbort);
      reader.releaseLock();
      throw e;
    }
  } while (true);

  signal.removeEventListener("abort", onAbort);
  reader.releaseLock();
  notification_stream.cancel();
}

async function connect(
  transport: RpcTransport,
  setConn: Dispatch<ConnectionState>,
  setConnectedDeviceName: Dispatch<string | undefined>,
  setConnectedFirmwareVersion: Dispatch<string | undefined>,
  signal: AbortSignal,
  onError: () => void,
  onDeviceVersion?: (version?: string) => void
) {
  let conn = await create_rpc_connection(transport, { signal });

  let details = await Promise.race([
    call_rpc(conn, { core: { getDeviceInfo: true } })
      .then((r) => r?.core?.getDeviceInfo)
      .catch((e) => {
        console.error("Failed first RPC call", e);
        return undefined;
      }),
    valueAfter(undefined, 1000),
  ]);

  if (!details) {
    onError();
    return;
  }

  listen_for_notifications(conn.notification_readable, signal)
    .then(() => {
      setConnectedDeviceName(undefined);
      setConn({ conn: null });
    })
    .catch((_e) => {
      setConnectedDeviceName(undefined);
      setConn({ conn: null });
    });

  setConnectedDeviceName(details.name);
  setConnectedFirmwareVersion(details.version);
  onDeviceVersion?.(details.version);
  setConn({ conn });
}

function App() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [conn, setConn] = useState<ConnectionState>({ conn: null });
  const [connectedDeviceName, setConnectedDeviceName] = useState<
    string | undefined
  >(undefined);
  const [connectedFirmwareVersion, setConnectedFirmwareVersion] = useState<
    string | undefined
  >(undefined);
  const [doIt, undo, redo, canUndo, canRedo, reset] = useUndoRedo();
  const [showLicenseNotice, setShowLicenseNotice] = useState(false);
  const [showFirmwareUpdate, setShowFirmwareUpdate] = useState(false);
  const [connectionAbort, setConnectionAbort] = useState(new AbortController());
  const pendingFirmwareVersionRef = useRef<string | undefined>(undefined);

  const [lockState, setLockState] = useState<LockState>(
    LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
  );

  useSub("rpc_notification.core.lockStateChanged", (ls) => {
    setLockState(ls);
  });

  useEffect(() => {
    if (!conn) {
      reset();
      setLockState(LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED);
    }

    async function updateLockState() {
      if (!conn.conn) {
        return;
      }

      // 兼容性兜底：某些平台/固件上 getLockState 的回复可能丢失或超时。
      // 只要设备没有明确回复“已锁定”，客户端就按“未锁定”处理；
      // 真正上锁的固件仍会在服务端拒绝写入，因此不会降低安全性。
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          let locked_resp = await call_rpc(conn.conn, {
            core: { getLockState: true },
          });
          let state = locked_resp.core?.getLockState;
          setLockState(
            state !== undefined
              ? state
              : LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
          );
          return;
        } catch (e) {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 300));
          } else {
            console.error("Failed to read lock state, assuming unlocked", e);
            setLockState(LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED);
          }
        }
      }
    }

    updateLockState();
  }, [conn, setLockState]);

  const save = useCallback(() => {
    async function doSave() {
      if (!conn.conn) {
        return;
      }
      try {
        let resp = await call_rpc(conn.conn, { keymap: { saveChanges: true } });
        if (!resp.keymap?.saveChanges || resp.keymap?.saveChanges.err) {
          console.error("Failed to save changes", resp.keymap?.saveChanges);
        }
      } catch (e) {
        console.error("Failed to save changes", e);
      }
    }

    doSave();
  }, [conn]);

  const discard = useCallback(() => {
    async function doDiscard() {
      if (!conn.conn) {
        return;
      }
      try {
        let resp = await call_rpc(conn.conn, {
          keymap: { discardChanges: true },
        });
        if (!resp.keymap?.discardChanges) {
          console.error("Failed to discard changes", resp);
        }
      } catch (e) {
        console.error("Failed to discard changes", e);
      }

      reset();
      setConn({ conn: conn.conn });
    }

    doDiscard();
  }, [conn]);

  const resetSettings = useCallback(() => {
    async function doReset() {
      if (!conn.conn) {
        return;
      }
      try {
        let resp = await call_rpc(conn.conn, {
          core: { resetSettings: true },
        });
        if (!resp.core?.resetSettings) {
          console.error("Failed to settings reset", resp);
        }
      } catch (e) {
        console.error("Failed to settings reset", e);
      }

      reset();
      setConn({ conn: conn.conn });
    }

    doReset();
  }, [conn]);

  const disconnect = useCallback(() => {
    async function doDisconnect() {
      if (!conn.conn) {
        return;
      }

      await conn.conn.request_writable.close();
      connectionAbort.abort("User disconnected");
      setConnectionAbort(new AbortController());
    }

    doDisconnect();
  }, [conn]);

  const onConnect = useCallback(
    (transport: RpcTransport) => {
      const ac = new AbortController();
      setConnectionAbort(ac);
      connect(
        transport,
        setConn,
        setConnectedDeviceName,
        setConnectedFirmwareVersion,
        ac.signal,
        () => showToast(t("connectFailed"), "error"),
        (version) => {
          const pending = pendingFirmwareVersionRef.current;
          pendingFirmwareVersionRef.current = undefined;
          if (pending && version && version !== pending) {
            showToast(t("firmwareVersionMismatch"), "error");
          }
        }
      );
    },
    [setConn, setConnectedDeviceName, setConnectedFirmwareVersion, showToast, t]
  );

  return (
    <ConnectionContext.Provider value={conn}>
      <LockStateContext.Provider value={lockState}>
        <UndoRedoContext.Provider value={doIt}>
          <UnlockModal />
          <ConnectModal
            open={!conn.conn && !showFirmwareUpdate}
            transports={TRANSPORTS}
            onTransportCreated={onConnect}
          />
          <LicenseNoticeModal
            open={showLicenseNotice}
            onClose={() => setShowLicenseNotice(false)}
          />
          <FirmwareUpdateModal
            open={showFirmwareUpdate}
            onClose={() => setShowFirmwareUpdate(false)}
            conn={conn.conn}
            currentVersion={connectedFirmwareVersion}
            onUpdated={(v) => {
              pendingFirmwareVersionRef.current = v;
              setConnectedFirmwareVersion(v);
            }}
          />
          <div className="bg-base-100 text-base-content h-full max-h-[100dvh] w-full max-w-[100vw] inline-grid grid-cols-[auto] grid-rows-[auto_1fr_auto] overflow-hidden">
            <AppHeader
              connectedDeviceLabel={connectedDeviceName}
              firmwareVersion={connectedFirmwareVersion}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
              onSave={save}
              onDiscard={discard}
              onDisconnect={disconnect}
              onResetSettings={resetSettings}
              onOpenFirmwareUpdate={() => setShowFirmwareUpdate(true)}
            />
            <Keyboard />
            <AppFooter
              onShowLicenseNotice={() => setShowLicenseNotice(true)}
            />
          </div>
        </UndoRedoContext.Provider>
      </LockStateContext.Provider>
    </ConnectionContext.Provider>
  );
}

export default App;
