/**
 * Character inference — derive the values a 2024 character's EXPLICIT CHOICES
 * imply, so they never have to be STORED.
 *
 * Phase-1 minimal-schema principle (golden rules 2 + 6): a character
 * document should carry only the irreducible facts the player CHOSE (species, the
 * `classes[]` breakdown, background, ability scores, the picks the rules leave
 * open) plus any manual OVERRIDE. Everything a standard 2024 grant determines is
 * INFERRED here at read time. These helpers are the single inference seam the
 * minimization codec (`character-minimal.ts`) uses to decide which fields can be
 * dropped from a stored/exported document and rebuilt on the way back in.
 *
 * R4 — class-keyed helpers take a {@link ClassEntry} (`{ classId, level,
 * subclassId? }`), id-first (golden rule 7 — no display string is read). A
 * single-class character has exactly one entry; a multiclass character calls the
 * per-entry helpers once per entry and the codec merges the results. Each helper
 * composes EXISTING engine data (the class tables, the background Origin-feat
 * resolver) — it never re-states a fact. Pure + Firebase-free so the persistence
 * layer and the CI suite can both call them (`tests/unit/pure-modules-guard.test.ts`).
 */

import type { AbilityCode } from "@/data/types";
import type { CharacterData, ClassEntry, SrdFeatureRef } from "@/types/character";
import type { SpellcastingConfig } from "@/types/character";
import { classTableIndex } from "@/data/classes";
import { abilityModifier } from "@/lib/ability";
import { buildGrantedFeatures } from "@/lib/character-build";
import { getBackgroundOriginFeat } from "@/data/backgrounds";
import { getRace } from "@/data/races";
import { primaryClassEntry } from "@/lib/classes";

/** The standard 2024 point-buy budget every character starts from. */
export const ABILITY_BUDGET_DEFAULT = 27;

/** Hit-die sizes a class table can declare, narrowed to the CharacterData union. */
type HitDie = CharacterData["hitDieType"];

// The EN display name of a class/subclass id ("store by id, derive the label")
// lives in the SRD-FREE `@/data/srd-names` (`classNameById` / `subclassNameById`),
// whose name table is pinned to the live data. The old `inferClassName` /
// `inferSubclassName` here read the class table's `name.en` BiText (moved into the
// i18n catalogues by R3) and were unused — removed in R6+R3 SLICE 7b.

/**
 * The saving-throw proficiencies a class grants — the 2024 rules fix these per
 * class, so a legal character's `savingThrows` is never a free choice. RAW: a
 * MULTICLASS character gains save proficiencies only from its FIRST class, so this
 * reads the PRIMARY entry's class table. Returns the table order verbatim.
 */
export function inferSavingThrows(entry: ClassEntry): AbilityCode[] {
  const table = classTableIndex.get(entry.classId);
  return table ? [...table.savingThrows] : [];
}

/** The hit-die size a class grants (Barbarian d12 … Wizard d6). */
export function inferHitDie(entry: ClassEntry): HitDie {
  const table = classTableIndex.get(entry.classId);
  // Default to d8 for an unknown / homebrew class so `hitDieType` (a REQUIRED
  // field) is never left undefined — a featureless husk still has a valid die.
  return table?.hitDie ?? 8;
}

/**
 * One class entry's average HIT-DIE contribution to max HP, split into its DICE
 * portion (the die value, CON-free) and the CON portion it absorbs. The dice +
 * CON split lets the Max-HP breakdown tip render a per-class "Hit Dice" row and a
 * single "Constitution" row that SUM EXACTLY to {@link inferHpMax} (golden rule
 * 6b). `classId` is the entry's stable id (the breakdown labels it off the class
 * catalogue, rule 7); `con` carries the per-level CON contribution INCLUDING the
 * RAW per-level min-1 floor, so a low-CON character's rows still sum exactly.
 */
export interface HpClassContribution {
  classId: string;
  /** The CON-free dice contribution: L1 of the primary = max die, else die avg. */
  dice: number;
  /** The CON contribution this class absorbs (per-level, RAW min-1 floored). */
  con: number;
}

/**
 * The AVERAGE maximum HP a character has across all its class levels, DECOMPOSED
 * per class into a CON-free dice portion + the CON portion (the single source the
 * Max-HP breakdown tip and {@link inferHpMax} both read). First level of the FIRST
 * class = max die + CON mod; each later level = the gaining class's die average +
 * CON mod, with the RAW per-level min-1 floor ("If your CON modifier reduces the
 * total to 0 or less, you gain 1 HP"). `classes` is the full breakdown so a
 * multiclass character's average is correct (each class contributes its own die).
 * Returns `[]` when the primary class is unknown so the minimizer keeps stored `hp`.
 */
