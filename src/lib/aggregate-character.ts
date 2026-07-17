/**
 * The ONE sheet-wide grant aggregation for a character.
 *
 * `resolveAllGrantSources` sees ONLY the `character` half of the doc, so the
 * session's `activeFeatures` (while-active grants) and `grantBundleChoices`
 * (lineage / circle CHOICE bundles — Elven Lineage darkvision + granted spells +
 * resistances; Gnomish / Tiefling / Dragonborn / Goliath ancestries;
 * Circle-of-the-Land circle spells) must be threaded as `evaluateGrants`' 2nd and
 * 3rd arguments. A full-aggregate consumer that forgets the 3rd argument silently
 * drops the chosen lineage's grants — which is exactly why a picked Elven Lineage
 * never reached the Senses rail / combat header / roster summary / free-casts
 * (#90: darkvision stayed at the base 60 ft, granted spells never appeared).
 *
 * Routing EVERY full-aggregate call site through this single helper makes those
 * two arguments impossible to drop again. SoC-preserving: pure derivation over the
 * existing engine (views still only read + dispatch).
 */
import { evaluateGrants, type AggregatedGrants } from "@/lib/grants";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import {
  computeAC,
  computeACDetailed,
  effectiveAbilityScores,
  abilityAcBonus,
} from "@/lib/compute";
import { inferHpContributions } from "@/lib/character-infer";
import { getClasses, totalLevel } from "@/lib/classes";
import {
  abilityPart,
  locPart,
  breakdownTotal,
  type RawBreakdownPart,
} from "@/lib/value-breakdown";
import { srdText } from "@/lib/loc-text";
import { getEquipment } from "@/data/equipment";
import { CUSTOM_CONCENTRATION_PREFIX } from "@/lib/concentration";
import type { CharacterDoc } from "@/types/character";
import type { StoredConcentration } from "@/types/ids";

/** The session slices that feed sheet-wide grant aggregation. */
export type AggregationSession = Pick<
  CharacterDoc["session"],
  "activeFeatures" | "grantBundleChoices"
>;

/**
 * Aggregate every grant the character receives, threading the session's
 * while-active features AND chosen grant-bundle (lineage/circle) selections.
 * This is the canonical input for any sheet-wide derivation: senses, speeds,
 * resistances/immunities, ability-score floors, proficiencies, free-casts.
 */
export function aggregateCharacterGrants(
  character: CharacterDoc["character"],
  session: AggregationSession
): AggregatedGrants {
  return evaluateGrants(
    resolveAllGrantSources(character),
    new Set(session.activeFeatures ?? []),
    new Map(Object.entries(session.grantBundleChoices ?? {}))
  );
}

/**
 * S1 — the while-active chip keys a CONCENTRATION spell lights (Fly, Haste, Mage
 * Armor, Shield of Faith…). When concentration drops/swaps/breaks, the dropped
 * spell's `session.activeFeatures` chip must clear; this resolves WHICH keys to
 * clear from the dropped spell's STABLE ref — NEVER its English name (golden
 * rule 7).
 *
 * A {@link StoredConcentration} ref is the spell's bare srdId, which equals the
 * grant SOURCE id `resolveGrantSourcesForSpells` assigns a prepared spell-with-
 * grants (id = `spell.id`). So the dropped spell's standing while-active keys are
 * exactly the `activatableGroups` entries whose `sourceId` is that ref, read off
 * the grant's `key` (== the grant's `activeKey`) — the SAME single source the cast
 * path stamps. A "" (not concentrating) or a `custom:`-marked homebrew ref (no SRD
 * grant) yields [] — nothing to clear, correct by construction.
 */
export function activeKeysForConcentration(
  character: CharacterDoc["character"],
  session: AggregationSession,
  ref: StoredConcentration
): string[] {
  if (ref === "" || ref.startsWith(CUSTOM_CONCENTRATION_PREFIX)) return [];
  return aggregateCharacterGrants(character, session)
    .activatableGroups.filter((g) => g.sourceId === ref)
    .map((g) => g.key);
}

/**
 * Raw COMPUTED AC from an ALREADY-aggregated grant set (NO override applied) —
 * the ONE AC formula: `computeAC(equipment, effective-scores, …, grant AC-bonus)`.
 * The cockpit header shows this as the inline-edit "computed default" and resets
 * to it; {@link acFromAggregate} layers the override on top.
 */
