import { useCallback, useEffect, useMemo, useState } from "react";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { UserCancelledError } from "@zmkfirmware/zmk-studio-ts-client/transport/errors";
import type { AvailableDevice } from "./tauri/index";
import { Bluetooth, RefreshCw } from "lucide-react";
import { Key, ListBox, ListBoxItem, Selection } from "react-aria-components";
import { useModalRef } from "./misc/useModalRef";
import { ExternalLink } from "./misc/ExternalLink";
import { GenericModal } from "./GenericModal";
import { useI18n } from "./i18n";
import type { I18nTranslate } from "./i18n";
import { useToast } from "./misc/Toast";

export type TransportFactory = {
  label: string;
  isWireless?: boolean;
  connect?: () => Promise<RpcTransport>;
  pick_and_connect?: {
    list: () => Promise<Array<AvailableDevice>>;
    connect: (dev: AvailableDevice) => Promise<RpcTransport>;
  };
};

export interface ConnectModalProps {
  open?: boolean;
  transports: TransportFactory[];
  onTransportCreated: (t: RpcTransport) => void;
}

function deviceList(
  open: boolean,
  transports: TransportFactory[],
  onTransportCreated: (t: RpcTransport) => void,
  t: I18nTranslate
) {
  const [devices, setDevices] = useState<
    Array<[TransportFactory, AvailableDevice]>
  >([]);
  const [selectedDev, setSelectedDev] = useState(new Set<Key>());
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { showToast } = useToast();

  async function LoadEm() {
    setRefreshing(true);
    setLoadError(null);
    try {
      let entries: Array<[TransportFactory, AvailableDevice]> = [];
      for (const t of transports.filter((t) => t.pick_and_connect)) {
        const devices = await t.pick_and_connect?.list();
        if (!devices) {
          continue;
        }

        entries.push(
          ...devices.map<[TransportFactory, AvailableDevice]>((d) => {
            return [t, d];
          })
        );
      }

      setDevices(entries);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLoadError(message);
      showToast(message, "error");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setSelectedDev(new Set());
    setDevices([]);

    LoadEm();
  }, [transports, open, setDevices]);

  const onRefresh = useCallback(() => {
    setSelectedDev(new Set());
    setDevices([]);

    LoadEm();
  }, [setDevices]);

  const onSelect = useCallback(
    async (keys: Selection) => {
      if (keys === "all") {
        return;
      }
      const dev = devices.find(([_t, d]) => keys.has(d.id));
      if (dev) {
        dev[0]
          .pick_and_connect!.connect(dev[1])
          .then(onTransportCreated)
          .catch((e) =>
            showToast(e instanceof Error ? e.message : String(e), "error")
          );
      }
    },
    [devices, onTransportCreated]
  );

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto]">
        <label>{t("selectDevice")}</label>
        <button
          className="flex items-center gap-1 px-2 py-1 rounded text-sm hover:bg-base-300 disabled:bg-base-100 disabled:opacity-75"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw
            className={`size-4 transition-transform ${
              refreshing ? "animate-spin" : ""
            }`}
          />
          {refreshing ? t("rescanning") : t("rescanPorts")}
        </button>
      </div>
      {!refreshing && devices.length === 0 && (
        <p className="text-xs opacity-70 pt-1">{t("noSerialFound")}</p>
      )}
      {loadError && (
        <p className="text-xs text-red-500 pt-1" role="alert">
          {loadError}
        </p>
      )}
      <ListBox
        aria-label={t("device")}
        items={devices}
        onSelectionChange={onSelect}
        selectionMode="single"
        selectedKeys={selectedDev}
        className="flex flex-col gap-1 pt-1"
      >
        {([t, d]) => (
          <ListBoxItem
            className="grid grid-cols-[1em_1fr] rounded hover:bg-base-300 cursor-pointer px-1"
            id={d.id}
            aria-label={d.label}
          >
            {t.isWireless && (
              <Bluetooth className="w-4 justify-center content-center h-full" />
            )}
            <span className="col-start-2">{d.label}</span>
          </ListBoxItem>
        )}
      </ListBox>
    </div>
  );
}

