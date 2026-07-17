/**
 * Feat ELIGIBILITY gating (2024 RAW) — the engine seam behind the level-up
 * ASI/feat step ("you gain … another feat of your choice FOR WHICH YOU
 * QUALIFY").
 *
 * Two layers, both id/enum-based (golden rule 7):
 *
 *  1. CATEGORY availability ({@link featCategoryOffered}) — derived, never
 *     stored per feat: General feats are level 4+ (every ASI level is), Epic
 *     Boon feats are level 19+, Fighting-Style feats require the Fighting
 *     Style feature, Origin feats have no prerequisite (RAW: an Origin feat IS
 *     a legal ASI-level pick). Setting categories (heritage / planar-pact)
 *     are campaign content and stay offered.
 *  2. STRUCTURED prerequisites ({@link featPrereqMet}) — the per-feat facts
 *     verified against dnd2024.wikidot.com (`SrdFeatData.prereq`): ability
 *     minimums ("Strength or Dexterity 13+"), the Spellcasting/Pact Magic
 *     feature, armor training. A feat failing these is shown DISABLED with its
 *     prerequisite note (the player sees why), not hidden.
 *
 * {@link featGateCtx} derives the character-side facts once: total level being
 * reached, ability scores, the union of armor trainings (class tables + any
 * `armor-proficiency` grant), whether any class/subclass casts, and whether
 * the Fighting Style feature is owned.
 *
 * Pure + Firebase-free.
 */

import { getClassTable } from "@/data/classes";
import { totalLevel } from "@/lib/classes";
import { classArmorTraining } from "@/lib/multiclass";
import { isArmorProficient } from "@/lib/compute";
import { asProficiencyToken } from "@/lib/proficiency-tokens";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { subclassSpellcastingState } from "@/lib/subclass-spellcasting";
import {
  isFightingStylePlaceholder,
  listAllFightingStyles,
  hasFightingStyleFeat,
} from "@/lib/fighting-style";
import type { AbilityCode, FeatCategory, SrdFeatData } from "@/data/types";
import type { CharacterData } from "@/types/character";
import type { ProficiencyToken } from "@/types/ids";

/** The character-side facts feat gating reads. Build once via {@link featGateCtx}. */
export interface FeatGateCtx {
  /** The TOTAL character level being reached (the new level on a level-up). */
  level: number;
  abilityScores: Readonly<Record<AbilityCode, number>>;
  /** Armor-training {@link ProficiencyToken} ids (`medium-armor`, `shields`). */
  armorTraining: ReadonlyArray<ProficiencyToken>;
  /** Has the Spellcasting or Pact Magic feature (any class or casting subclass). */
  hasSpellcasting: boolean;
  /** Has the Fighting Style class feature (or already owns a style feat). */
  hasFightingStyleFeature: boolean;
  /**
   * D7 — this gate is the L19 EPIC-BOON grant (the class grants its Epic Boon at
   * level 19). 2024 RAW restricts level 19 to an Epic Boon feat — NOT a general
   * feat and NOT the +2/+1 ASI fork — so when set, {@link featCategoryOffered}
   * offers ONLY the `epic-boon` category and the level-up wizard suppresses the
   * ASI fork. Absent/false at every other ASI level (4/8/12/16), which keep the
   * full general-feat + ASI fork.
   */
  isEpicBoonGate?: boolean;
}

