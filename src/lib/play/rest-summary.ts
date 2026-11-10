/**
 * What a rest gave, read from the sheet before and after it: the classic RestModal's
 * summary and the new Play screen's (`@/domains/play/rest-model`) are both this one
 * read, so they never disagree. A Long Rest also reports the fading penalties it
 * stepped down and the Hit Point maximum it restored, read from the sheet before.
 */
import { effectiveMaxHp } from "@/lib/aggregate-character";
import { totalLevel } from "@/lib/classes";
import type { RestKind } from "@/lib/play/rest-preview";
import { longRestFades, type LongRestFades } from "@/lib/play/rests";
import type { CharacterDoc } from "@/types/character";

export interface RestSummary {
  kind: RestKind;
  hp: { before: number; after: number; max: number };
  /** Short: the Hit Point Dice spent. Long: those regained (of `total`). */
  hitDice: { count: number; total: number };
  slotsRestored: number;
  trackersRestored: number;
  exhaustionReduced: boolean;
  /** Human's Resourceful: a Long Rest lit Heroic Inspiration that was out. */
  inspirationGained: boolean;
  itemResourceUnitsRecovered: number;
  /** A Long Rest's fading penalty steps and restored maximum; null on a Short Rest. */
  fades: LongRestFades | null;
}

/** One item-resource receipt from the rest's commit (`useRestCommit`). */
export interface RestReceipt {
  before: number;
  after: number;
}

const sum = (values: Iterable<number>) => [...values].reduce((a, b) => a + b, 0);

export function restSummary(
  kind: RestKind,
  before: CharacterDoc,
  after: CharacterDoc,
  receipts: ReadonlyArray<RestReceipt> = []
): RestSummary {
  const was = before.session;
  const now = after.session;
  const usedSlots = (doc: CharacterDoc) =>
    sum(Object.values(doc.session.spellSlots).map((slot) => slot.used));
  const usedTrackers = (doc: CharacterDoc) =>
    sum(Object.values(doc.session.trackers).map((tracker) => tracker.used));
  return {
    kind,
    hp: {
      before: was.hp.current,
      after: now.hp.current,
      max: effectiveMaxHp(after.character, now),
    },
    hitDice: {
      count: Math.abs(now.hitDice.used - was.hitDice.used),
      total: after.character.hitDiceTotalOverride ?? totalLevel(after.character),
    },
    slotsRestored: Math.max(0, usedSlots(before) - usedSlots(after)),
    trackersRestored: Math.max(0, usedTrackers(before) - usedTrackers(after)),
    exhaustionReduced: now.exhaustion < was.exhaustion,
    inspirationGained: !was.inspiration && now.inspiration,
    itemResourceUnitsRecovered: sum(receipts.map((r) => Math.max(0, r.after - r.before))),
    fades: kind === "long" ? longRestFades(before) : null,
  };
}
