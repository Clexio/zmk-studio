import { useMemo } from "react";
import { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import {
  hid_usage_get_label,
  hid_usage_page_get_ids,
} from "../hid-usages";

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

function decodeKeycode(keycode: number): Decoded {
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

function encodeKeycode(
  kind: EventKind,
  keyId: number,
  mods: number
): number {
  const m = kind === "key" ? mods & 0xff : 0;
  const page = kind === "key" ? KEY_PAGE : CONSUMER_PAGE;
  return (m << 24) | (page << 16) | (keyId & 0xffff);
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

function KeyDropdown({
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

  return (
    <select
      className="h-8 rounded px-2 min-w-36 bg-base-100 text-base-content"
      value={keyId}
      onChange={(e) => onChange(parseInt(e.target.value))}
    >
      {options.map((k) => (
        <option key={`${k.page}-${k.id}`} value={k.id}>
          {k.name}
        </option>
      ))}
    </select>
  );
}

function ModifierArea({
  mods,
  onModsChange,
}: {
  mods: number;
  onModsChange: (mods: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {MODIFIER_OPTIONS.map((m) => (
        <label key={m.flag} className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={(mods & m.flag) !== 0}
            onChange={(e) => {
              const next = e.target.checked
                ? mods | m.flag
                : mods & ~m.flag;
              onModsChange(next);
            }}
          />
          {m.name}
        </label>
      ))}
    </div>
  );
}

/**
 * 左旋/右旋事件选择器：param 直接就是 ZMK keycode
 */
export function EventValuePicker({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: number;
  onValueChange: (param: number) => void;
}) {
  const decoded = decodeKeycode(value);
  const kind = decoded.kind;
  const mods = kind === "key" ? decoded.mods : 0;
  const keyId =
    kind === "consumer" ? DEFAULT_CONSUMER_ID : decoded.keyId || DEFAULT_KEY_ID;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs">{label}</label>
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
          <option value="">选择行为</option>
          <option value="key">按键</option>
          <option value="consumer">媒体键</option>
        </select>
        {kind && (
          <KeyDropdown
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
  const isKp =
    kpBehaviorId !== undefined && binding.behaviorId === kpBehaviorId;
  const decoded = isKp ? decodeKeycode(binding.param1) : undefined;
  const kind = decoded?.kind;
  const mods = kind === "key" ? decoded!.mods : 0;
  const keyId =
    kind === "consumer"
      ? DEFAULT_CONSUMER_ID
      : decoded?.keyId || DEFAULT_KEY_ID;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs">{label}</label>
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
          {!isKp && <option value="keep">保持当前行为</option>}
          <option value="">选择行为</option>
          <option value="key">按键</option>
          <option value="consumer">媒体键</option>
        </select>
        {kind && (
          <KeyDropdown
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