export function computeCharacterAC(
  character: CharacterDoc["character"],
  agg: Pick<
    AggregatedGrants,
    | "abilityScoreFloors"
    | "itemAbilityScoreBonus"
    | "itemAbilityScoreCap"
    | "acBonusAbilities"
    | "acBonus"
    | "acFormulas"
  >
): number {
  const scores = effectiveAbilityScores(
    character.abilityScores,
    agg.abilityScoreFloors,
    agg.itemAbilityScoreBonus,
    agg.itemAbilityScoreCap
  );
  return computeAC(
    character.equipment,
    scores,
    getEquipment,
    character.features,
    abilityAcBonus(agg.acBonusAbilities, scores),
    // Flat feature/species AC bonus (Defense fighting style +1, a species
    // Integrated Protection, …). `computeAC` subtracts the equipped-item portion
    // it already counted and adds only the NON-equipment remainder, so this never
    // double-counts a Ring/Cloak of Protection. Previously dropped here, so a
    // feature flat AC bonus never reached the canonical (roster + cockpit) AC.
    agg.acBonus,
    // S7 — the ACTIVE while-active AC formulas (already gated to the buffs the
    // player has UP, since the evaluator only emits a `while-active` formula when
    // its key ∈ `session.activeFeatures`). Wires a lit Wild-Shape form (13 + WIS),
    // an active Mage Armor (13 + DEX), and a Barkskin floor (17) into the shown
    // AC. Previously dropped here, so a Moon form's AC never reached the cockpit/
    // roster. The override still wins upstream in {@link acFromAggregate}.
    agg.acFormulas
  );
}

/**
 * The per-source {@link RawBreakdownPart}s of a character's COMPUTED AC (NO
 * override applied) — the SAME `computeACDetailed` call as {@link
 * computeCharacterAC}, so `breakdownTotal(parts) === computeCharacterAC(...)` by
 * construction (golden rule 6). The cockpit AC medallion localizes these for
 * the breakdown tip; a manual `acOverride` upstream suppresses the tip (a
 * hand-pinned AC has no composition to explain — override-first).
 */
export function computeCharacterAcBreakdown(
  character: CharacterDoc["character"],
  agg: Pick<
    AggregatedGrants,
    | "abilityScoreFloors"
    | "itemAbilityScoreBonus"
    | "itemAbilityScoreCap"
    | "acBonusAbilities"
    | "acBonus"
    | "acFormulas"
  >
): RawBreakdownPart[] {
  const scores = effectiveAbilityScores(
    character.abilityScores,
    agg.abilityScoreFloors,
    agg.itemAbilityScoreBonus,
    agg.itemAbilityScoreCap
  );
  return computeACDetailed(
    character.equipment,
    scores,
    getEquipment,
    character.features,
    abilityAcBonus(agg.acBonusAbilities, scores),
    agg.acBonus,
    // S7 — same active formulas as {@link computeCharacterAC}, so the medallion
    // breakdown tip composes the SAME total the headline shows (rule 6): a lit
    // form reads "Form base 13 · +4 WIS", a Barkskin floor "AC floor 17".
    agg.acFormulas
  ).parts;
}

/**
 * Effective AC from an ALREADY-aggregated grant set — `acOverride ?? computed`.
 * The cockpit header passes the aggregate it already computed (no re-aggregation);
 * the save path uses {@link effectiveAC} which aggregates first. Both resolve to
 * the same number, so the cockpit's live AC and the persisted snapshot the roster
 * reads can never disagree (rule 6 — single source). Override-first.
 */
export function acFromAggregate(
  character: CharacterDoc["character"],
  agg: Pick<
    AggregatedGrants,
    | "abilityScoreFloors"
    | "itemAbilityScoreBonus"
    | "itemAbilityScoreCap"
    | "acBonusAbilities"
    | "acBonus"
    | "acFormulas"
  >
): number {
  return character.acOverride ?? computeCharacterAC(character, agg);
}

/**
 * Effective AC for a character (aggregates grants, then {@link acFromAggregate}).
 *
 * The single source for the denormalized `character.ac` snapshot, which the
 * auto-save stamps so the roster glance reads a fresh, grant-aware AC WITHOUT
 * importing the SRD-heavy grant engine.
 */
export function effectiveAC(
  character: CharacterDoc["character"],
  session: AggregationSession
): number {
  return acFromAggregate(character, aggregateCharacterGrants(character, session));
}

// ─── Max HP — the by-the-book composition (#95) ─────────────────────────────────

