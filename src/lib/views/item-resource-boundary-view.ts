/** Read models for explicit dawn/dusk item-resource declarations. */

import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import type { SrdMagicItemData } from "@/data/types";
import {
  prepareItemResourceBoundary,
  type ItemResourceRecoveryBoundary,
} from "@/lib/item-resource-boundaries";
import type { CharacterDoc } from "@/types/character";

export type TableClockBoundary = Extract<
  ItemResourceRecoveryBoundary,
  { kind: "dawn" | "dusk" }
>["kind"];

const TABLE_CLOCK_BOUNDARIES = ["dawn", "dusk"] as const;

/** Read availability through the same pure planner that owns the real commit. */
export function availableTableClockBoundaries(
  character: CharacterDoc,
  catalogue: readonly Pick<SrdMagicItemData, "id" | "resources">[] = SRD_MAGIC_ITEMS
): TableClockBoundary[] {
  return TABLE_CLOCK_BOUNDARIES.filter((kind) => {
    const result = prepareItemResourceBoundary({
      trigger: { kind },
      occurrenceId: `table-clock-availability-${kind}`,
      equipment: character.character.equipment,
      catalogue,
      itemResources: character.session.itemResources,
    });
    return (
      result.status === "pending-input" ||
      (result.status === "prepared" && result.prepared.entries.length > 0)
    );
  });
}
