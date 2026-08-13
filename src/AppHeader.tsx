import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
import { useConnectedDeviceData } from "./rpc/useConnectedDeviceData";
import { useSub } from "./usePubSub";
import { useContext, useEffect, useState } from "react";
import { useModalRef } from "./misc/useModalRef";
import { LockStateContext } from "./rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { ConnectionContext } from "./rpc/ConnectionContext";
import {
  ChevronDown,
  Undo2,
  Redo2,
  Save,
  Trash2,
  Download,
} from "lucide-react";
import { Tooltip } from "./misc/Tooltip";
import { GenericModal } from "./GenericModal";
import { LanguagePicker, useI18n } from "./i18n";
import { useTheme } from "./misc/useTheme";

export interface AppHeaderProps {
  connectedDeviceLabel?: string;
  firmwareVersion?: string;
  onSave?: () => void | Promise<void>;
  onDiscard?: () => void | Promise<void>;
  onUndo?: () => Promise<void>;
  onRedo?: () => Promise<void>;
  onResetSettings?: () => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  onOpenFirmwareUpdate?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export const AppHeader = ({
  connectedDeviceLabel,
  firmwareVersion,
  canRedo,
  canUndo,
  onRedo,
  onUndo,
  onSave,
  onDiscard,
  onDisconnect,
  onResetSettings,
  onOpenFirmwareUpdate,
}: AppHeaderProps) => {
  const [showSettingsReset, setShowSettingsReset] = useState(false);
  const { t } = useI18n();
  const theme = useTheme();

  const lockState = useContext(LockStateContext);
  const connectionState = useContext(ConnectionContext);

  useEffect(() => {
    if (
      (!connectionState.conn ||
        lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) &&
      showSettingsReset
    ) {
      setShowSettingsReset(false);
    }
  }, [lockState, showSettingsReset]);

  const showSettingsRef = useModalRef(showSettingsReset);
  const [unsaved, setUnsaved] = useConnectedDeviceData<boolean>(
    { keymap: { checkUnsavedChanges: true } },
    (r) => r.keymap?.checkUnsavedChanges
  );

  useSub("rpc_notification.keymap.unsavedChangesStatusChanged", (unsaved) =>
    setUnsaved(unsaved)
  );

  return (
    <header className="top-0 left-0 right-0 grid grid-cols-[1fr_auto_1fr] items-center justify-between h-10 max-w-full">
      <div className="flex px-3 items-center gap-1">
        <img src="/logo.png" alt="KeyPlayer Logo" className="h-7 rounded" />
        <img
          src={
            theme === "dark"
              ? "/keyplayer-text-white.png"
              : "/keyplayer-text-black.png"
          }
          alt="KeyPlayer"
          className="h-4"
        />
      </div>
      <div className="flex items-center gap-2">
        <MenuTrigger>
          <Button
            className="text-center rac-disabled:opacity-0 hover:bg-base-300 transition-all duration-100 p-1 pl-2 rounded-lg flex items-center gap-1 max-w-52"
            isDisabled={!connectedDeviceLabel}
          >
            <span className="truncate">{connectedDeviceLabel}</span>
            {firmwareVersion && (
              <span className="font-mono text-xs opacity-70 shrink-0">
                {firmwareVersion}
              </span>
            )}
            <ChevronDown className="inline-block w-4 shrink-0" />
          </Button>
          <Popover>
            <Menu className="shadow-md rounded bg-base-100 text-base-content cursor-pointer overflow-hidden">
              <MenuItem
                className="px-2 py-1 hover:bg-base-200"
                onAction={onDisconnect}
              >
                {t("disconnect")}
              </MenuItem>
              <MenuItem
                className="px-2 py-1 hover:bg-base-200"
                onAction={() => setShowSettingsReset(true)}
              >
                {t("restoreStockSettings")}
              </MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>
        <Tooltip label={t("firmwareUpdate")}>
          <Button
            className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300 disabled:opacity-50"
            isDisabled={!connectedDeviceLabel}
            onPress={onOpenFirmwareUpdate}
          >
            <Download
              className="inline-block w-4 mx-1"
              aria-label={t("firmwareUpdate")}
            />
          </Button>
        </Tooltip>
        <LanguagePicker />
      </div>
      <GenericModal ref={showSettingsRef} className="max-w-[50vw]">
        <h2 className="my-2 text-lg">{t("restoreStockSettingsTitle")}</h2>
        <div>
          <p>{t("restoreStockSettingsDesc")}</p>
          <p>{t("continueQuestion")}</p>
          <div className="flex justify-end my-2 gap-3">
            <Button
              className="rounded bg-base-200 hover:bg-base-300 px-3 py-2"
              onPress={() => setShowSettingsReset(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              className="rounded bg-base-200 hover:bg-base-300 px-3 py-2"
              onPress={() => {
                setShowSettingsReset(false);
                onResetSettings?.();
              }}
            >
              {t("restoreStockSettings")}
            </Button>
          </div>
        </div>
      </GenericModal>
      <div className="flex justify-end gap-1 px-2">
        {onUndo && (
          <Tooltip label={t("undo")}>
            <Button
              className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300 disabled:opacity-50"
              isDisabled={!canUndo}
              onPress={onUndo}
            >
              <Undo2 className="inline-block w-4 mx-1" aria-label={t("undo")} />
            </Button>
          </Tooltip>
        )}

        {onRedo && (
          <Tooltip label={t("redo")}>
            <Button
              className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300 disabled:opacity-50"
              isDisabled={!canRedo}
              onPress={onRedo}
            >
              <Redo2 className="inline-block w-4 mx-1" aria-label={t("redo")} />
            </Button>
          </Tooltip>
        )}
        <Tooltip label={t("save")}>
          <Button
            className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300 disabled:opacity-50"
            isDisabled={!unsaved}
            onPress={onSave}
          >
            <Save className="inline-block w-4 mx-1" aria-label={t("save")} />
          </Button>
        </Tooltip>
        <Tooltip label={t("discard")}>
          <Button
            className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300 disabled:opacity-50"
            onPress={onDiscard}
            isDisabled={!unsaved}
          >
            <Trash2 className="inline-block w-4 mx-1" aria-label={t("discard")} />
          </Button>
        </Tooltip>
      </div>
    </header>
  );
};
