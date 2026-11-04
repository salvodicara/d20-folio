/** Read models for explicit dawn/dusk item-resource declarations. */

import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import type {
  ItemResourceRecoveryAmount,
  ItemResourceUnit,
  SrdMagicItemData,
} from "@/data/types";
import { itemCopies } from "@/lib/homebrew-items";
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
      equipment: itemCopies(character.character),
      catalogue,
      itemResources: character.session.itemResources,
    });
    return (
      result.status === "pending-input" ||
      (result.status === "prepared" && result.prepared.entries.length > 0)
    );
  });
}

/** One item that recovers at a clock boundary, for «Passa il tempo»'s preview. */
export interface TableClockRecovery {
  /** The magic item's catalogue id (its name is localized by id). */
  itemId: string;
  unit: ItemResourceUnit;
  /** What comes back: null = all of it, else "1d6+1" or "3". */
  amount: string | null;
}

/** The catalogue items the character carries that recover at `kind` (dawn or dusk). */
export function tableClockRecoveries(
  character: CharacterDoc,
  kind: TableClockBoundary,
  catalogue: readonly Pick<SrdMagicItemData, "id" | "resources">[] = SRD_MAGIC_ITEMS
): TableClockRecovery[] {
  const byId = new Map(catalogue.map((item) => [item.id, item] as const));
  const out: TableClockRecovery[] = [];
  for (const copy of itemCopies(character.character)) {
    if ("custom" in copy) continue;
    for (const resource of byId.get(copy.srdId)?.resources ?? []) {
      const recovery = resource.recoveries?.find((r) => r.trigger.kind === kind);
      if (!recovery) continue;
      out.push({
        itemId: copy.srdId,
        unit: resource.unit,
        amount: amountText(recovery.amount),
      });
    }
  }
  return out;
}

function amountText(amount: ItemResourceRecoveryAmount): string | null {
  switch (amount.kind) {
    case "full":
      return null;
    case "fixed":
      return String(amount.amount);
    case "entered-roll": {
      const { dice, sides, modifier } = amount.roll;
      const mod = modifier ? `${modifier > 0 ? "+" : ""}${modifier}` : "";
      return `${dice}d${sides}${mod}`;
    }
  }
}