/**
 * The PER-LEVEL HP-grant sources a character carries, each as a NAMED part for the
 * by-the-book Max-HP breakdown tip: a `hp-per-level` grant (Tough +2/level, Hill
 * Dwarf's Dwarven Toughness +1/level, Draconic Sorcerer +1/level, an attuned Amulet
 * of Health …) contributes `amount × level`. Each part is a `loc`-labelled
 * {@link RawBreakdownPart} referencing the source's catalogue key (golden rule 6 —
 * the entity names itself, no bespoke term), so the tip reads "Tough +10" /
 * "Dwarven Toughness +5" in BOTH locales off the SAME catalogue the feat/trait
 * surfaces use. The origin/background-feat Tough slug taken at creation (not yet a
 * `features[]` ref) is folded in identically to {@link hpPerLevelGrantBonus}, so a
 * fresh L1+ Tough character's by-the-book max already includes it.
 *
 * NOTE: `hp-flat` grants (Draconic Resilience +3, Boon of Fortitude +40, a standing
 * Aid buff) are DELIBERATELY excluded here — they are NOT baked into the stored
 * `hp.max` (level-up only bakes core die+CON + `hp-per-level`), so they are the LIVE
 * transient deltas {@link effectiveMaxHp} folds on top of the stored base instead
 * (rule 6 — one source: the by-the-book base, then the effective delta). They reach
 * the breakdown tip via {@link effectiveMaxHpBreakdown} (mapped from the aggregate's
 * `hpFlatParts`).
 */
function hpPerLevelGrantParts(
  character: CharacterDoc["character"],
  level: number
): RawBreakdownPart[] {
  const parts: RawBreakdownPart[] = [];
  let toughViaFeature = false;
  for (const src of resolveAllGrantSources(character)) {
    if (!src.ref) continue;
    if (src.ref.kind === "feat" && src.ref.key === "tough") toughViaFeature = true;
    for (const g of src.grants ?? []) {
      const label = srdText(src.ref.kind, src.ref.key, "name");
      if (g.type === "hp-per-level" && g.amount !== 0) {
        parts.push(locPart(label, g.amount * level));
      }
    }
  }
  // Origin / background feat Tough taken at creation, before it is wrapped into a
  // `features[]` ref — the same fallback `hpPerLevelGrantBonus` applies, so the
  // computed max matches the stored one for a brand-new Tough character.
  if (
    !toughViaFeature &&
    (character.humanOriginFeat === "tough" || character.bgFeat === "tough")
  ) {
    parts.push(locPart(srdText("feat", "tough", "name"), 2 * level));
  }
  return parts;
}

/**
 * The COMPUTED, by-the-book max HP for a character (NO stored override applied) —
 * the by-the-rules average HP the level-up / creation / Bio-reconcile seams all
 * produce: {@link inferHpContributions} (per-class average hit dice + CON, RAW
 * per-level min-1 floored) PLUS every HP-grant (Tough / Dwarven Toughness / …).
 * Equals `breakdownTotal(computeCharacterMaxHpBreakdown(...))` by construction.
 * Returns the STORED `hp.max` when the primary class is unknown (a husk the engine
 * can't recompute), so a homebrew-class character is never shown a wrong default.
 */
export function computeCharacterMaxHp(character: CharacterDoc["character"]): number {
  const parts = computeCharacterMaxHpBreakdown(character);
  return parts.length > 0 ? breakdownTotal(parts) : character.hp.max;
}

/**
 * The per-source {@link RawBreakdownPart}s of a character's COMPUTED max HP for the
 * HP-max breakdown tip: one "Hit Dice" row per class (CON-free dice), one
 * "Constitution" row (CON × level, RAW floored), then one NAMED row per HP-grant.
 * `breakdownTotal(parts) === computeCharacterMaxHp(...)` by construction (golden
 * rule 6) — the headline a player sees IS the sum of the tip's rows. Returns `[]`
 * when the primary class is unknown (no composition the engine can vouch for); the
 * HP control then shows the plain stored max with no tip. The cockpit localizes
 * these for the tip and shows it ONLY when the stored max equals this computed max
 * (a hand-pinned max HP has no composition to explain — override-first, mirroring
 * how `acOverride` suppresses the AC tip).
 */
export function computeCharacterMaxHpBreakdown(
  character: CharacterDoc["character"]
): RawBreakdownPart[] {
  const classes = getClasses(character);
  const contributions = inferHpContributions(classes, character.abilityScores.CON);
  if (contributions.length === 0) return [];
  const level = totalLevel(character);
  const parts: RawBreakdownPart[] = [];
  // One CON-free "Hit Dice" row per class (named off the class catalogue, rule 7).
  for (const c of contributions) {
    if (c.dice !== 0) parts.push(locPart(srdText("class", c.classId, "name"), c.dice));
  }
  // One pooled Constitution row (CON × level, RAW per-level min-1 floored). The
  // ability-labelled part reads "CON +10" off the SAME short-name the AC/save/init
  // breakdowns use (golden rule 3) — no bespoke term key.
  const conTotal = contributions.reduce((sum, c) => sum + c.con, 0);
  if (conTotal !== 0) parts.push(abilityPart("CON", conTotal));
  // The named PER-LEVEL HP-grant rows (Tough / Dwarven Toughness / Draconic / items).
  // `hp-flat` grants (Draconic Resilience +3, Boon of Fortitude +40) are NOT here —
  // they are the live deltas {@link effectiveMaxHp} adds on top (rule 6).
  parts.push(...hpPerLevelGrantParts(character, level));
  return parts;
}

