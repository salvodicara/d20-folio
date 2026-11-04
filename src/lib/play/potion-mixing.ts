/**
 * Mixing potions (edge-case M18; the DMG's optional table). Drinking a potion while
 * another potion's effect is still running calls for a d100 roll on the DM's table.
 * The sheet offers the roll and records the result; it rolls nothing. The table is
 * the DM's book (private pack data; its source is not in hand yet), so with no table
 * the DM reads the result off their own copy.
 */
import {
  drunkPotionId,
  POTION_AFTEREFFECT_SUFFIX,
  POTION_TIMER_PREFIX,
} from "@/lib/potion-states";
import type { CharacterDoc } from "@/types/character";

/** The DM's mixing table: a d100, its rows by range, each naming an outcome id. */
export interface MixingTable {
  die: "d100";
  rows: ReadonlyArray<{ min: number; max: number; outcome: string }>;
}

/** What the drink would mix: the potion being drunk and those still running. */
export interface MixingOffer {
  drinking: string;
  running: string[];
}

/** The potions whose effect is still running: a lit `potion:<id>` state or a
 *  running countdown. An after-effect (Speed's lethargy) is not the potion. */
function runningPotions(doc: CharacterDoc): string[] {
  const keys = new Set([
    ...(doc.session.activeFeatures ?? []),
    ...Object.entries(doc.session.effectTimers ?? {})
      .filter(([, timer]) => timer.roundsLeft > 0)
      .map(([key]) => key),
  ]);
  return [...keys]
    .filter(
      (key) =>
        key.startsWith(POTION_TIMER_PREFIX) && !key.endsWith(POTION_AFTEREFFECT_SUFFIX)
    )
    .map((key) => key.slice(POTION_TIMER_PREFIX.length));
}

/**
 * Whether drinking the potion behind `costKey` mixes it with another one still
 * running, and with which. Drinking the same potion again only restarts it.
 */
export function potionMixingOffer(
  doc: CharacterDoc,
  costKey: string
): MixingOffer | null {
  const drinking = drunkPotionId(doc.character.equipment, costKey);
  if (drinking === null) return null;
  const running = runningPotions(doc).filter((id) => id !== drinking);
  return running.length > 0 ? { drinking, running } : null;
}

/** The table's outcome for an entered roll, or null when there is no row for it
 *  (or no table: the DM reads it). */
export function mixingOutcome(
  roll: number,
  table: MixingTable | undefined
): string | null {
  return table?.rows.find((row) => roll >= row.min && roll <= row.max)?.outcome ?? null;
}
