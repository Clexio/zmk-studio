import {
  PhysicalLayout,
  Keymap as KeymapMsg,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import {
  LayoutZoom,
  PhysicalLayout as PhysicalLayoutComp,
} from "./PhysicalLayout";
import { HidUsageLabel } from "./HidUsageLabel";
import { useI18n } from "../i18n";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

export interface KeymapProps {
  layout: PhysicalLayout;
  keymap: KeymapMsg;
  behaviors: BehaviorMap;
  scale: LayoutZoom;
  selectedLayerIndex: number;
  selectedKeyPosition: number | undefined;
  knobPositions?: number[];
  kpBehaviorId?: number;
  onKeyPositionClicked: (keyPosition: number) => void;
}

export const Keymap = ({
  layout,
  keymap,
  behaviors,
  scale,
  selectedLayerIndex,
  selectedKeyPosition,
  knobPositions,
  kpBehaviorId,
  onKeyPositionClicked,
}: KeymapProps) => {
  const { t } = useI18n();
  if (!keymap.layers[selectedLayerIndex]) {
    return <></>;
  }

  const positions = layout.keys.map((k, i) => {
    if (i >= keymap.layers[selectedLayerIndex].bindings.length) {
      return {
        id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
        header: t("unknown"),
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        children: <span></span>,
      };
    }

    const keyName =
      keymap.layers[selectedLayerIndex].keyNames?.find(
        (kn) => kn.keyPosition === i
      )?.name || undefined;
    const isKnob = knobPositions?.includes(i) || false;
    const binding = keymap.layers[selectedLayerIndex].bindings[i];
    const isKp = kpBehaviorId !== undefined && binding.behaviorId === kpBehaviorId;
    let header: React.ReactNode =
      behaviors[binding.behaviorId]?.displayName || t("unknown");
    if (isKp) {
      header = <HidUsageLabel hid_usage={binding.param1} />;
    }

    return {
      id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
      header,
      knob: isKnob,
      x: k.x / 100.0,
      y: k.y / 100.0,
      width: k.width / 100,
      height: k.height / 100.0,
      r: (k.r || 0) / 100.0,
      rx: (k.rx || 0) / 100.0,
      ry: (k.ry || 0) / 100.0,
      children: (
        <div className="flex items-center justify-center">
          {keyName ? (
            <span className="text-xs font-semibold leading-none text-center">
              {keyName}
            </span>
          ) : null}
        </div>
      ),
    };
  });

  return (
    <PhysicalLayoutComp
      positions={positions}
      oneU={48}
      hoverZoom={true}
      zoom={scale}
      selectedPosition={selectedKeyPosition}
      onPositionClicked={onKeyPositionClicked}
    />
  );
};
