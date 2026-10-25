/**
 * The time-skip preview: before "N minutes pass" or "dawn" / "dusk" is applied, what it
 * will do. A stretch of minutes lists the statuses it ends (the same lapse `passTime`
 * applies), each with what was left of it; a table-clock boundary lists the items that
 * recharge (the same planner the real boundary commit runs). Pure: nothing is applied.
 */
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import { itemCopies } from "@/lib/homebrew-items";
import { prepareItemResourceBoundary } from "@/lib/item-resource-boundaries";
import type { Locale } from "@/lib/locale";
import { timePassEnds } from "@/lib/play/time";
import { deriveStatuses, statusRoundsLeft } from "@/lib/status";
import type { CharacterDoc } from "@/types/character";
import { remainingOf, type EffectChip } from "./effect-chips-view";
import { grantSourceLabel } from "./tracker-view";
import type { TableClockBoundary } from "./item-resource-boundary-view";

export type TimeSkip = { minutes: number } | { boundary: TableClockBoundary };

export interface TimePreviewEntry {
  /** The status key that ends, or the item id that recharges. */
  id: string;
  name: string;
  what: "ends" | "recharges";
  /** What was left of it before the skip; null when the clock did not count it. */
  remainingBefore: EffectChip["remaining"];
}

function itemName(itemId: string, locale: Locale): string {
  return hasSrd("magic-item", itemId, "name", locale)
    ? localizeSrd("magic-item", itemId, "name", locale)
    : itemId;
}

export function previewTimePasses(
  doc: CharacterDoc,
  skip: TimeSkip,
  locale: Locale
): TimePreviewEntry[] {
  if ("minutes" in skip) {
    const ended = timePassEnds(doc, skip.minutes);
    return deriveStatuses(doc)
      .filter((status) => ended.has(status.key))
      .map((status) => ({
        id: status.key,
        name: grantSourceLabel(status.source, locale),
        what: "ends",
        remainingBefore: remainingOf(statusRoundsLeft(status)),
      }));
  }
  const result = prepareItemResourceBoundary({
    trigger: { kind: skip.boundary },
    occurrenceId: `time-preview-${skip.boundary}`,
    equipment: itemCopies(doc.character),
    catalogue: SRD_MAGIC_ITEMS,
    itemResources: doc.session.itemResources,
  });
  const itemIds =
    result.status === "prepared"
      ? result.prepared.entries.map((entry) => entry.item.itemId)
      : result.status === "pending-input"
        ? result.requests.map((request) => request.identity.itemId)
        : [];
  return [...new Set(itemIds)].map((itemId) => ({
    id: itemId,
    name: itemName(itemId, locale),
    what: "recharges",
    remainingBefore: null,
  }));
}