/** Derive the {@link FeatGateCtx} for a character reaching `newLevel` (total). */
export function featGateCtx(
  character: CharacterData,
  newLevel: number,
  // D7 — set when the gate is the L19 epic-boon grant (the caller knows the level's
  // featureIds include the class's `*-epic-boon` feature). Restricts the pool below.
  isEpicBoonGate = false
): FeatGateCtx {
  const armorTraining = new Set<ProficiencyToken>();
  let hasSpellcasting = false;
  for (const [i, entry] of character.classes.entries()) {
    const table = getClassTable(entry.classId);
    if (!table) continue;
    // #36 RAW — only the INITIAL class (classes[0]) grants its full armor
    // training; a class taken by multiclassing grants its PARTIAL "As a
    // Multiclass Character" set (lib/multiclass.ts reads the same facts).
    for (const p of classArmorTraining(entry.classId, i === 0)) armorTraining.add(p);
    if (table.spellcasting != null) hasSpellcasting = true;
    // Third-caster subclasses (Eldritch Knight / Arcane Trickster) grant the
    // Spellcasting feature even though the base class doesn't cast.
    if (
      !hasSpellcasting &&
      subclassSpellcastingState(entry.classId, entry.subclassId, entry.level) != null
    ) {
      hasSpellcasting = true;
    }
  }
  // Armor training granted by feats/features (Lightly/Moderately/Heavily
  // Armored chains) — read the declarative `armor-proficiency` grants.
  for (const src of resolveGrantSourcesForFeatures(character.features)) {
    for (const g of src.grants ?? []) {
      if (g.type === "armor-proficiency") armorTraining.add(g.proficiency);
    }
  }
  const hasFightingStyleFeature =
    character.features.some(
      (f) => !("custom" in f) && isFightingStylePlaceholder(f.srdId)
    ) ||
    listAllFightingStyles().some((st) => hasFightingStyleFeat(character.features, st.id));
  return {
    level: newLevel,
    abilityScores: character.abilityScores,
    armorTraining: [...armorTraining],
    hasSpellcasting,
    hasFightingStyleFeature,
    isEpicBoonGate,
  };
}

/**
 * The character's EFFECTIVE armor-proficiency {@link ProficiencyToken} set — the
 * SINGLE source of truth for "what armor is this character trained with" (rule
 * 6b). The multiclass-aware `featGateCtx(...).armorTraining` (initial class full
 * set + each multiclassed class's partial set + every `armor-proficiency` grant)
 * LAYERED WITH `armorProficiencyOverrides` (override-first — a manual add/remove,
 * #68, wins). BOTH the Inventory per-item "Untrained" gloss
 * (`buildInventoryViewModel`) and the combat unproficient-armor Disadvantage
 * clause (`armorDisadvantageClauses`) resolve their set THROUGH THIS, so they
 * share input AND the `isArmorProficient` predicate → identical by construction.
 *
 * Pure + Firebase-free.
 */
export function effectiveArmorProficiencies(
  character: CharacterData
): ReadonlyArray<ProficiencyToken> {
  const set = new Set<ProficiencyToken>(
    featGateCtx(character, totalLevel(character)).armorTraining
  );
  // Override-first: a manual add/remove of an armor proficiency (#68) is honoured.
  for (const [token, on] of Object.entries(character.armorProficiencyOverrides ?? {})) {
    if (on) set.add(asProficiencyToken(token));
    else set.delete(asProficiencyToken(token));
  }
  return [...set];
}

/**
 * Whether a feat CATEGORY belongs in the pick list at all. Categories whose
 * level/feature gate fails are FILTERED OUT (offering an Epic Boon at level 4
 * is noise, not choice — golden rule 19); per-feat prerequisites are handled
 * separately as a DISABLED state so the player can read what they're missing.
 */
export function featCategoryOffered(category: FeatCategory, ctx: FeatGateCtx): boolean {
  // D7 — at the L19 Epic Boon gate, 2024 RAW grants specifically an Epic Boon feat:
  // no general feat, no fighting-style feat, no origin feat (and the wizard suppresses
  // the +2/+1 ASI fork). So ONLY the epic-boon category is offered here.
  if (ctx.isEpicBoonGate) return category === "epic-boon";
  switch (category) {
    case "general":
      return ctx.level >= 4;
    case "epic-boon":
      return ctx.level >= 19;
    case "fighting-style":
      return ctx.hasFightingStyleFeature;
    case "origin":
    default:
      // Origin feats have no prerequisite (RAW-legal at any feat grant);
      // setting categories (heritage / planar-pact / future) stay offered —
      // their availability is a table decision, not a rules gate.
      return true;
  }
}

/** Whether the feat's STRUCTURED prerequisites are met (absent = met). */
export function featPrereqMet(
  feat: Pick<SrdFeatData, "prereq">,
  ctx: FeatGateCtx
): boolean {
  const p = feat.prereq;
  if (!p) return true;
  if (p.abilities) {
    for (const req of p.abilities) {
      if (!req.anyOf.some((a) => ctx.abilityScores[a] >= req.min)) return false;
    }
  }
  if (p.spellcasting && !ctx.hasSpellcasting) return false;
  if (p.armorTraining && !isArmorProficient(p.armorTraining, ctx.armorTraining)) {
    return false;
  }
  return true;
}
