/**
 * A spell's duration on the clock, in combat rounds (1 round = 6 seconds, so 10 rounds
 * = 1 minute): the time budget a held Concentration spends as rounds tick, time passes
 * or a rest completes. Read from the structured `duration` fact, never the prose.
 */
import type { SpellDuration } from "@/data/types";
import { whileActiveDurationAtCastLevel } from "@/lib/grants";
import { concentrationSpellData } from "@/lib/homebrew-spells";
import type { CustomSpell, SrdSpellRef } from "@/types/character";

export const ROUNDS_PER_MINUTE = 10;

const MINUTES_PER = { minutes: 1, hours: 60, days: 24 * 60 } as const;

/** The duration in rounds, or null when the clock never ends it (Instantaneous,
 *  until dispelled, a Special duration). */
export function spellDurationRounds(duration: SpellDuration): number | null {
  if (!("amount" in duration)) return null;
  if (duration.kind === "rounds") return duration.amount;
  return duration.amount * MINUTES_PER[duration.kind] * ROUNDS_PER_MINUTE;
}

/** The `effectTimers` key of the held Concentration's own countdown. */
export const CONCENTRATION_TIMER_PREFIX = "concentration:";

export function concentrationTimerKey(ref: string): string {
  return `${CONCENTRATION_TIMER_PREFIX}${ref}`;
}

/**
 * The rounds a Concentration on this spell lasts at most, or null when it has no
 * clock budget (nothing held, a text-only custom spell, a duration the clock never
 * ends). A structured homebrew spell (`custom:` ref, resolved through the
 * character's `spells`) budgets its own structured duration. A slot that lengthens
 * the spell (Hex at level 3: 8 hours) lengthens the budget too, read from the
 * spell's own cast-level duration tiers.
 */
export function concentrationBudgetRounds(
  ref: string,
  castLevel: number | undefined,
  spells?: ReadonlyArray<SrdSpellRef | CustomSpell>
): number | null {
  const spell = concentrationSpellData(ref, spells);
  const base = spell ? spellDurationRounds(spell.duration) : null;
  if (base === null || !spell) return null;
  let budget = base;
  for (const grant of spell.grants ?? []) {
    if (grant.type !== "while-active") continue;
    const rounds = whileActiveDurationAtCastLevel(grant.duration, castLevel)?.maxRounds;
    if (rounds !== undefined && rounds > budget) budget = rounds;
  }
  return budget;
}