export function inferHpContributions(
  classes: readonly ClassEntry[],
  conScore: number
): HpClassContribution[] {
  if (classes.length === 0) return [];
  const primary = classes.reduce((best, e) => (e.level > best.level ? e : best));
  if (!classTableIndex.has(primary.classId)) return [];
  const conMod = abilityModifier(conScore);
  return classes.map((e) => {
    const table = classTableIndex.get(e.classId);
    const die = table?.hitDie ?? 8;
    const avg = Math.floor(die / 2) + 1;
    // The primary class spends its first level on the MAX die; its remaining
    // levels (and every level of the other classes) take the die average.
    const isPrimary = e === primary;
    const firstDie = isPrimary ? die : 0;
    const avgLevels = isPrimary ? e.level - 1 : e.level;
    const dice = firstDie + avgLevels * avg;
    // The CON portion is what the RAW per-level total adds OVER the CON-free dice,
    // so the min-1 floor is captured here and the rows always sum to the total.
    let total = isPrimary ? Math.max(1, die + conMod) : 0;
    const perLevelAvg = Math.max(1, avg + conMod);
    total += avgLevels * perLevelAvg;
    return { classId: e.classId, dice, con: total - dice };
  });
}

/**
 * The AVERAGE maximum HP a character has across all its class levels — first level
 * of the FIRST class = max die + CON mod; each later level = the gaining class's
 * die average + CON mod. HP-boosting FEATS (Tough, Dwarven Toughness) add on top via
 * grants the pure inferer can't see, so a character with those DEVIATES and is kept;
 * a ROLLED HP likewise deviates and is kept. `classes` is the full breakdown so a
 * multiclass character's average is correct (each class contributes its own die).
 * Returns `0` when the primary class is unknown so the minimizer keeps stored `hp`.
 *
 * The SUM of {@link inferHpContributions} (dice + CON across every class) — the one
 * decomposition both this scalar and the Max-HP breakdown tip read (rule 6).
 */
export function inferHpMax(classes: readonly ClassEntry[], conScore: number): number {
  return inferHpContributions(classes, conScore).reduce(
    (sum, c) => sum + c.dice + c.con,
    0
  );
}

/**
 * The stored max HP a character should carry after its CON score changes OUTSIDE
 * the level-up flow — a direct sheet edit / data-entry correction / story curse
 * (RA-22). 2024 RAW ("Constitution"): if your CON MODIFIER changes, your Hit Point
 * maximum changes as well, retroactively across EVERY level, in BOTH directions.
 * The adjustment is the pure CON-term delta `inferHpMax(classes, nextCon) -
 * inferHpMax(classes, prevCon)` — the SAME arithmetic the Bio level-reconcile
 * applies (rule 6, one HP math) — so it (a) captures the RAW per-level min-1 floor
 * and the multiclass breakdown exactly, (b) is 0 when the CON modifier is unchanged
 * (an even→odd bump), and (c) PRESERVES the player's deviation from the average (a
 * rolled / hand-pinned max shifts by the delta, is never reset). Floored at 1.
 * Returns the stored max UNCHANGED for a husk whose primary class is unknown
 * (`inferHpMax` is 0 for both terms → delta 0).
 */
export function retroactiveConHpMax(
  character: Pick<CharacterData, "classes" | "abilityScores" | "hp">,
  nextCon: number
): number {
  const delta =
    inferHpMax(character.classes, nextCon) -
    inferHpMax(character.classes, character.abilityScores.CON);
  return Math.max(1, character.hp.max + delta);
}

/**
 * The spell-slot table a SINGLE-classed caster has at its level, in the
 * `CharacterData.spellSlots` shape. Derived straight from the class table's
 * per-level `spellSlots` array (index 0 = 1st-level slots). Returns `[]` for
 * non-casters and classes whose slots don't come from the base table (Warlock Pact
 * Magic, third-caster subclasses). Multiclass slots come from
 * `computeMulticlassSpellSlots` (`lib/multiclass-slots.ts`), not this helper.
 */
export function inferSpellSlots(
  entry: ClassEntry
): Array<{ level: number; total: number }> {
  const table = classTableIndex.get(entry.classId);
  if (!table) return [];
  const row = table.levels.find((l) => l.level === entry.level);
  const slots = row?.spellSlots;
  if (!slots) return [];
  const out: Array<{ level: number; total: number }> = [];
  slots.forEach((total, i) => {
    if (total > 0) out.push({ level: i + 1, total });
  });
  return out;
}

/**
 * The Origin feat a character's background fixes (D&D 2024 backgrounds each grant
 * exactly one). The stored `bgFeat` is therefore inferable from `background` for
 * the common case; only a choice-background pick (`featOptions`) or a custom
 * background needs it stored. Delegates to the single override-first resolver so
 * this and `deriveOriginFeats` can never disagree.
 */
export function inferBgFeat(character: { background: string; bgFeat?: string }): string {
  if (!character.background) return "";
  return getBackgroundOriginFeat(character.background, character.bgFeat);
}