// ─── Effective max HP — stored by-the-book base + live transient deltas (D1) ─────

/**
 * The EFFECTIVE max HP every play surface clamps/heals/displays against:
 * `stored hp.max + aggregate.hpFlat`.
 *
 * Why a derivation, not a stored value (rule 6 — one source): the stored `hp.max`
 * IS the by-the-book base — die + CON + `hp-per-level` grants — and is exactly what
 * the level-up/creation/Bio-reconcile seams bake and what the player edits inline.
 * The `hp-flat` boons (Draconic Resilience +3, Boon of Fortitude +40, an attuned
 * hp-flat item) AND a standing Aid (`hp-flat:5` inside the spell's `while-active`
 * grant — lit only while its toggle is on) are the LIVE transient deltas that are
 * NEVER baked into stored max, so folding `agg.hpFlat` on read is the single correct
 * max. Without this, ~13 readers clamped against the stored base and silently
 * understated a Draconic Sorcerer (−3) / a Boon-of-Fortitude char (−40) / an Aided
 * character.
 *
 * Effective ≥ stored always (every delta is a non-negative boon), so a heal/clamp to
 * effective max can never reduce a character below their by-the-book max.
 */
export function effectiveMaxHp(
  character: CharacterDoc["character"],
  session: AggregationSession
): number {
  const agg = aggregateCharacterGrants(character, session);
  return character.hp.max + agg.hpFlat;
}

/**
 * The ONE Bloodied arithmetic (rule 6 — single source of truth): a character is
 * Bloodied iff `0 < currentHp ≤ ⌊effectiveMax / 2⌋` (2024 RAW). HP only — NOT
 * temporary HP. A degenerate `effectiveMax ≤ 0` is never Bloodied (the `> 0` band
 * test fails), and a character at 0 HP is DYING/unconscious — NOT Bloodied (the
 * dying surface owns the ≤ 0 band). BOTH the engine predicate `isBloodied`
 * (smart-tracker.ts) and the UI hook's `bloodied` mark (use-hp-controls.ts) call
 * THIS function over the EFFECTIVE max they already have in scope, so the two
 * derivations can never drift. Pure arithmetic — pass the already-resolved
 * effective max (via {@link effectiveMaxHp}) so callers share one max source too.
 */
export function bloodiedFromHp(currentHp: number, effectiveMax: number): boolean {
  return currentHp > 0 && currentHp <= Math.floor(effectiveMax / 2);
}

/**
 * The per-source {@link RawBreakdownPart}s of a character's EFFECTIVE max HP for the
 * breakdown tip: the by-the-book base rows ({@link computeCharacterMaxHpBreakdown})
 * PLUS each LIVE `hp-flat` boon/item/spell row — Draconic Resilience +3, Boon of
 * Fortitude +40, an attuned hp-flat item, and a standing Aid (its `hp-flat:5` inside
 * the spell's `while-active` grant, present iff the toggle is lit). These rows are
 * MAPPED from `agg.hpFlatParts` (the attribution stamped at the SAME seam `hpFlat`
 * accumulates), not re-walked over the grant sources — so they descend into
 * `while-active` EXACTLY as `hpFlat` does and `sum(parts) === agg.hpFlat`. Each part
 * localizes its source `ref` → NAME at this view edge (rule 6; the `ref` is an ID,
 * GR7). `breakdownTotal(parts) === effectiveMaxHp(...)` by construction WHEN the
 * stored max equals the by-the-book base (the gate the tip applies — a hand-pinned
 * max has no honest composition, override-first): `breakdownTotal(base) ===
 * character.hp.max` and `sum(hpFlatParts) === agg.hpFlat`, so the two sum to
 * `character.hp.max + agg.hpFlat === effectiveMaxHp(...)`. Returns `[]` when the
 * primary class is unknown (no composition the engine can vouch for).
 */
export function effectiveMaxHpBreakdown(
  character: CharacterDoc["character"],
  session: AggregationSession
): RawBreakdownPart[] {
  const base = computeCharacterMaxHpBreakdown(character);
  if (base.length === 0) return [];
  const agg = aggregateCharacterGrants(character, session);
  const flatParts = agg.hpFlatParts
    .filter((p) => p.amount !== 0)
    .map((p) => locPart(srdText(p.ref.kind, p.ref.key, "name"), p.amount));
  return [...base, ...flatParts];
}
