/**
 * What casting a spell with a slot gives back (2024 RAW), folded into the cast as
 * refunds: the Abjurer's Arcane Ward regains twice the slot level, the Diviner's
 * Expert Divination regains one lower expended slot. Each regain is a {@link CastSpend}
 * the cast refunds (and pays again on undo) plus the log line that records it.
 */
import {
  resolveOnCastSlotRegain,
  resolveOnCastTrackerRefills,
} from "@/lib/on-cast-effects";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import type { CharacterDoc } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";
import {
  castOptionExpendsSpellSlot,
  type CastCommitOption,
  type CastSpend,
} from "./cast-payment";

export interface OnCastRegain {
  refund: CastSpend;
  event: CombatEvent;
}

/**
 * The regains a cast of `spellId` triggers. `slotLevel` is the spell slot the cast
 * expended, or null when it used none (cantrip, ritual, free cast): RAW, both features
 * fire only "with a spell slot". A ward refill counts only the Hit Points the ward is
 * missing, so undo spends again exactly what came back; a full ward regains nothing.
 */
export function onCastRegains(
  doc: CharacterDoc,
  spellId: string | undefined,
  slotLevel: number | null
): OnCastRegain[] {
  if (slotLevel === null) return [];
  const regains: OnCastRegain[] = [];
  for (const refill of resolveOnCastTrackerRefills(doc, spellId, slotLevel)) {
    const missing = doc.session.trackers[refill.trackerId]?.used ?? 0;
    const amount = Math.min(refill.amount, missing);
    if (amount <= 0) continue;
    regains.push({
      refund: { kind: "tracker", trackerId: refill.trackerId, amount },
      event: { kind: "tracker-regain", trackerId: refill.trackerId, amount },
    });
  }
  const slot = resolveOnCastSlotRegain(doc, spellId, slotLevel);
  if (slot) {
    regains.push({
      refund: { kind: "slot", level: slot.level, pactMagic: false },
      event: { kind: "slot-regain", level: slot.level },
    });
  }
  return regains;
}

/**
 * The spell slot a use expended, which is what the on-cast features key on: the
 * configured cast's level when it spends a slot (a scoped extra slot counts), else a
 * bare use's own slot spend; null when no slot was spent.
 */
export function expendedSlotLevel(
  option: CastCommitOption | undefined,
  spends: ReadonlyArray<CastSpend>
): number | null {
  if (option) return castOptionExpendsSpellSlot(option) ? option.level : null;
  const slot = spends.find((spend) => spend.kind === "slot");
  return slot?.level ?? null;
}

/**
 * The states a cast of `spellId` lights by itself: the active keys of the character's
 * `while-active` grants whose `activatedByCast` names the spell ("Whenever you cast
 * Divine Smite", Smite of Protection). Read from the aggregate, so only grants the
 * character really has count (subclass, level, equipped and attuned items), with keys
 * bound to the item copy. A still-lit state is listed too: casting again re-arms it.
 */
export function statesActivatedByCast(doc: CharacterDoc, spellId: string): string[] {
  const groups = aggregateCharacterGrants(doc.character, doc.session).activatableGroups;
  const keys = groups
    .filter((group) => group.activatedByCast?.includes(spellId))
    .map((group) => group.key);
  return [...new Set(keys)];
}
