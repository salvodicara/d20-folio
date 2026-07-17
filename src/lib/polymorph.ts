/**
 * Polymorph / True Polymorph SELF-transformation — the pure applicator + form
 * resolver (S7 form-swap primitive, Phase 1).
 *
 * A caster who Polymorphs THEMSELVES takes on a Beast form: the Beast's game
 * statistics REPLACE their own. This module is the pure, store-free core:
 *  - {@link resolvePolymorphForms} — the CR-gated form list for the picker
 *    (RAW: a form of Challenge Rating ≤ the caster's level);
 *  - {@link polymorphBuildPatch} — the override-field patch that stamps the
 *    Beast's AC / speeds / ability scores onto the character (OVERRIDE-FIRST —
 *    every stamped value lands in a hand-editable override);
 *  - {@link polymorphPriorSnapshot} / {@link revertBuildFromPrior} — the
 *    before/after of those same fields, so dropping the form restores the
 *    caster's own body EXACTLY (undoable).
 *
 * PURE: ids + numbers only. No React, Zustand, Firebase, or active locale. The
 * store ({@link import("@/stores/characterStore")}) drives it; the Beast NAMES
 * localize at the render edge through the `beasts` srd catalogue.
 */
import type { BeastStatBlock } from "@/data/types";
import type { CharacterData, CharacterDoc, SessionState } from "@/types/character";
import { beastsByMaxCR } from "@/data/beasts";
import { totalLevel } from "@/lib/classes";

/** The spell ids that engage a Polymorph SELF-form (concentration by id). */
export const POLYMORPH_SPELL_IDS: readonly string[] = ["polymorph", "true-polymorph"];

/** The snapshot of the caster's OWN fields the applicator overwrites — restored on drop. */
export type PolymorphPrior = NonNullable<SessionState["polymorphForm"]>["prior"];

/**
 * The Beast forms a caster may assume — RAW: Challenge Rating ≤ the caster's
 * (total) level. The picker reads this; the CR cap is the whole-character level
 * (the SELF case, where the caster IS the target). Sorted by CR then id.
 */
export function resolvePolymorphForms(
  character: CharacterDoc
): ReadonlyArray<BeastStatBlock> {
  return beastsByMaxCR(totalLevel(character.character));
}

/** Snapshot the caster's OWN AC / speed / score / temp-HP fields before a swap. */
export function polymorphPriorSnapshot(doc: CharacterDoc): PolymorphPrior {
  const c = doc.character;
  return {
    acOverride: c.acOverride ?? null,
    speedOverride: c.speedOverride ?? null,
    speedOverrides: { ...(c.speedOverrides ?? {}) },
    abilityScores: { ...c.abilityScores },
    tempHp: doc.session.hp.temp,
  };
}

/**
 * The build patch that STAMPS a Beast form onto the character's override fields
 * (override-first — each is the same field the player edits by hand): the Beast's
 * natural AC → `acOverride`, its walking speed → `speedOverride`, its other
 * movement modes → `speedOverrides`, and its six ability scores → `abilityScores`
 * (RAW: Polymorph replaces ALL statistics, mental scores included — unlike Wild
 * Shape). `prior.speedOverride` is the fallback when the Beast omits a walk speed.
 */
export function polymorphBuildPatch(
  beast: BeastStatBlock,
  prior: PolymorphPrior
): Partial<CharacterData> {
  const speedOverrides: Record<string, number | null> = {};
  for (const mode of ["fly", "swim", "climb", "burrow"] as const) {
    const v = beast.speeds[mode];
    if (typeof v === "number") speedOverrides[mode] = v;
  }
  return {
    acOverride: beast.ac,
    speedOverride: beast.speeds.walk ?? prior.speedOverride ?? null,
    speedOverrides,
    abilityScores: { ...beast.abilityScores },
  };
}

/** The build patch that RESTORES the caster's own body from the drop snapshot. */
export function revertBuildFromPrior(prior: PolymorphPrior): Partial<CharacterData> {
  return {
    acOverride: prior.acOverride,
    speedOverride: prior.speedOverride,
    speedOverrides: { ...prior.speedOverrides },
    abilityScores: { ...prior.abilityScores },
  };
}
