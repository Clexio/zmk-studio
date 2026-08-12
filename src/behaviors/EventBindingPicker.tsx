import { useMemo } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import {
  hid_usage_get_label,
  hid_usage_page_get_ids,
} from "../hid-usages";

const KEY_PAGE = 7;
const CONSUMER_PAGE = 12;
const COMBO_FLAG = 0x80000000;
const MOD_LCTL = 0x01;
const MOD_LSFT = 0x02;
const MOD_LALT = 0x04;
const MOD_LGUI = 0x08;

export const MODIFIER_OPTIONS = [
  { flag: MOD_LCTL, name: "Ctrl" },
  { flag: MOD_LSFT, name: "Shift" },
  { flag: MOD_LALT, name: "Alt" },
  { flag: MOD_LGUI, name: "Win" },
] as const;

interface ComboState {
  keyId: number;
  page: number;
  mods: number;
}

const DEFAULT_COMBO: ComboState = { keyId: 0x04, page: KEY_PAGE, mods: 0 };

function decodeKeycode(keycode: number): ComboState {
  const mods = (keycode >>> 24) & 0xff;
  const page = (keycode >>> 16) & 0xff;
  const keyId = keycode & 0xffff;
  if (page === KEY_PAGE || page === CONSUMER_PAGE) {
    return { keyId, page, mods };
  }
  return DEFAULT_COMBO;
}

function encodeKeycode(state: ComboState): number {
  const mods =
    state.page === KEY_PAGE ? state.mods & 0x0f : 0;
  return (mods << 24) | (state.page << 16) | (state.keyId & 0xffff);
}

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

function ComboArea({
  state,
  onStateChange,
}: {
  state: ComboState;
  onStateChange: (s: ComboState) => void;
}) {
  const { keys, consumer } = useKeyOptions();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {MODIFIER_OPTIONS.map((m) => (
        <label key={m.flag} className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={(state.mods & m.flag) !== 0}
            disabled={state.page !== KEY_PAGE}
            onChange={(e) => {
              const mods = e.target.checked
                ? state.mods | m.flag
                : state.mods & ~m.flag;
              onStateChange({ ...state, mods });
            }}
          />
          {m.name}
        </label>
      ))}
      <select
        className="h-8 rounded px-2 min-w-32 bg-base-100 text-base-content"
        value={`${state.page}-${state.keyId}`}
        onChange={(e) => {
          const [page, id] = e.target.value.split("-").map(Number);
          onStateChange({ ...state, page, keyId: id, mods: page === KEY_PAGE ? state.mods : 0 });
        }}
      >
        <optgroup label="Keyboard">
          {keys.map((k) => (
            <option key={`${k.page}-${k.id}`} value={`${k.page}-${k.id}`}>
              {k.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Consumer">
          {consumer.map((k) => (
            <option key={`${k.page}-${k.id}`} value={`${k.page}-${k.id}`}>
              {k.name}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

function sortBehaviors(behaviors: GetBehaviorDetailsResponse[]) {
  return [...behaviors].sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
}

/**
 * 左旋/右旋事件选择器：事件编码为 param（自定义旋钮行为）
 */
export function EventValuePicker({
  label,
  value,
  behaviors,
  kpBehaviorId,
  onValueChange,
}: {
  label: string;
  value: number;
  behaviors: GetBehaviorDetailsResponse[];
  kpBehaviorId?: number;
  onValueChange: (param: number) => void;
}) {
  const sorted = useMemo(() => sortBehaviors(behaviors), [behaviors]);

  const isCombo = (value & COMBO_FLAG) !== 0;
  const behaviorId = isCombo ? kpBehaviorId : value;
  const combo = isCombo
    ? decodeKeycode(value & 0x7fffffff)
    : DEFAULT_COMBO;
  const selectedIsKp = kpBehaviorId !== undefined && behaviorId === kpBehaviorId;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded px-2 min-w-36 bg-base-100 text-base-content"
          value={behaviorId ?? ""}
          onChange={(e) => {
            const id = parseInt(e.target.value);
            if (kpBehaviorId !== undefined && id === kpBehaviorId) {
              onValueChange(
                COMBO_FLAG | encodeKeycode(DEFAULT_COMBO)
              );
            } else {
              onValueChange(id);
            }
          }}
        >
          {behaviorId === undefined && <option value="">-</option>}
          {sorted.map((b) => (
            <option key={b.id} value={b.id}>
              {b.displayName}
            </option>
          ))}
        </select>
        {selectedIsKp && (
          <ComboArea
            state={combo}
            onStateChange={(s) =>
              onValueChange(COMBO_FLAG | encodeKeycode(s))
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
  behaviors,
  kpBehaviorId,
  onBindingChange,
}: {
  label: string;
  binding: BehaviorBinding;
  behaviors: GetBehaviorDetailsResponse[];
  kpBehaviorId?: number;
  onBindingChange: (binding: BehaviorBinding) => void;
}) {
  const sorted = useMemo(() => sortBehaviors(behaviors), [behaviors]);
  const selectedIsKp = kpBehaviorId !== undefined && binding.behaviorId === kpBehaviorId;
  const combo = selectedIsKp
    ? decodeKeycode(binding.param1)
    : DEFAULT_COMBO;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded px-2 min-w-36 bg-base-100 text-base-content"
          value={binding.behaviorId}
          onChange={(e) => {
            const id = parseInt(e.target.value);
            if (kpBehaviorId !== undefined && id === kpBehaviorId) {
              onBindingChange({
                behaviorId: id,
                param1: encodeKeycode(DEFAULT_COMBO),
                param2: 0,
              });
            } else {
              onBindingChange({ behaviorId: id, param1: 0, param2: 0 });
            }
          }}
        >
          {sorted.map((b) => (
            <option key={b.id} value={b.id}>
              {b.displayName}
            </option>
          ))}
        </select>
        {selectedIsKp && (
          <ComboArea
            state={combo}
            onStateChange={(s) =>
              onBindingChange({
                behaviorId: binding.behaviorId,
                param1: encodeKeycode(s),
                param2: 0,
              })
            }
          />
        )}
      </div>
    </div>
  );
}
