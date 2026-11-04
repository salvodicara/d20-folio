/**
 * Hunter's Mark and Hex move on (edge-case family M8): when the creature your mark
 * is on drops to 0 Hit Points, the spell's trigger rule offers its move-the-mark
 * Bonus Action. This module says which offers a change in the fight raises for you.
 */
import { foldCombatEffectOps, type IncapacitationRow } from "@/lib/combat-effects";
import { firedTriggerOffers } from "@/lib/smart-tracker";
import type { CombatEffectOp } from "@/types/combat-effect";
import type { CharacterDoc } from "@/types/character";

/** An offer to move a mark off a creature that just dropped to 0 HP. */
export interface MarkOffer {
  /** The spell or feature the mark belongs to (`hex`). */
  sourceId: string;
  /** Which catalogue names it. */
  sourceKind: "spell" | "feature";
  /** Its catalogue action that moves the mark (`move-mark`). */
  actionId: string;
  /** The combatant that dropped. */
  targetId: string;
}

type Row = Pick<IncapacitationRow, "id" | "currentHp">;

/**
 * The move-the-mark offers raised between two looks at the fight: a creature that
 * had Hit Points before and has 0 now, carrying a mark of yours (`myId`) whose
 * source's trigger rule fires. The first look at a fight (`before` null) raises
 * none: a reload is not a drop.
 */
export function markDropOffers(
  doc: CharacterDoc,
  before: ReadonlyArray<Row> | null,
  after: ReadonlyArray<Row>,
  effectOps: ReadonlyArray<CombatEffectOp> | undefined,
  myId: string
): MarkOffer[] {
  if (!before) return [];
  const hadHp = new Set(before.filter((r) => r.currentHp > 0).map((r) => r.id));
  const dropped = after.filter((r) => r.currentHp === 0 && hadHp.has(r.id));
  if (dropped.length === 0) return [];
  const marks = foldCombatEffectOps(effectOps).filter(
    (e) => e.payload.kind === "target-mark" && e.actor.combatantId === myId
  );
  if (marks.length === 0) return [];
  const offers = firedTriggerOffers(doc, "reduced-to-zero", { targetMarked: true });
  return dropped.flatMap((row) =>
    offers.flatMap((offer) => {
      const mark = marks.find(
        (m) => m.target.combatantId === row.id && m.source.id === offer.sourceId
      );
      return mark ? [{ ...offer, sourceKind: mark.source.kind, targetId: row.id }] : [];
    })
  );
}
