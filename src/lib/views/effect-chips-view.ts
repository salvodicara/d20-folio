/**
 * The header's status chips: one list of what is on the character now, buffs and
 * conditions together. A buff is an active status (`deriveStatuses`), named by what
 * established it; a condition is a stored condition id, named from the SRD catalogue.
 *
 * Remaining time: a counted status reads in rounds under a minute and in whole minutes
 * (rounded up) from 10 rounds on; a status the clock does not count (until a rest, a
 * turn edge, kept up by hand) and every condition read `null`.
 */
import type { Locale } from "@/lib/locale";
import { deriveStatuses, statusRoundsLeft } from "@/lib/status";
import type { CharacterDoc } from "@/types/character";
import { concentrationLabel, conditionChips, grantSourceLabel } from "./tracker-view";

const ROUNDS_PER_MINUTE = 10;

export interface EffectChip {
  /** The status key, or the condition id. */
  id: string;
  name: string;
  kind: "buff" | "condition";
  remaining: { rounds: number } | { minutes: number } | null;
  /** What established it (a feature, spell, item or cast source); null for a condition. */
  source: string | null;
  /** Held by the owner's Concentration: dropping it ends this too. */
  concentration: boolean;
}

/** A countdown as the table reads it: rounds under a minute, whole minutes from there. */
export function remainingOf(roundsLeft: number | undefined): EffectChip["remaining"] {
  if (roundsLeft === undefined) return null;
  return roundsLeft < ROUNDS_PER_MINUTE
    ? { rounds: roundsLeft }
    : { minutes: Math.ceil(roundsLeft / ROUNDS_PER_MINUTE) };
}

export function effectChipsView(doc: CharacterDoc, locale: Locale): EffectChip[] {
  const buffs: EffectChip[] = deriveStatuses(doc).map((status) => ({
    id: status.key,
    name: grantSourceLabel(status.source, locale),
    kind: "buff",
    remaining: remainingOf(statusRoundsLeft(status)),
    source: status.source,
    concentration: status.concentration,
  }));
  const conditions: EffectChip[] = conditionChips(doc.session.conditions, locale).map(
    (chip) => ({
      id: chip.id,
      name: chip.label,
      kind: "condition",
      remaining: null,
      source: null,
      concentration: false,
    })
  );
  return [...buffs, ...conditions];
}

/** The header's three fixed groups (direction 2026-10-23, row 8). */
export interface EffectGroups {
  /** ◉ The spell Concentration holds, and the buffs that end with it. */
  concentration: { spell: { id: string; name: string } | null; holds: EffectChip[] };
  /** ✦ Every other buff, with its count. */
  effects: { count: number; chips: EffectChip[] };
  /** ⚠ The conditions, with their count. */
  conditions: { count: number; chips: EffectChip[] };
}

/**
 * The chips as the header's three group buttons show them. A buff Concentration
 * holds sits under Concentration (it ends with it), never among the effects too, so
 * nothing is counted twice; a condition always sits under conditions.
 */
export function effectGroupsView(doc: CharacterDoc, locale: Locale): EffectGroups {
  const chips = effectChipsView(doc, locale);
  const held = doc.session.concentration;
  const holds = chips.filter((chip) => chip.kind === "buff" && chip.concentration);
  const effects = chips.filter((chip) => chip.kind === "buff" && !chip.concentration);
  const conditions = chips.filter((chip) => chip.kind === "condition");
  return {
    concentration: {
      spell: held ? { id: held, name: concentrationLabel(held, locale) } : null,
      holds,
    },
    effects: { count: effects.length, chips: effects },
    conditions: { count: conditions.length, chips: conditions },
  };
}
