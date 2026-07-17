/**
 * M1 — Fighting Style choice modelling.
 *
 * Fighter (L1), Paladin (L2) and Ranger (L2) gain a "Fighting Style" feature
 * that lets the player pick one of ten styles. The placeholder
 * `<class>-fighting-style` feature only signals that the slot opens; the
 * specific style (Archery / Defense / Dueling / etc.) is a feat in
 * `src/data/feats.ts` with `category: "fighting-style"`.
 *
 * This helper module is pure: callers (LevelUpModal, character creation)
 * use it to (a) decide whether to surface a Fighting-Style picker step,
 * (b) enumerate the available styles, and (c) apply the chosen style as
 * an `SrdFeatureRef`.
 */

import { SRD_FEATS } from "@/data/feats";
import type { SrdFeatData } from "@/data/types";
import type { SrdFeatureRef, CustomFeature } from "@/types/character";

/**
 * Placeholder feature IDs that the class tables add when a Fighting Style
 * slot opens. Presence of one of these in the freshly-granted features at
 * a level means the wizard must surface a style picker.
 */
const FIGHTING_STYLE_PLACEHOLDERS: ReadonlySet<string> = new Set([
  "fighter-fighting-style",
  // Champion's "Additional Fighting Style" (2024 fighter:champion, L7) opens a
  // SECOND Fighting Style slot — same picker, distinct placeholder id.
  "fighter-champion-additional-fighting-style",
  "paladin-fighting-style",
  "ranger-fighting-style",
]);

/**
 * Returns true when the supplied (newly-added) feature ID is the
 * fighting-style placeholder for some class — i.e. the wizard should
 * prompt the player to pick a style.
 */
export function isFightingStylePlaceholder(featureId: string): boolean {
  return FIGHTING_STYLE_PLACEHOLDERS.has(featureId);
}

/**
 * The 2024 SRD fighting styles, ordered as in feats.ts. Two are CASTER styles
 * locked to one class via `classScope` (Blessed Warrior → Paladin, Druidic
 * Warrior → Ranger); the other ten are universal (offered to every Fighting
 * Style class).
 *
 * `classId` (the advancing class, a stable id — rule 7) scopes the result:
 *   - present → the universal styles PLUS the one style scoped to that class
 *     (a Paladin sees Blessed Warrior, a Ranger sees Druidic Warrior, a Fighter
 *     sees neither);
 *   - omitted → ONLY the universal styles (any class-agnostic context — the
 *     feat-prereq "do you already have a Fighting Style feat" check still passes
 *     no arg and must see the scoped ids too, so it uses `listAllFightingStyles`).
 */
export function listFightingStyles(classId?: string): SrdFeatData[] {
  // Sorted by id so the offered order is deterministic regardless of where a
  // style is declared (public SRD data vs the content pack).
  return SRD_FEATS.filter(
    (f) =>
      f.category === "fighting-style" &&
      (f.classScope === undefined || f.classScope === classId)
  ).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * EVERY fighting-style feat, including the two class-scoped caster styles —
 * used by ownership checks that must recognise a Blessed/Druidic Warrior the
 * character already has, regardless of class context.
 */
export function listAllFightingStyles(): SrdFeatData[] {
  return SRD_FEATS.filter((f) => f.category === "fighting-style").sort((a, b) =>
    a.id.localeCompare(b.id)
  );
}

/**
 * Returns true when a fighting-style feat with `featId` is already present
 * on the character's features list as an SrdFeatureRef. Used to keep a style
 * DISTINCT — the picker excludes an already-chosen style when a SECOND slot
 * opens (2024 Fighter Champion gains an additional Fighting Style at level 7).
 */
export function hasFightingStyleFeat(
  features: ReadonlyArray<SrdFeatureRef | CustomFeature>,
  featId: string
): boolean {
  for (const f of features) {
    if ("custom" in f) continue;
    if (f.srdId === featId) return true;
  }
  return false;
}
