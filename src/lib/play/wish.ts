/**
 * Wish (2024) — pure rules for the two things the sheet does after a Wish cast:
 *
 *   • the basic use: duplicate any spell of level 8 or lower without meeting its
 *     requirements. The Wish cast already spent the 9th-level slot, so the duplicated
 *     spell costs nothing more; the shared free-cast picker offers every such spell.
 *   • any other use: Wish Stress (`wish-state.ts`), lit with one tap and ended by a
 *     Long Rest; each later spell reminds the caster of 1d10 Necrotic per level.
 */
import { spells } from "@/data/spells";
import type { FreeCastFromListPool } from "@/lib/smart-tracker";
import { WISH_STRESS_STATE } from "@/lib/wish-state";
import type { CharacterDoc, LogEntry, SessionState } from "@/types/character";
import { setActiveState } from "./states";

export const WISH_ID = "wish";
/** The highest spell level Wish duplicates. */
export const WISH_DUPLICATE_MAX_LEVEL = 8;

/** Every catalogue spell Wish can duplicate, by level then stable id. */
export function wishDuplicateSpellIds(): string[] {
  return spells
    .filter((spell) => spell.level <= WISH_DUPLICATE_MAX_LEVEL)
    .sort((a, b) => a.level - b.level || a.id.localeCompare(b.id))
    .map((spell) => spell.id);
}

/** The duplicate picker's pool: every eligible spell, nothing more to pay. */
export function wishDuplicatePool(): FreeCastFromListPool {
  const spellIds = wishDuplicateSpellIds();
  return {
    sourceId: WISH_ID,
    trackerId: WISH_ID,
    spellIds,
    maxSpellLevel: WISH_DUPLICATE_MAX_LEVEL,
    recovery: { kind: "tracker", rest: "long" },
    charges: 1,
    remaining: 1,
    costBySpell: Object.fromEntries(spellIds.map((id) => [id, 0])),
  };
}

/**
 * The log id of a Wish cast this turn still waiting on its follow-up: the newest use
 * after the last turn line is Wish. Any later use (the duplicated spell) or a turn
 * line closes it; an undone cast removes its line.
 */
export function pendingWish(entries: ReadonlyArray<LogEntry>): string | null {
  for (const { id, event } of [...entries].reverse()) {
    if (event.kind === "turn-end") return null;
    if (event.kind !== "action-use") continue;
    const isWish =
      "srd" in event.action &&
      event.action.srd.kind === "spell" &&
      event.action.srd.key === WISH_ID;
    return isWish ? id : null;
  }
  return null;
}

/** Light or end Wish Stress, or null when it already is. */
export function setWishStress(doc: CharacterDoc, stressed: boolean): SessionState | null {
  // Wish Stress declares no round countdown, so the lit round is never read.
  return setActiveState(doc, WISH_STRESS_STATE.activeKey, stressed, 0);
}

/** The d10s of Necrotic damage a spell of this level costs under Wish Stress. */
export function wishStressDice(spellLevel: number): number {
  return Math.max(0, spellLevel);
}
