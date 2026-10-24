/**
 * The Play screen's "Risorse" column: every pool the character spends from, with
 * what is used, the most it holds, when it comes back, and its kind (the colour
 * family: spell slots, class resources, item charges, Hit Dice). Read from the same
 * sources the sheet's rail reads, in its order: spell slots, class resources, item
 * charges (a class tracker an item's charges already show is left out), Hit Dice.
 */
import type { Recovery } from "@/data/types";
import { slotUsageKey } from "@/lib/cast-options";
import type { Locale } from "@/lib/locale";
import { hitDicePool } from "@/lib/play/hit-dice";
import type { ResourceRecoveryTrigger } from "@/lib/resources";
import type { CharacterDoc } from "@/types/character";
import { buildItemResourceViewModels } from "./item-resource-view";
import { localizeTrackers } from "./tracker-view";

export type ResourceRow =
  | {
      kind: "spell-slot";
      id: string;
      level: number;
      /** A Pact Magic slot (it comes back on a Short Rest). */
      pact: boolean;
      used: number;
      max: number;
      recharge: "short-rest" | "long-rest";
    }
  | {
      kind: "class-resource";
      id: string;
      /** In the reader's language. */
      name: string;
      used: number;
      max: number;
      recharge: Recovery;
    }
  | {
      kind: "item-charges";
      id: string;
      itemId: string;
      /** 1-based when several copies of the item hold charges; null otherwise. */
      copyNumber: number | null;
      /** Null until the table enters the first roll. */
      current: number | null;
      capacity: number | null;
      /** Exact boundaries (dawn and dusk are never a rest). */
      recoveryTriggers: readonly ResourceRecoveryTrigger[];
      canSpend: boolean;
    }
  | {
      kind: "hit-dice";
      id: "hit-dice";
      used: number;
      max: number;
      recharge: "long-rest";
    };

export function resourcesView(doc: CharacterDoc, locale: Locale): ResourceRow[] {
  const { character, session } = doc;
  const slots: ResourceRow[] = character.spellSlots.map((slot) => {
    const key = slotUsageKey(slot);
    const pact = slot.pactMagic === true;
    return {
      kind: "spell-slot",
      id: `slot:${key}`,
      level: slot.level,
      pact,
      used: session.spellSlots[key]?.used ?? 0,
      max: slot.total,
      recharge: pact ? "short-rest" : "long-rest",
    };
  });

  const items = buildItemResourceViewModels(doc).resources;
  const itemIds = new Set(items.map((item) => item.identity.itemId));
  const trackers: ResourceRow[] = localizeTrackers(doc, locale)
    .filter((tracker) => !itemIds.has(tracker.id))
    .map((tracker) => ({
      kind: "class-resource",
      id: tracker.id,
      name: tracker.label,
      used: tracker.used,
      max: tracker.total,
      recharge: tracker.recovery,
    }));

  const charges: ResourceRow[] = items.map((item) => ({
    kind: "item-charges",
    id: item.identity.key,
    itemId: item.identity.itemId,
    copyNumber: item.copyNumber,
    current: item.current,
    capacity: item.capacity,
    recoveryTriggers: item.recoveryTriggers,
    canSpend: item.canSpend,
  }));

  const hitDiceMax = hitDicePool(character).reduce((sum, entry) => sum + entry.count, 0);
  return [
    ...slots,
    ...trackers,
    ...charges,
    {
      kind: "hit-dice",
      id: "hit-dice",
      used: session.hitDice.used,
      max: hitDiceMax,
      recharge: "long-rest",
    },
  ];
}
