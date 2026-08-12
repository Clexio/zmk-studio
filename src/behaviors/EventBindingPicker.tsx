import { useMemo } from "react";
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

interface Command {
  name: string;
  page: number;
  keyId: number;
}

const COMMANDS: Command[] = [
  { name: "播放/暂停", page: CONSUMER_PAGE, keyId: 0xcd },
  { name: "上一曲", page: CONSUMER_PAGE, keyId: 0xb6 },
  { name: "下一曲", page: CONSUMER_PAGE, keyId: 0xb5 },
  { name: "静音", page: CONSUMER_PAGE, keyId: 0xe0 },
  { name: "音量加", page: CONSUMER_PAGE, keyId: 0xe9 },
  { name: "音量减", page: CONSUMER_PAGE, keyId: 0xea },
  { name: "亮度加", page: CONSUMER_PAGE, keyId: 0x6f },
  { name: "亮度减", page: CONSUMER_PAGE, keyId: 0x70 },
  { name: "上页", page: KEY_PAGE, keyId: 0x4b },
  { name: "下页", page: KEY_PAGE, keyId: 0x4e },
  { name: "上方向", page: KEY_PAGE, keyId: 0x52 },
  { name: "下方向", page: KEY_PAGE, keyId: 0x51 },
  { name: "左方向", page: KEY_PAGE, keyId: 0x50 },
  { name: "右方向", page: KEY_PAGE, keyId: 0x4f },
  { name: "回车", page: KEY_PAGE, keyId: 0x28 },
  { name: "退格", page: KEY_PAGE, keyId: 0x2a },
  { name: "删除", page: KEY_PAGE, keyId: 0x4c },
  { name: "空格", page: KEY_PAGE, keyId: 0x2c },
  { name: "Tab", page: KEY_PAGE, keyId: 0x2b },
  { name: "Esc", page: KEY_PAGE, keyId: 0x29 },
];

const CUSTOM_COMMAND = "custom-combo";

function keycodeOf(page: number, keyId: number, mods: number): number {
  const m = page === KEY_PAGE ? mods & 0x0f : 0;
  return (m << 24) | (page << 16) | (keyId & 0xffff);
}

function matchCommand(keycode: number): Command | undefined {
  const mods = (keycode >>> 24) & 0xff;
  const page = (keycode >>> 16) & 0xff;
  const keyId = keycode & 0xffff;
  if (mods !== 0) {
    return undefined;
  }
  return COMMANDS.find((c) => c.page === page && c.keyId === keyId);
}

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
          onStateChange({
            ...state,
            page,
            keyId: id,
            mods: page === KEY_PAGE ? state.mods : 0,
          });
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

/**
 * 左旋/右旋事件选择器：事件编码为 param（自定义旋钮行为）
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
  const isCombo = (value & COMBO_FLAG) !== 0;
  const keycode = isCombo ? value & 0x7fffffff : 0;
  const command = isCombo ? matchCommand(keycode) : undefined;
  const selected = isCombo ? (command ? command.name : CUSTOM_COMMAND) : "";

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded px-2 min-w-36 bg-base-100 text-base-content"
          value={selected}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CUSTOM_COMMAND) {
              onValueChange(COMBO_FLAG | keycodeOf(KEY_PAGE, 0x04, 0));
            } else {
              const cmd = COMMANDS.find((c) => c.name === v);
              if (cmd) {
                onValueChange(
                  COMBO_FLAG | keycodeOf(cmd.page, cmd.keyId, 0)
                );
              }
            }
          }}
        >
          <option value="">选择事件</option>
          {COMMANDS.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
          <option value={CUSTOM_COMMAND}>自定义组合键</option>
        </select>
        {selected === CUSTOM_COMMAND && (
          <ComboArea
            state={isCombo ? decodeKeycode(keycode) : DEFAULT_COMBO}
            onStateChange={(s) =>
              onValueChange(COMBO_FLAG | keycodeOf(s.page, s.keyId, s.mods))
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
  const selectedIsKp =
    kpBehaviorId !== undefined && binding.behaviorId === kpBehaviorId;
  const command = selectedIsKp
    ? matchCommand(binding.param1)
    : undefined;
  const selected = selectedIsKp
    ? command
      ? command.name
      : CUSTOM_COMMAND
    : "-1";

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded px-2 min-w-36 bg-base-100 text-base-content"
          value={selected}
          onChange={(e) => {
            const v = e.target.value;
            if (kpBehaviorId === undefined) {
              return;
            }
            if (v === CUSTOM_COMMAND) {
              onBindingChange({
                behaviorId: kpBehaviorId,
                param1: keycodeOf(KEY_PAGE, 0x04, 0),
                param2: 0,
              });
            } else {
              const cmd = COMMANDS.find((c) => c.name === v);
              if (cmd) {
                onBindingChange({
                  behaviorId: kpBehaviorId,
                  param1: keycodeOf(cmd.page, cmd.keyId, 0),
                  param2: 0,
                });
              }
            }
          }}
        >
          {selected === "-1" && <option value="-1">保持当前行为</option>}
          {COMMANDS.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
          <option value={CUSTOM_COMMAND}>自定义组合键</option>
        </select>
        {selected === CUSTOM_COMMAND && selectedIsKp && (
          <ComboArea
            state={decodeKeycode(binding.param1)}
            onStateChange={(s) =>
              onBindingChange({
                behaviorId: kpBehaviorId!,
                param1: keycodeOf(s.page, s.keyId, s.mods),
                param2: 0,
              })
            }
          />
        )}
      </div>
    </div>
  );
}
