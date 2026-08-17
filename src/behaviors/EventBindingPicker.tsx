import { useMemo } from "react";
import {
  Button,
  Checkbox,
  CheckboxGroup,
  ComboBox,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
} from "react-aria-components";
import { ChevronDown } from "lucide-react";
import { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import {
  hid_usage_get_label,
  hid_usage_page_get_ids,
} from "../hid-usages";
import { useI18n } from "../i18n";

const KEY_PAGE = 7;
const CONSUMER_PAGE = 12;

export const MODIFIER_OPTIONS = [
  { flag: 0x01, name: "L Ctrl" },
  { flag: 0x02, name: "L Shift" },
  { flag: 0x04, name: "L Alt" },
  { flag: 0x08, name: "L GUI" },
  { flag: 0x10, name: "R Ctrl" },
  { flag: 0x20, name: "R Shift" },
  { flag: 0x40, name: "R Alt" },
  { flag: 0x80, name: "R GUI" },
] as const;

export type EventKind = "key" | "consumer";

interface Decoded {
  kind?: EventKind;
  page: number;
  keyId: number;
  mods: number;
}

export function decodeKeycode(keycode: number): Decoded {
  const mods = (keycode >>> 24) & 0xff;
  const page = (keycode >>> 16) & 0xff;
  const keyId = keycode & 0xffff;
  if (page === KEY_PAGE) {
    return { kind: "key", page, keyId, mods };
  }
  if (page === CONSUMER_PAGE) {
    return { kind: "consumer", page, keyId, mods: 0 };
  }
  return { page, keyId, mods };
}

export function encodeKeycode(
  kind: EventKind,
  keyId: number,
  mods: number
): number {
  const m = kind === "key" ? mods & 0xff : 0;
  const page = kind === "key" ? KEY_PAGE : CONSUMER_PAGE;
  return (m << 24) | (page << 16) | (keyId & 0xffff);
}

// 固件出厂旋钮行为对应的左旋/右旋默认键值（按行为设备名/显示名匹配）
const SENSOR_DEFAULT_KEYS: Record<string, { left: number; right: number }> = {
  volume_encoder: {
    left: encodeKeycode("consumer", 0xea, 0), // 音量-（固件 cw=param1=左旋）
    right: encodeKeycode("consumer", 0xe9, 0), // 音量+
  },
  brightness_encoder: {
    left: encodeKeycode("consumer", 0x70, 0), // 亮度-
    right: encodeKeycode("consumer", 0x6f, 0), // 亮度+
  },
  paged_encoder: {
    left: encodeKeycode("key", 0x4e, 0), // PageDown
    right: encodeKeycode("key", 0x4b, 0), // PageUp
  },
  u_d_encoder: {
    left: encodeKeycode("key", 0x52, 0), // Up
    right: encodeKeycode("key", 0x51, 0), // Down
  },
  l_r_encoder: {
    left: encodeKeycode("key", 0x50, 0), // Left
    right: encodeKeycode("key", 0x4f, 0), // Right
  },
  "音量": {
    left: encodeKeycode("consumer", 0xea, 0),
    right: encodeKeycode("consumer", 0xe9, 0),
  },
  "亮度": {
    left: encodeKeycode("consumer", 0x70, 0),
    right: encodeKeycode("consumer", 0x6f, 0),
  },
  "翻页": {
    left: encodeKeycode("key", 0x4e, 0),
    right: encodeKeycode("key", 0x4b, 0),
  },
  "上下方向": {
    left: encodeKeycode("key", 0x52, 0),
    right: encodeKeycode("key", 0x51, 0),
  },
  "左右方向": {
    left: encodeKeycode("key", 0x50, 0),
    right: encodeKeycode("key", 0x4f, 0),
  },
};

export function sensorDefaultKeycode(
  behavior: GetBehaviorDetailsResponse | undefined,
  side: "left" | "right"
): number | undefined {
  if (!behavior) {
    return undefined;
  }
  const entry = SENSOR_DEFAULT_KEYS[behavior.displayName];
  return entry?.[side];
}

const DEFAULT_KEY_ID = 0x04; // A
const DEFAULT_CONSUMER_ID = 0xcd; // 播放/暂停

function useKeyOptions() {
  return useMemo(() => {
    const keys = (hid_usage_page_get_ids(KEY_PAGE)?.UsageIds || [])
      .filter(
        (u) =>
          u.Id >= 4 &&
          u.Id <= 0xdf &&
          !(u.Id >= 0xe0 && u.Id <= 0xe7)
      )
      .map((u) => ({
        page: KEY_PAGE,
        id: u.Id,
        name: hid_usage_get_label(KEY_PAGE, u.Id) || u.Name,
      }));
    const consumer = (hid_usage_page_get_ids(CONSUMER_PAGE)?.UsageIds || [])
      .filter((u) => u.Id > 0)
      .map((u) => ({
        page: CONSUMER_PAGE,
        id: u.Id,
        name: hid_usage_get_label(CONSUMER_PAGE, u.Id) || u.Name,
      }));
    return { keys, consumer };
  }, []);
}

export function SearchableKeyDropdown({
  kind,
  keyId,
  onChange,
}: {
  kind: EventKind;
  keyId: number;
  onChange: (keyId: number) => void;
}) {
  const { keys, consumer } = useKeyOptions();
  const options = kind === "key" ? keys : consumer;
  const { t } = useI18n();

  return (
    <ComboBox
      selectedKey={keyId}
      onSelectionChange={(id) => {
        if (typeof id === "number") {
          onChange(id);
        }
      }}
      aria-label="key"
      className="flex items-center"
    >
      <div className="flex">
        <Input
          className="p-1 h-8 w-40 rounded-l bg-base-100 text-base-content"
          placeholder={kind === "key" ? t("searchKey") : t("searchMedia")}
        />
        <Button className="rounded-r bg-primary text-primary-content w-8 h-8 flex justify-center items-center">
          <ChevronDown className="size-4" />
        </Button>
      </div>
      <Popover className="w-[var(--trigger-width)] max-h-4 shadow-md text-base-content rounded border-base-content bg-base-100">
        <ListBox
          items={options}
          className="block max-h-[30vh] overflow-auto p-1"
          selectionMode="single"
        >
          {(item) => (
            <ListBoxItem
              id={item.id}
              textValue={item.name}
              className="px-2 py-1 cursor-pointer hover:bg-base-300 aria-selected:bg-primary aria-selected:text-primary-content"
            >
              {item.name}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

export function ModifierArea({
  mods,
  onModsChange,
}: {
  mods: number;
  onModsChange: (mods: number) => void;
}) {
  return (
    <CheckboxGroup
      aria-label="modifiers"
      className="grid grid-flow-col gap-x-px auto-cols-[minmax(min-content,1fr)] content-stretch divide-x rounded-md overflow-hidden"
      value={MODIFIER_OPTIONS.filter((m) => mods & m.flag).map((m) =>
        String(m.flag)
      )}
      onChange={(keys) => {
        let next = 0;
        for (const k of keys) {
          next |= parseInt(k);
        }
        onModsChange(next);
      }}
    >
      {MODIFIER_OPTIONS.map((m) => (
        <Checkbox
          key={m.flag}
          value={String(m.flag)}
          className="text-nowrap cursor-pointer grid h-8 px-2.5 content-center justify-center bg-base-300 hover:bg-base-100 rac-selected:bg-primary rac-selected:text-primary-content text-sm"
        >
          {m.name}
        </Checkbox>
      ))}
    </CheckboxGroup>
  );
}

export function GroupedKeyDropdown({
  kind,
  keyId,
  onChange,
}: {
  kind: EventKind;
  keyId: number;
  onChange: (kind: EventKind, keyId: number) => void;
}) {
  const { keys, consumer } = useKeyOptions();
  const { t } = useI18n();
  const items = [
    ...keys.map((k) => ({ ...k, group: "key" as EventKind })),
    ...consumer.map((k) => ({ ...k, group: "consumer" as EventKind })),
  ];

  return (
    <ComboBox
      selectedKey={keyId}
      onSelectionChange={(id) => {
        if (typeof id === "number") {
          const item = items.find((i) => i.id === id);
          onChange(item?.group ?? kind, id);
        }
      }}
      aria-label="key"
      className="flex items-center"
    >
      <div className="flex">
        <Input
          className="p-1 h-8 w-40 rounded-l bg-base-100 text-base-content"
          placeholder={t("searchKeyMedia")}
        />
        <Button className="rounded-r bg-primary text-primary-content w-8 h-8 flex justify-center items-center">
          <ChevronDown className="size-4" />
        </Button>
      </div>
      <Popover className="w-[var(--trigger-width)] max-h-4 shadow-md text-base-content rounded border-base-content bg-base-100">
        <ListBox
          items={items}
          className="block max-h-[30vh] overflow-auto p-1"
          selectionMode="single"
        >
          {(item) => (
            <ListBoxItem
              id={item.id}
              textValue={item.name}
              className="px-2 py-1 cursor-pointer hover:bg-base-300 aria-selected:bg-primary aria-selected:text-primary-content"
            >
              {item.name}
              {item.group === "consumer" && (
                <span className="ml-1 text-xs opacity-50">
                  {t("eventKindConsumer")}
                </span>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

/**
 * 左旋/右旋事件选择器：param 直接就是 ZMK keycode
 */
export function EventValuePicker({
  label,
  value,
  fallbackKeycode,
  onValueChange,
}: {
  label: string;
  value: number;
  fallbackKeycode?: number;
  onValueChange: (param: number) => void;
}) {
  const { t } = useI18n();
  const effectiveValue = value || fallbackKeycode || 0;
  const decoded = decodeKeycode(effectiveValue);
  const kind = decoded.kind;
  const mods = kind === "key" ? decoded.mods : 0;
  const keyId =
    decoded.keyId ||
    (kind === "consumer" ? DEFAULT_CONSUMER_ID : DEFAULT_KEY_ID);
  const isDefault = !value && fallbackKeycode !== undefined;
  const noFallback = fallbackKeycode === undefined;
  const keyLabel =
    kind !== undefined && keyId
      ? hid_usage_get_label(kind === "consumer" ? CONSUMER_PAGE : KEY_PAGE, keyId) ||
        undefined
      : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded px-2 min-w-32 bg-base-100 text-base-content"
          value={kind ?? ""}
          onChange={(e) => {
            const v = e.target.value as EventKind | "";
            if (v === "key") {
              onValueChange(encodeKeycode("key", DEFAULT_KEY_ID, 0));
            } else if (v === "consumer") {
              onValueChange(encodeKeycode("consumer", DEFAULT_CONSUMER_ID, 0));
            }
          }}
        >
          <option value="">{noFallback ? t("noEvent") : t("selectBehavior")}</option>
          <option value="key">{t("eventKindKey")}</option>
          <option value="consumer">{t("eventKindConsumer")}</option>
        </select>
        {kind && (
          <SearchableKeyDropdown
            kind={kind}
            keyId={keyId}
            onChange={(id) =>
              onValueChange(encodeKeycode(kind, id, mods))
            }
          />
        )}
        {kind === "key" && (
          <ModifierArea
            mods={mods}
            onModsChange={(m) =>
              onValueChange(encodeKeycode("key", keyId, m))
            }
          />
        )}
      </div>
      {isDefault && keyLabel && (
        <span className="text-xs opacity-60">
          {t("factoryDefault")}: {keyLabel}
        </span>
      )}
    </div>
  );
}

/**
 * 按钮（旋钮按下）事件选择器：走标准键位绑定
 */
export function KeyEventPicker({
  label,
  binding,
  kpBehaviorId,
  onBindingChange,
}: {
  label: string;
  binding: BehaviorBinding;
  kpBehaviorId?: number;
  onBindingChange: (binding: BehaviorBinding) => void;
}) {
  const { t } = useI18n();
  const isKp =
    kpBehaviorId !== undefined && binding.behaviorId === kpBehaviorId;
  const decoded = isKp ? decodeKeycode(binding.param1) : undefined;
  const kind = decoded?.kind;
  const mods = kind === "key" ? decoded!.mods : 0;
  const keyId =
    decoded?.keyId ||
    (kind === "consumer" ? DEFAULT_CONSUMER_ID : DEFAULT_KEY_ID);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded px-2 min-w-32 bg-base-100 text-base-content"
          value={isKp ? (kind ?? "") : "keep"}
          onChange={(e) => {
            const v = e.target.value;
            if (kpBehaviorId === undefined) {
              return;
            }
            if (v === "key") {
              onBindingChange({
                behaviorId: kpBehaviorId,
                param1: encodeKeycode("key", DEFAULT_KEY_ID, 0),
                param2: 0,
              });
            } else if (v === "consumer") {
              onBindingChange({
                behaviorId: kpBehaviorId,
                param1: encodeKeycode("consumer", DEFAULT_CONSUMER_ID, 0),
                param2: 0,
              });
            }
          }}
        >
          {!isKp && <option value="keep">{t("keepCurrentBehavior")}</option>}
          <option value="">{t("selectBehavior")}</option>
          <option value="key">{t("eventKindKey")}</option>
          <option value="consumer">{t("eventKindConsumer")}</option>
        </select>
        {kind && (
          <SearchableKeyDropdown
            kind={kind}
            keyId={keyId}
            onChange={(id) =>
              onBindingChange({
                behaviorId: kpBehaviorId!,
                param1: encodeKeycode(kind, id, mods),
                param2: 0,
              })
            }
          />
        )}
        {kind === "key" && (
          <ModifierArea
            mods={mods}
            onModsChange={(m) =>
              onBindingChange({
                behaviorId: kpBehaviorId!,
                param1: encodeKeycode("key", keyId, m),
                param2: 0,
              })
            }
          />
        )}
      </div>
    </div>
  );
}
