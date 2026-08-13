/** Pure hostile-input boundary for observed mechanics trigger evidence. */

import { conformDamageResolution } from "@/lib/damage";
import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import {
  MECHANICS_TRIGGER_EVIDENCE_SCHEMA,
  type MechanicsTriggerSchemaCustomTypes,
} from "@/lib/mechanics-trigger-schema";
import {
  conformClockRef,
  conformEntityRef,
  conformMechanicId,
  conformOccurrenceRef,
} from "@/lib/mechanics-reference-schema";
import { conformResourceRef } from "@/lib/resources";
import type { MechanicsTriggerEvidence } from "@/types/mechanics-trigger";

const TRIGGER_CONTEXT: ExactSchemaContext<
  MechanicsTriggerSchemaCustomTypes,
  Record<never, never>
> = {
  customs: {
    "clock-ref": conformClockRef,
    "damage-resolution": conformDamageResolution,
    "entity-ref": conformEntityRef,
    id: conformMechanicId,
    "occurrence-ref": conformOccurrenceRef,
    "positive-integer": (value) =>
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      !Object.is(value, -0)
        ? value
        : null,
    "resource-ref": conformResourceRef,
  },
  refs: {},
};

const conformTriggerStructure = exactConformer(
  MECHANICS_TRIGGER_EVIDENCE_SCHEMA,
  TRIGGER_CONTEXT
);

export function conformMechanicsTriggerEvidence(
  value: unknown
): Readonly<MechanicsTriggerEvidence> | null {
  return conformTriggerStructure(value);
}
