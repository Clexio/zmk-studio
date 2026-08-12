import { useEffect, useMemo, useState } from "react";

import {
  GetBehaviorDetailsResponse,
  BehaviorBindingParametersSet,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { BehaviorParametersPicker } from "./BehaviorParametersPicker";
import { validateValue } from "./parameters";
import { useI18n } from "../i18n";
import {
  GroupedKeyDropdown,
  ModifierArea,
  decodeKeycode,
  encodeKeycode,
  EventKind,
} from "./EventBindingPicker";

/* 不应出现在普通按键行为下拉里的行为：
 *  - 传感器/旋钮行为（只能分配给旋钮旋转）
 *  - 宏内部子行为（不能直接绑定到按键） */
const HIDDEN_BEHAVIORS = new Set([
  /* 旋钮/传感器行为（设备名 + 显示名） */
  "scroll_encoder",
  "scroll_encoder_tk",
  "volume_encoder",
  "brightness_encoder",
  "paged_encoder",
  "enc_cam_mode",
  "mouse_encoder",
  "u_d_encoder",
  "l_r_encoder",
  "enc_custom",
  "音量",
  "滚动",
  "抖音滚动",
  "亮度",
  "翻页",
  "相机拖动",
  "鼠标移动",
  "上下方向",
  "左右方向",
  "自定义旋钮",
  /* 宏内部子行为 */
  "macro_tap",
  "macro_press",
  "macro_release",
  "macro_tap_time",
  "macro_wait_time",
  "macro_pause_for_release",
  "macro_param_1to1",
  "macro_param_1to2",
  "macro_param_2to1",
  "macro_param_2to2",
]);

/* 原生行为设备名 → 中文显示名（客户端翻译，便于用户选择） */
const BEHAVIOR_NAME_ZH: Record<string, string> = {
  kp: "按键",
  mkp: "鼠标键",
  mmv: "鼠标移动",
  msc: "鼠标滚动",
  to: "切换层",
  mo: "临时层",
  tog: "切换层开关",
  lt: "层+按键",
  mt: "修饰+按键",
  kt: "按键开关",
  trans: "透明（透传）",
  none: "无",
  macro: "宏",
  bt: "蓝牙",
  caps_word: "单词大写",
  key_repeat: "重复按键",
  sk: "粘滞键",
  sl: "粘滞层",
  sys_reset: "重置",
  reset: "重置",
  bootloader: "进入刷机模式",
  soft_off: "软关机",
  studio_unlock: "Studio 解锁",
  gresc: "Esc/反引号",
  rgb_ug: "RGB 背光",
  rg2: "RGB 背光",
  bl: "键盘背光",
  ext_power: "外部电源",
  out: "输出切换",
  td: "连击",
  /* 键盘自定义行为（原生，来自你的 keymap） */
  win_l: "Win+L",
  alt_w_f: "Alt+W+F",
  td_power: "电源/锁屏",
  td_u_z: "上移/Z",
  td_d_x: "下移/X",
  td_l_c: "左移/C",
  td_r_g: "右移/G",
  td_camera: "快门/音量减",
  td_p_mute: "播放/静音",
  td_lm_mute: "左键/静音",
  td_move_u_video: "上移/拖视频",
  td_move_d_photo: "下移/拖照片",
  cam_to_video: "相机切视频",
  cam_to_photo: "相机切拍照",
  drag_right_back: "向右拖动",
  drag_left_back: "向左拖动",
};

export interface BehaviorBindingPickerProps {
  binding: BehaviorBinding;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  kpBehaviorId?: number;
  hideLabel?: boolean;
  onBindingChanged: (binding: BehaviorBinding) => void;
}

function validateBinding(
  metadata: BehaviorBindingParametersSet[],
  layerIds: number[],
  param1?: number,
  param2?: number
): boolean {
  if (
    (param1 === undefined || param1 === 0) &&
    metadata.every((s) => !s.param1 || s.param1.length === 0)
  ) {
    return true;
  }

  let matchingSet = metadata.find((s) =>
    validateValue(layerIds, param1, s.param1)
  );

  if (!matchingSet) {
    return false;
  }

  return validateValue(layerIds, param2, matchingSet.param2);
}

export const BehaviorBindingPicker = ({
  binding,
  layers,
  behaviors,
  kpBehaviorId,
  hideLabel,
  onBindingChanged,
}: BehaviorBindingPickerProps) => {
  const { t } = useI18n();
  const [behaviorId, setBehaviorId] = useState(binding.behaviorId);
  const [param1, setParam1] = useState<number | undefined>(binding.param1);
  const [param2, setParam2] = useState<number | undefined>(binding.param2);

  const metadata = useMemo(
    () => behaviors.find((b) => b.id == behaviorId)?.metadata,
    [behaviorId, behaviors]
  );

  const sortedBehaviors = useMemo(
    () =>
      behaviors
        .filter(
          (b) =>
            !HIDDEN_BEHAVIORS.has(b.displayName) &&
            !HIDDEN_BEHAVIORS.has(b.displayName.toLowerCase())
        )
        .map((b) => ({
          ...b,
          displayName: BEHAVIOR_NAME_ZH[b.displayName] ?? b.displayName,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [behaviors]
  );

  const isKp = kpBehaviorId !== undefined && behaviorId === kpBehaviorId;
  const decoded = decodeKeycode(param1 || 0);
  const kind: EventKind = decoded.kind ?? "key";
  const keyId = decoded.keyId || 0x04;
  const mods = kind === "key" ? decoded.mods : 0;

  useEffect(() => {
    if (
      binding.behaviorId === behaviorId &&
      binding.param1 === param1 &&
      binding.param2 === param2
    ) {
      return;
    }

    if (!metadata) {
      console.error(
        "Can't find metadata for the selected behaviorId",
        behaviorId
      );
      return;
    }

    if (
      validateBinding(
        metadata,
        layers.map(({ id }) => id),
        param1,
        param2
      )
    ) {
      onBindingChanged({
        behaviorId,
        param1: param1 || 0,
        param2: param2 || 0,
      });
    }
  }, [behaviorId, param1, param2]);

  useEffect(() => {
    setBehaviorId(binding.behaviorId);
    setParam1(binding.param1);
    setParam2(binding.param2);
  }, [binding]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {!hideLabel && <label>{t("behavior")}</label>}
        <select
          value={behaviorId}
          className="h-8 rounded px-2 min-w-36 bg-base-100 text-base-content"
          onChange={(e) => {
            const id = parseInt(e.target.value);
            setBehaviorId(id);
            setParam1(
              kpBehaviorId !== undefined && id === kpBehaviorId
                ? encodeKeycode("key", 0x04, 0)
                : 0
            );
            setParam2(0);
          }}
        >
          {sortedBehaviors.map((b) => (
            <option key={b.id} value={b.id}>
              {b.displayName}
            </option>
          ))}
        </select>
        {isKp && (
          <>
            <GroupedKeyDropdown
              kind={kind}
              keyId={keyId}
              onChange={(k, id) => setParam1(encodeKeycode(k, id, mods))}
            />
            {kind === "key" && (
              <ModifierArea
                mods={mods}
                onModsChange={(m) =>
                  setParam1(encodeKeycode("key", keyId, m))
                }
              />
            )}
          </>
        )}
      </div>
      {!isKp && metadata && (
        <BehaviorParametersPicker
          metadata={metadata}
          param1={param1}
          param2={param2}
          layers={layers}
          onParam1Changed={setParam1}
          onParam2Changed={setParam2}
        />
      )}
    </div>
  );
};
