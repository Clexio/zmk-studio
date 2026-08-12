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
      [...behaviors].sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      ),
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
