/**
 * How far the app plays each catalogue entry, the one rule set the coverage rows of
 * docs/RULES_COVERAGE.md are counted with (each `rules-coverage-*` test) and the
 * played-content view reads (`rules-coverage-played.test.ts`):
 *
 *  - auto: the engine applies it with no input (a standing grant, a builder pick);
 *  - tap: one declaration applies it (a counter, an action row, a cast, a toggled
 *    state, a pick);
 *  - reference: the app shows its text; the table plays it by hand.
 *
 * Impossible is 0 everywhere: every entry can be noted by hand. The class-feature
 * rule lives in `class-feature-coverage.ts` (the pack's twin test shares it).
 */
import type {
  SrdFeatData,
  SrdMagicItemData,
  SrdRaceTrait,
  SrdSpellData,
} from "@/data/types";
import { translateSpell } from "@/lib/activities/from-spell";
import type { Grant } from "@/lib/grant-schema";

import type { CoverageClass } from "./class-feature-coverage";

export { classFeatureCoverage, SRD_CARRIED } from "./class-feature-coverage";
export type { CoverageClass } from "./class-feature-coverage";

/** Grants whose effect still needs the player's one tap (a cast, a toggle, a pick). */
const TAP_ONLY = new Set([
  "while-active",
  "always-prepared-spell",
  "free-cast-spell",
  "free-cast-from-list",
  "at-will-cast-spell",
  "choice-cantrip",
  "choice-spell",
]);

function leafKinds(grants: ReadonlyArray<Grant>): string[] {
  return grants.flatMap((grant) =>
    grant.type === "choice-grant-bundle"
      ? grant.options.flatMap((option) => leafKinds(option.grants))
      : [grant.type]
  );
}

/** The `auto / tap / reference / 0` cell of a coverage row. */
export function coverageCell(classes: ReadonlyArray<CoverageClass>): string {
  const count = (c: CoverageClass) => classes.filter((x) => x === c).length;
  return `${count("auto")} / ${count("tap")} / ${count("reference")} / 0`;
}

// ── Spells ──────────────────────────────────────────────────────────────────────

/** Spells a dedicated engine module runs from their id (src/lib/play/wish.ts,
 *  extra-turns.ts, polymorph.ts, familiar-ids.ts). */
export const ENGINE_OWNED_SPELLS: ReadonlySet<string> = new Set([
  "wish",
  "time-stop",
  "shapechange",
  "animal-shapes",
  "find-familiar",
]);

/** A lit state's leaves, through nested states and bundles. */
function litLeafKinds(grants: ReadonlyArray<Grant>): string[] {
  return grants.flatMap((grant) =>
    grant.type === "while-active"
      ? litLeafKinds(grant.grants)
      : grant.type === "choice-grant-bundle"
        ? grant.options.flatMap((option) => litLeafKinds(option.grants))
        : [grant.type]
  );
}

/**
 * auto = casting lights a state whose grants the engine applies (anything but a
 * reminder note); tap = the cast carries a structured consequence (damage, healing,
 * temp HP, a condition, an attack or a save, a follow-up, a summon, a program) or
 * runs on a dedicated engine path; reference = it declares nothing structured.
 */
export function spellCoverage(spell: SrdSpellData): CoverageClass {
  const lit = (spell.grants ?? []).filter(
    (grant) => grant.type === "while-active" && !grant.activatedByAction
  );
  if (litLeafKinds(lit).some((kind) => kind !== "defense-note")) return "auto";
  const { activity, gaps } = translateSpell(spell);
  const structured =
    activity.effects.length > 0 ||
    activity.attack !== undefined ||
    activity.save !== undefined ||
    activity.followUp !== undefined ||
    activity.repeats !== undefined ||
    gaps.length > 0;
  return structured || ENGINE_OWNED_SPELLS.has(spell.id) ? "tap" : "reference";
}

// ── Species traits ──────────────────────────────────────────────────────────────

/** Traits a sibling trait's pick carries (`<species>:<trait>`). */
const TRAIT_CARRIED_BY_SIBLING = new Set(["dragonborn:damage-resistance"]);

/** tap = a counter, an action row, or only casts and toggled states; auto = any
 *  other standing grant; reference = it declares nothing. */
export function speciesTraitCoverage(raceId: string, trait: SrdRaceTrait): CoverageClass {
  if (TRAIT_CARRIED_BY_SIBLING.has(`${raceId}:${trait.id}`)) return "auto";
  const kinds = leafKinds(trait.grants ?? []);
  if (trait.mechanics?.tracker || trait.mechanics?.actions?.length) return "tap";
  if (kinds.length === 0) return "reference";
  return kinds.every((kind) => TAP_ONLY.has(kind)) ? "tap" : "auto";
}

// ── Feats ───────────────────────────────────────────────────────────────────────

/** Feats the builder or the engine applies from their id (Alert's initiative, the
 *  Ability Score Improvement's pick). */
const FEATS_APPLIED_BY_ID = new Set(["alert", "ability-score-improvement"]);

/**
 * The species rule, judged on the feat's own effect: the +1 to an ability a half
 * feat or a boon carries is applied by the builder and does not count, so a boon
 * whose signature effect declares nothing reads «reference», not «auto».
 */
export function featCoverage(feat: SrdFeatData): CoverageClass {
  if (FEATS_APPLIED_BY_ID.has(feat.id)) return "auto";
  const kinds = leafKinds(feat.grants ?? []).filter(
    (kind) => kind !== "choice-ability-score"
  );
  if (feat.mechanics?.tracker || feat.mechanics?.actions?.length) return "tap";
  if (kinds.length === 0) return "reference";
  return kinds.every((kind) => TAP_ONLY.has(kind)) ? "tap" : "auto";
}

// ── Magic items ─────────────────────────────────────────────────────────────────

const ITEM_TAP_ONLY = new Set([
  "while-active",
  "always-prepared-spell",
  "free-cast-spell",
  "free-cast-from-list",
  "at-will-cast-spell",
]);

/** auto = a standing grant the engine applies while worn; tap = only casts,
 *  activations, drunk states, a counter, a healing formula or a called creature;
 *  reference = nothing structured. */
export function magicItemCoverage(item: SrdMagicItemData): CoverageClass {
  const grants = item.grants ?? [];
  if (grants.some((grant) => !ITEM_TAP_ONLY.has(grant.type))) return "auto";
  if (
    grants.length > 0 ||
    item.resources?.length ||
    item.potionFormula ||
    item.summonedMonsters ||
    item.bestiaryPick
  ) {
    return "tap";
  }
  return "reference";
}