/**
 * The base walking Speed a species grants, as the plain numeric string
 * `CharacterData.speed` stores (locale-formatted only at display via
 * `formatSpeed`). 2024 PCs take their species Speed (30 ft for most, 25/35 for a
 * few). Returns `""` for an unknown species so the minimizer keeps the stored value.
 */
export function inferSpeed(character: { race: string }): string {
  const race = resolveRace(character.race);
  return race ? String(race.speed) : "";
}

/** Resolve a species by its display name OR id (case-insensitive) — `getRace` is
 *  case-sensitive, and stored `race` is a display label ("Human"). */
function resolveRace(race: string | undefined): ReturnType<typeof getRace> {
  if (typeof race !== "string" || !race) return undefined;
  return getRace(race) ?? getRace(race.toLowerCase());
}

/**
 * The spellcasting block a class fixes: the ability and prepared-caster flag
 * come straight from the class table; `preparedMax` is the class table's
 * per-level `spellsKnown`. The two manual deltas (`saveDCOverride` /
 * `attackBonusOverride`) default to `null`. RAW: a multiclass character's
 * spellcasting ability is per-class; the PRIMARY (headline) caster's block is the
 * stored one, so this reads the primary entry. Returns `null` for non-casters and
 * subclass-only casters (Eldritch Knight / Arcane Trickster) whose block the base
 * table can't fix — the minimizer then keeps the stored value verbatim.
 */
export function inferSpellcasting(entry: ClassEntry): SpellcastingConfig | null {
  const table = classTableIndex.get(entry.classId);
  const sc = table?.spellcasting;
  if (!sc) return null;
  // `table` is narrowed non-null here (a truthy `sc` implies a defined `table`).
  const row = table.levels.find((l) => l.level === entry.level);
  return {
    ability: sc.ability,
    preparedCaster: sc.preparedCaster,
    preparedMax: row?.spellsKnown ?? 0,
    saveDCOverride: null,
    attackBonusOverride: null,
  };
}

/**
 * The CLASS / SUBCLASS features a single class entry grants automatically at its
 * level. A standard character's stored `features[]` is exactly the union of these
 * over every entry, so it never has to be stored: the minimizer drops it when it
 * matches and the read path refills it (feeding both the Features tab AND the combat
 * grant-source pipeline). RACE traits and origin feats are intentionally EXCLUDED
 * (they live outside `features[]`). A character with chosen feats / custom features
 * deviates and is KEPT verbatim.
 */
export function inferFeaturesForEntry(entry: ClassEntry): SrdFeatureRef[] {
  return buildGrantedFeatures({
    classId: entry.classId,
    level: entry.level,
    subclassId: entry.subclassId ?? "",
    raceId: "", // race traits live outside features[] (resolveGrantSourcesForRace)
    originFeat: "",
    bgFeat: "",
  });
}

/**
 * Every class/subclass feature a character receives across ALL its classes (the
 * union over `classes[]`, deduped by srdId). Single-class = one entry's features.
 */
export function inferFeatures(classes: readonly ClassEntry[]): SrdFeatureRef[] {
  const seen = new Set<string>();
  const out: SrdFeatureRef[] = [];
  for (const entry of classes) {
    for (const ref of inferFeaturesForEntry(entry)) {
      if (!seen.has(ref.srdId)) {
        seen.add(ref.srdId);
        out.push(ref);
      }
    }
  }
  return out;
}

/**
 * Whether a species grants a SECOND Origin feat the player chooses — a
 * `choice-feat` trait of the `origin` category (2024 Human "Versatile"). Drives
 * whether the post-creation editor surfaces the species-feat (`humanOriginFeat`)
 * picker. Matches by the race's own grants, so any future Versatile-style
 * species is covered without a hardcoded list.
 */
export function speciesGrantsVersatileFeat(raceName: string): boolean {
  if (typeof raceName !== "string" || !raceName) return false;
  const race = getRace(raceName) ?? getRace(raceName.toLowerCase());
  return Boolean(
    race?.traits.some((tr) =>
      tr.grants?.some((g) => g.type === "choice-feat" && g.category === "origin")
    )
  );
}

// ─── Whole-character class-id resolvers ───────────────────────────────────────
// Map a whole CharacterData to its PRIMARY (headline) class/subclass id — so
// there is ONE place that resolves a character to its headline class, and
// single-class behaviour is unchanged.

/** The PRIMARY entry's class id for a whole character (headline class). */
export function resolveClassId(character: { classes: ClassEntry[] }): string {
  return primaryClassEntry(character).classId;
}

/** The PRIMARY entry's subclass id for a whole character ("" when none). */
export function resolveSubclassId(character: { classes: ClassEntry[] }): string {
  return primaryClassEntry(character).subclassId ?? "";
}