function simpleDevicePicker(
  transports: TransportFactory[],
  onTransportCreated: (t: RpcTransport) => void,
  t: I18nTranslate
) {
  const { showToast } = useToast();
  const [availableDevices, setAvailableDevices] = useState<
    AvailableDevice[] | undefined
  >(undefined);
  const [selectedTransport, setSelectedTransport] = useState<
    TransportFactory | undefined
  >(undefined);

  useEffect(() => {
    if (!selectedTransport) {
      setAvailableDevices(undefined);
      return;
    }

    let ignore = false;

    if (selectedTransport.connect) {
      async function connectTransport() {
        try {
          const transport = await selectedTransport?.connect?.();

          if (!ignore) {
            if (transport) {
              onTransportCreated(transport);
            }
            setSelectedTransport(undefined);
          }
        } catch (e) {
          if (!ignore) {
            console.error(e);
            if (e instanceof Error && !(e instanceof UserCancelledError)) {
              showToast(e.message, "error");
            }
            setSelectedTransport(undefined);
          }
        }
      }

      connectTransport();
    } else {
      async function loadAvailableDevices() {
        const devices = await selectedTransport?.pick_and_connect?.list();

        if (!ignore) {
          setAvailableDevices(devices);
        }
      }

      loadAvailableDevices();
    }

    return () => {
      ignore = true;
    };
  }, [selectedTransport]);

  let connections = transports.map((t) => (
    <li key={t.label} className="list-none">
      <button
        className="bg-base-300 hover:bg-primary hover:text-primary-content rounded px-2 py-1"
        type="button"
        onClick={async () => setSelectedTransport(t)}
      >
        {t.label}
      </button>
    </li>
  ));
  return (
    <div>
      <p className="text-sm">{t("selectConnectionType")}</p>
      <ul className="flex gap-2 pt-2">{connections}</ul>
      {selectedTransport && availableDevices && (
        <ul>
          {availableDevices.map((d) => (
            <li key={d.id} className="m-1">
              <button
                type="button"
                className="w-full text-left p-1 rounded hover:bg-base-300"
                onClick={async () => {
                  onTransportCreated(
                    await selectedTransport!.pick_and_connect!.connect(d)
                  );
                  setSelectedTransport(undefined);
                }}
              >
                {d.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function noTransportsOptionsPrompt(t: I18nTranslate) {
  return (
    <div className="m-4 flex flex-col gap-2">
      <p>
        {t("browserNotSupportedPart1")}{" "}
        <ExternalLink href="https://caniuse.com/web-serial">
          Web Serial
        </ExternalLink>{" "}
        {t("browserNotSupportedPart2")}{" "}
        <ExternalLink href="https://caniuse.com/web-bluetooth">
          Web Bluetooth
        </ExternalLink>{" "}
        {t("browserNotSupportedPart3")}
      </p>

      <div>
        <p>{t("toUseStudio")}</p>
        <ul className="list-disc list-inside">
          <li>
            {t("useSupportedBrowser")}
          </li>
          <li>
            <ExternalLink href="/download">
              {t("downloadApp")}
            </ExternalLink>
          </li>
        </ul>
      </div>
    </div>
  );
}

function connectOptions(
  transports: TransportFactory[],
  onTransportCreated: (t: RpcTransport) => void,
  t: I18nTranslate,
  open?: boolean
) {
  const useSimplePicker = useMemo(
    () => transports.every((t) => !t.pick_and_connect),
    [transports]
  );

  return useSimplePicker
    ? simpleDevicePicker(transports, onTransportCreated, t)
    : deviceList(open || false, transports, onTransportCreated, t);
}

export const ConnectModal = ({
  open,
  transports,
  onTransportCreated,
}: ConnectModalProps) => {
  const dialog = useModalRef(open || false, false, false);
  const { t } = useI18n();

  const haveTransports = useMemo(() => transports.length > 0, [transports]);

  return (
    <GenericModal ref={dialog} className="max-w-xl">
      <h1 className="text-xl">{t("welcome")}</h1>
      {haveTransports
        ? connectOptions(transports, onTransportCreated, t, open)
        : noTransportsOptionsPrompt(t)}
    </GenericModal>
  );
};
