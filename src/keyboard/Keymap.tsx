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

    return {
      id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
      header:
        behaviors[keymap.layers[selectedLayerIndex].bindings[i].behaviorId]
          ?.displayName || t("unknown"),
      x: k.x / 100.0,
      y: k.y / 100.0,
      width: k.width / 100,
      height: k.height / 100.0,
      r: (k.r || 0) / 100.0,
      rx: (k.rx || 0) / 100.0,
      ry: (k.ry || 0) / 100.0,
      children: (
        <div className="flex flex-col items-center justify-center gap-0.5">
          {keyName ? (
            <span className="text-sm font-semibold leading-none">{keyName}</span>
          ) : (
            <HidUsageLabel
              hid_usage={keymap.layers[selectedLayerIndex].bindings[i].param1}
            />
          )}
          {isKnob && (
            <span className="text-[10px] leading-none px-1 rounded bg-primary/20 text-primary">
              {t("knobBadge")}
            </span>
          )}
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
