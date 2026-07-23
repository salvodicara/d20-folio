/**
 * D&D 2024 Calculations
 *
 * Pure functions for computing derived D&D values.
 * No dice rolling — only formulas and deterministic calculations.
 */

import type {
  AbilityCode,
  ClassId,
  CreatureSize,
  DamageType,
  ConditionId,
  WeaponAttackCantripData,
} from "@/data/types";
import { CREATURE_SIZE_ORDER } from "@/data/types";
import { appendAbilityModToDice } from "@/lib/utils";
// Ability modifier lives in the SRD-free `@/lib/ability` module so eager callers
// (the persistence-layer sanitizer) can use the formula without dragging compute's
// SRD deps; re-exported below so `from "@/lib/compute"` keeps resolving — one source.
import { abilityModifier } from "@/lib/ability";
import { attunementSatisfied } from "@/lib/attunement";
import {
  type RawBreakdownPart,
  breakdownTotal,
  termPart,
  abilityPart,
  locPart,
} from "@/lib/value-breakdown";
import { srdText } from "@/lib/loc-text";
import type {
  SrdEquipmentRef,
  CustomEquipment,
  SrdFeatureRef,
  CustomFeature,
} from "@/types/character";
import type { SrdEquipmentData, SrdClassTable, CompanionStatBlock } from "@/data/types";
import type { ProficiencyToken } from "@/types/ids";

/**
 * Calculate ability modifier from ability score (`floor((score - 10) / 2)`).
 *
 * Defined in the SRD-free `@/lib/ability` module (imported above) and re-exported
 * here so the eager sanitizer can import the formula without dragging compute's
 * SRD deps; every existing `from "@/lib/compute"` import keeps resolving — single
 * source of truth (golden rule 6).
 */
export { abilityModifier };

/**
 * Clamp an exhaustion level to the legal 0-6 range (6 = dead in 2024 rules).
 */
export function clampExhaustion(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(6, Math.floor(level)));
}

/**
 * D&D 2024 exhaustion penalty applied to every D20 Test (attack rolls, ability
 * checks, saving throws, initiative, and the passive scores derived from them).
 * −2 per exhaustion level. Does NOT apply to a spell save DC (the enemy rolls
 * that, not you). Returns a non-positive number to add to the bonus.
 */
export function exhaustionPenalty(level: number): number {
  const n = clampExhaustion(level);
  return n === 0 ? 0 : -2 * n;
}

/**
 * Compute AC from equipped armor + DEX modifier + shield + item bonuses.
 *
 * D&D 2024 rules:
 * - No armor: 10 + DEX mod
 * - Light armor: base + DEX mod
 * - Medium armor: base + DEX mod (max 2)
 * - Heavy armor: base (no DEX)
 * - Shield: +2 (or custom base for magic shields)
 * - Other equipped items with acBonus: all stack
 *
 * Only one armor and one shield can contribute at a time.
 *
 * Unarmored Defense (no body armor): Barbarian 10+DEX+CON, Monk 10+DEX+WIS,
 * Draconic Sorcerer / College of Dance 10+DEX+CHA — detected from `features`.
 *
 * @param equipment - character's equipment list
 * @param abilityScores - ability scores (DEX always; CON/WIS/CHA for Unarmored Defense)
 * @param resolveSrd - function to look up SRD equipment by ID
 * @param features - character features, used to detect Unarmored Defense
 * @param extraBonus - ability-keyed feature AC bonus (Bladesong +INT mod, …)
 * @param aggregateAcBonus - the aggregate's FLAT `acBonus` (`evaluateGrants(...).acBonus`)
 * @returns computed AC number
 */
export function computeAC(
  equipment: Array<SrdEquipmentRef | CustomEquipment>,
  abilityScores: Record<AbilityCode, number>,
  resolveSrd: (id: string) => SrdEquipmentData | undefined,
  features?: ReadonlyArray<SrdFeatureRef | CustomFeature>,
  // Feature-granted AC bonus NOT sourced from equipment (Bladesong +INT mod,
  // etc.) — passed in by the caller, which resolves ability mods + active-
  // feature gating via the grant pipeline. Kept out of the item-AC pass below
  // so it can never double-count an equipped item's bonus.
  extraBonus = 0,
  // The aggregate's FLAT `acBonus` (`evaluateGrants(...).acBonus`). This sums
  // BOTH equipped-magic-item flat bonuses (Ring/Cloak of Protection, +N armor)
  // AND non-equipment flat feature/species bonuses (a species integrated-
  // Protection +1, Defense fighting-style, etc.). The item portion is already
  // counted below from each equipped ref's `acBonus` field, so we subtract this
  // pass's own item total and add only the NON-equipment remainder — the
  // feature/species flat bonus that was previously dead. Defaults to 0 so
  // callers that don't pass it are behavior-preserving. See the regression
  // tests in `tests/unit/flat-feature-ac-bonus.test.ts`.
  aggregateAcBonus = 0,
  // The ACTIVE AC formulas from the evaluator (`evaluateGrants(...).acFormulas`),
  // already gated to the formulas whose source is ON: every `while-active`-wrapped
  // formula is present ONLY when its toggle key ∈ `session.activeFeatures` (the
  // evaluator recurses into a `while-active` block's grants solely when active),
  // so this carries exactly the buffs the player has up. Three condition kinds
  // route here, EACH honoured by its own rule (never a display name — rule 7):
  //   • `while-active`  → a self-contained beast-form total (Circle of the Moon
  //                       Circle Forms: AC = 13 + WIS). The form replaces the
  //                       body's stat block, so it ignores worn armor/shield and
  //                       competes for the MAX vs the normal AC.
  //   • `no-armor` /    → an Unarmored-Defense-style base set from an ACTIVE SPELL
  //     `no-armor-no-     (Mage Armor: 13 + DEX while unarmored). Joins the same
  //     shield`           highest-applicable selection the feature/item formulas
  //                       use, under the SAME armour/shield gate.
  //   • `always`        → an AC FLOOR that applies regardless of armor (Barkskin:
  //                       AC can't be < 17). Applied as `max(normalAC, base+mods)`.
  // (Class-feature/equipped-item formulas are ALSO resolved statically from
  // `features`/equipment below; an overlap is harmless — selection is a MAX, never
  // additive.) Defaults to `[]` so existing callers are behavior-preserving.
  activeAcFormulas: ReadonlyArray<AcFormula> = [],
  // Raised Medium-armor DEX-to-AC cap from the aggregate
  // (`evaluateGrants(...).mediumArmorDexCap`). `null` (the default) leaves the
  // RAW behaviour intact — Medium armor caps the DEX contribution at the SRD
  // item's `ac.maxDex` (2). When present, `cap` replaces that ceiling for
  // MEDIUM armor only, and only when the character's DEX SCORE is at least
  // `minDex` (Medium Armor Master → cap 3 at DEX 16+). Light armor (uncapped)
  // and Heavy armor (no DEX) are untouched. Defaults to `null` so existing
  // callers are behavior-preserving.
  mediumArmorDexCap: { cap: number; minDex: number } | null = null
): number {
  return computeACDetailed(
    equipment,
    abilityScores,
    resolveSrd,
    features,
    extraBonus,
    aggregateAcBonus,
    activeAcFormulas,
    mediumArmorDexCap
  ).ac;
}

/**
 * The structured AC computation — the SAME formula as {@link computeAC}, but it
 * records the per-source {@link RawBreakdownPart}s of the WINNING composition so
 * the cockpit can render the AC breakdown tip ("10 base · +2 DEX · +2 Shield").
 * `ac` equals `breakdownTotal(parts)` by construction (golden rule 6) — the
 * headline number IS the sum of the tip's lines. AC is a MAX over branches
 * (armor vs Unarmored-Defense formula vs a Wild-Shape form); `parts` describes
 * whichever branch WON, so it always explains the shown number.
 */
export function computeACDetailed(
  equipment: Array<SrdEquipmentRef | CustomEquipment>,
  abilityScores: Record<AbilityCode, number>,
  resolveSrd: (id: string) => SrdEquipmentData | undefined,
  features?: ReadonlyArray<SrdFeatureRef | CustomFeature>,
  extraBonus = 0,
  aggregateAcBonus = 0,
  activeAcFormulas: ReadonlyArray<AcFormula> = [],
  mediumArmorDexCap: { cap: number; minDex: number } | null = null
): { ac: number; parts: RawBreakdownPart[] } {
  const dexMod = abilityModifier(abilityScores.DEX);
  let bestArmorAC = 10 + dexMod; // default: no armor (10 + full DEX)
  let armorEquipped = false;
  let shieldBonus = 0;
  let itemBonuses = 0;
  // The base/DEX composition of the winning branch (for the tip). Default is
  // "no armor": base 10 + full DEX. When an armor piece WINS, these are replaced
  // with that armor's base and its (possibly capped) DEX contribution; a worn
  // armor that LOSES to the default leaves these untouched (see baseFromArmor).
  let baseValue = 10;
  let dexContribution = dexMod;
  let dexCapped = false;
  // Whether the WINNING base came from an equipped armor piece (vs the bare 10
  // default or a UD/item formula). Drives the base part's label: a worn armor
  // whose effective AC is BEATEN by 10 + high DEX leaves the 10 default winning,
  // so the part must read "Base 10", not "Armor 10" (F7 — label correctness).
  let baseFromArmor = false;

  // The effective Medium-armor DEX ceiling: the override `cap` when one is
  // active AND the DEX score gate is met, else the armor's own `maxDex`. Light
  // armor (no `maxDex`) stays uncapped; the override never widens it.
  const effectiveMediumDexCap = (armorMaxDex: number): number =>
    mediumArmorDexCap !== null && abilityScores.DEX >= mediumArmorDexCap.minDex
      ? Math.max(armorMaxDex, mediumArmorDexCap.cap)
      : armorMaxDex;

  for (const item of equipment) {
    if (!item.equipped) continue;
    // Attunement gating (RAW 2024): items that require attunement only grant
    // their bonuses while the player is actually attuned. The requirement comes
    // from the SRD magic-item data (`attunement: true`), so a minimally-stored
    // ref with `attuned: undefined` on an attunement-required item is inert
    // (issue #37) — the SAME `attunementSatisfied` gate the grant seam uses.
    // Base armor / shield AC always counts (you can still WEAR a +1 plate
    // without attuning — the +1 is the magical bonus, not the base, but the
    // structural plate still gives 18 AC); only the additive `acBonus` is gated.
    const requiresAttunementButNotAttuned = !attunementSatisfied(item);

    // Resolve one worn armor's effective AC + its base/DEX composition (so the
    // breakdown tip can show "Armor 14 · +2 DEX" instead of a bare total). Pure —
    // the inline best-tracking below records it when it wins (kept inline so the
    // `armorEquipped` flag narrows for the formula branch).
    const armorComposition = (
      base: number,
      category: "light" | "medium" | "heavy",
      ac: { dexBonus?: boolean; maxDex?: number | null }
    ): { effective: number; base: number; dexPart: number; capped: boolean } => {
      let dexPart = 0;
      let capped = false;
      if (ac.dexBonus) {
        if (ac.maxDex != null) {
          const cap =
            category === "medium" ? effectiveMediumDexCap(ac.maxDex) : ac.maxDex;
          dexPart = Math.min(dexMod, cap);
          capped = dexMod > cap;
        } else {
          dexPart = dexMod;
        }
      }
      return { effective: base + dexPart, base, dexPart, capped };
    };

    if ("custom" in item) {
      if (item.armorCategory === "shield") {
        shieldBonus = Math.max(shieldBonus, item.ac?.base ?? 2);
      } else if (item.ac && item.armorCategory) {
        const c = armorComposition(item.ac.base, item.armorCategory, item.ac);
        if (c.effective > bestArmorAC) {
          bestArmorAC = c.effective;
          baseValue = c.base;
          dexContribution = c.dexPart;
          dexCapped = c.capped;
          baseFromArmor = true;
        }
        armorEquipped = true;
      }
      if (item.acBonus && !requiresAttunementButNotAttuned) {
        itemBonuses += item.acBonus;
      }
    } else if ("srdId" in item) {
      // MAGIC-ITEMS — an SRD-referenced item may carry a per-character
      // acBonus (Ring/Cloak of Protection, +1 armor, etc.) that stacks on
      // top of any base armor + shield contribution.
      if (item.acBonus && !requiresAttunementButNotAttuned) {
        itemBonuses += item.acBonus;
      }
      const srd = resolveSrd(item.srdId);
      if (!srd?.ac || !srd.armorCategory) continue;

      if (srd.armorCategory === "shield") {
        shieldBonus = Math.max(shieldBonus, srd.ac.base);
      } else {
        const c = armorComposition(srd.ac.base, srd.armorCategory, srd.ac);
        if (c.effective > bestArmorAC) {
          bestArmorAC = c.effective;
          baseValue = c.base;
          dexContribution = c.dexPart;
          dexCapped = c.capped;
          baseFromArmor = true;
        }
        armorEquipped = true;
      }
    }
  }

  // Unarmored Defense (Barbarian / Monk / Draconic Sorcery / Dance Bard) AND
  // worn-item AC formulas (Robe of the Archmagi: "if you aren't wearing armor,
  // your base AC is 15 + DEX"). Each feature OR equipped magic item declares a
  // declarative `{ type: "ac-formula", ... }` grant; we pick the HIGHEST result
  // among the conditions that hold (no armor, and optionally no shield). This
  // lets any future class feature OR magic item opt in by declaring the grant.
  // The ability-mod composition of a winning Unarmored-Defense formula (so the
  // tip shows "13 base · +2 DEX · +3 WIS" for a Monk). Empty unless a formula won.
  let formulaAbilities: AbilityCode[] = [];
  if (!armorEquipped) {
    let bestFormulaAC = bestArmorAC;
    const formulaGrants: Array<Extract<Grant, { type: "ac-formula" }>> = [];
    for (const f of features ?? []) {
      if (!("srdId" in f)) continue;
      formulaGrants.push(...resolveAcFormulaGrants(f.srdId));
    }
    // Equipped + attunement-satisfied magic items (same gate as the item-AC
    // pass above and the equipment → grant seam): a worn Robe of the Archmagi
    // contributes its base-AC formula like an Unarmored-Defense feature.
    for (const item of equipment) {
      if (!item.equipped || "custom" in item || !("srdId" in item)) continue;
      if (!attunementSatisfied(item)) continue; // attunement-required, not yet attuned
      formulaGrants.push(...resolveItemAcFormulaGrants(item.srdId));
    }
    // ACTIVE-SPELL unarmored formulas (Mage Armor: 13 + DEX, `no-armor`). They
    // reach the aggregate ONLY while the spell's toggle is on, so they belong in
    // the SAME highest-applicable selection as the feature/item formulas. The
    // `always` floors (Barkskin) are handled below — they apply even with armor —
    // so only the unarmored conditions join here; selection is a MAX so a spell
    // formula that overlaps a class one (none today) can't double-count.
    for (const g of activeAcFormulas) {
      if (g.condition === "no-armor" || g.condition === "no-armor-no-shield") {
        formulaGrants.push({
          type: "ac-formula",
          base: g.base,
          bonuses: g.bonuses,
          condition: g.condition,
        });
      }
    }
    for (const g of formulaGrants) {
      // Condition gate: "always" always applies; "no-armor" applies (we
      // already know !armorEquipped); "no-armor-no-shield" needs to skip
      // the shield bonus.
      if (g.condition === "no-armor-no-shield" && shieldBonus > 0) continue;
      let candidate = g.base;
      for (const ability of g.bonuses) {
        candidate += abilityModifier(abilityScores[ability]);
      }
      if (candidate > bestFormulaAC) {
        bestFormulaAC = candidate;
        baseValue = g.base;
        dexContribution = 0;
        dexCapped = false;
        formulaAbilities = [...g.bonuses];
      }
    }
    bestArmorAC = bestFormulaAC;
  }

  // Flat NON-equipment AC bonus (a species protection trait +1, Defense
  // fighting style, …). `aggregateAcBonus` also contains the equipped magic
  // items' flat bonuses, which `itemBonuses` already counted above — subtract
  // them so each item bonus lands exactly once. Clamp at 0 so an item bonus
  // that's gated OUT here (e.g. unattuned, so it's in the aggregate but NOT in
  // `itemBonuses`) can never push the feature remainder negative.
  const featureFlatBonus = Math.max(0, aggregateAcBonus - itemBonuses);

  const normalAC =
    bestArmorAC + shieldBonus + itemBonuses + extraBonus + featureFlatBonus;

  // Self-contained ACTIVE-formula totals that COMPETE with (don't add onto) the
  // normal AC — the engine takes the MAX, so each only wins when it beats the
  // body's AC (the player's manual `acOverride` upstream still wins — override-
  // first). Two condition kinds qualify, both armor-independent:
  //   • `while-active` — a Wild-Shape form total (Circle of the Moon: 13 + WIS).
  //     The form replaces the body's stat block, so armor/shield/item bonuses
  //     don't apply. RAW "…if that total is higher than the Beast's AC".
  //   • `always` — an AC FLOOR (Barkskin: AC can't be < 17, "regardless of what
  //     armor you are wearing"). Same max-vs-normal selection: it lifts a lower
  //     AC to the floor and is a no-op once the normal AC already exceeds it.
  // (`no-armor`/`no-armor-no-shield` are NOT here — they joined the unarmored
  // selection above, under the armour gate.) Each candidate's parts are self-
  // contained so `breakdownTotal(parts) === ac` holds for the winning branch.
  let formAC = 0;
  let formParts: RawBreakdownPart[] = [];
  for (const g of activeAcFormulas) {
    if (g.condition !== "while-active" && g.condition !== "always") continue;
    let candidate = g.base + g.shieldBonus;
    for (const ability of g.bonuses) {
      candidate += abilityModifier(abilityScores[ability]);
    }
    if (candidate > formAC) {
      formAC = candidate;
      // A `while-active` form sets a "Form base"; an `always` floor (Barkskin)
      // reads as an "AC floor" so the tip explains WHY the AC jumped to 17.
      const baseTerm =
        g.condition === "always" ? "breakdown.ac.floor" : "breakdown.ac.formBase";
      formParts = [termPart(baseTerm, g.base)];
      if (g.shieldBonus > 0) formParts.push(termPart("equipment.shield", g.shieldBonus));
      for (const ability of g.bonuses) {
        formParts.push(abilityPart(ability, abilityModifier(abilityScores[ability])));
      }
    }
  }

  if (formAC > normalAC) return { ac: formAC, parts: formParts };

  // Compose the WINNING normal-branch parts. base + DEX (capped note when
  // reduced) + any UD formula abilities + shield + item bonuses + feature flat +
  // ability-mod extra. Each is a labelled part; their sum IS `normalAC`.
  const parts: RawBreakdownPart[] = [
    // F7 — label the base by whether the WINNING base actually came from worn
    // armor. A worn armor whose effective AC loses to 10 + high DEX leaves the
    // 10 default winning, so it reads "Base 10", not "Armor 10".
    termPart(baseFromArmor ? "equipment.armor" : "breakdown.base", baseValue),
  ];
  // Show DEX whenever it contributes, or as the explicit +0 in the bare
  // "10 + DEX" default (a 0-DEX commoner still reads "10 base · +0 DEX"). A
  // Unarmored-Defense formula owns its own abilities (DEX among them), so the
  // DEX row is suppressed there to avoid double-listing.
  if (formulaAbilities.length === 0 && (dexContribution !== 0 || !armorEquipped)) {
    parts.push(
      abilityPart(
        "DEX",
        dexContribution,
        dexCapped ? { term: "breakdown.ac.capped" } : undefined
      )
    );
  }
  for (const ability of formulaAbilities) {
    parts.push(abilityPart(ability, abilityModifier(abilityScores[ability])));
  }
  if (shieldBonus > 0) parts.push(termPart("equipment.shield", shieldBonus));
  if (itemBonuses !== 0) parts.push(termPart("breakdown.ac.magic", itemBonuses));
  if (featureFlatBonus !== 0)
    parts.push(termPart("breakdown.featureBonus", featureFlatBonus));
  if (extraBonus !== 0) parts.push(termPart("breakdown.featureBonus", extraBonus));

  return { ac: breakdownTotal(parts), parts };
}

/**
 * Resolve the feature-granted ability-modifier AC bonus (Bladesong: +INT mod,
 * min 1) from the aggregate's `acBonusAbilities`, against the effective scores.
 * Each entry contributes `max(abilityModifier(ability), min)`. Pass the result
 * as `computeAC`'s `extraBonus`. Returns 0 when there are none (so AC is
 * unchanged for everyone without such a feature).
 */
export function abilityAcBonus(
  acBonusAbilities: ReadonlyArray<{ ability: AbilityCode; min: number }>,
  abilityScores: Record<AbilityCode, number>
): number {
  let total = 0;
  for (const { ability, min } of acBonusAbilities) {
    total += Math.max(abilityModifier(abilityScores[ability]), min);
  }
  return total;
}

// Lazy import — keeps the module-load graph shallow. `classFeatureIndex`
// is the only place ac-formula grants currently live (Barbarian / Monk
// UD + Draconic Resilience + Dance Bard Dazzling Footwork).
import type {
  AcFormula,
  AggregatedGrants,
  CantripDamageBonusEntry,
  CantripEffectRiderEntry,
  CantripRangeBonusEntry,
  FamiliarEnhancement,
  Grant,
  SpellDamageBonusEntry,
  SpellDieAugmentEntry,
  HealBonusEntry,
  SpellDamageTypeOverrideEntry,
  ComponentWaiverEntry,
} from "@/lib/grants";
import { classFeatureIndex as _classFeatureIndex } from "@/data/classes";
import { getMagicItem as _getMagicItem } from "@/data/magic-items";
// Local binding for compute.ts's own callers (e.g. effectiveProficiencyBonus);
// also re-exported below so `from "@/lib/compute"` keeps resolving (single source).
import { proficiencyBonus } from "@/lib/proficiency";
// Skill catalog lives in the SRD-free skills module; imported for compute's own
// helpers and re-exported (see ALL_SKILLS/skillNameToId export below).
import { ALL_SKILLS, skillNameToId } from "@/lib/skills";
function resolveAcFormulaGrants(
  srdId: string
): Array<Extract<Grant, { type: "ac-formula" }>> {
  const feature = _classFeatureIndex.get(srdId);
  const out: Array<Extract<Grant, { type: "ac-formula" }>> = [];
  for (const g of feature?.grants ?? []) {
    if (g.type === "ac-formula") out.push(g);
  }
  return out;
}

// Worn-item AC formulas (Robe of the Archmagi). Mirrors `resolveAcFormulaGrants`
// but resolves against the magic-item index so an equipped, attuned item's
// `ac-formula` grant participates in the highest-applicable AC selection.
function resolveItemAcFormulaGrants(
  srdId: string
): Array<Extract<Grant, { type: "ac-formula" }>> {
  const item = _getMagicItem(srdId);
  const out: Array<Extract<Grant, { type: "ac-formula" }>> = [];
  for (const g of item?.grants ?? []) {
    if (g.type === "ac-formula") out.push(g);
  }
  return out;
}

/**
 * M7 — Derive structured senses from a character's features (race traits +
 * feats). Currently surfaces Darkvision range in feet by scanning race-trait
 * descriptions; returns null when no Darkvision trait is present.
 *
 * Reads the EN description because the SRD entries consistently say
 * "Darkvision with a range of N feet" — locale-independent number extraction.
 */
// A4 Phase 8 — deriveSenses and deriveResistances DELETED. Replaced by the
// declarative grants pipeline: race traits / feats / class features now
// carry `grants: [{ type: "darkvision" | "damage-resistance", ... }]` data;
// consumers call `evaluateGrants(sources)` and read the aggregated view.
// See `src/lib/grants.ts` and the Phase 2 / Phase 3 parity tests for the
// migration record.

/**
 * H6 — Concentration save DC when the caster takes damage (2024 RAW):
 * DC = max(10, floor(damage / 2)). Returns 0 for non-positive damage so
 * the caller can short-circuit (no save when HP didn't drop).
 */
export function concentrationSaveDc(damage: number): number {
  if (!Number.isFinite(damage) || damage <= 0) return 0;
  return Math.max(10, Math.floor(damage / 2));
}

/** How a single Death Saving Throw d20 result resolves (2024 RAW). */
export type DeathSaveResult =
  /** Natural 1 — counts as TWO failures. */
  | "two-failures"
  /** 2–9 — one failure. */
  | "failure"
  /** 10–(threshold−1) — one success. */
  | "success"
  /** `threshold`–20 — counts as a natural 20: regain 1 HP, back to consciousness. */
  | "natural-twenty";

/**
 * Resolve a Death Saving Throw's *natural d20 result* against the character's
 * effective death-save crit range (2024 RAW). NO RNG — the caller passes the
 * already-rolled d20 face; this is pure interpretation.
 *
 * RAW:
 *  - Natural 1 → two failures.
 *  - 2–9 → one failure.
 *  - 10–19 → one success.
 *  - Natural 20 → regain 1 HP and return to consciousness.
 *
 * Champion Survivor's "Defy Death" lowers the threshold at which a roll counts
 * as a natural 20: a Champion of level 18+ treats an 18, 19, or 20 as a 20.
 * That lowered threshold lives on `evaluateGrants(...).deathSaveCritThreshold`
 * (default 20; the most generous source wins). This consumer reads it so the
 * "natural 20" band widens automatically once the grant is present.
 *
 * `deathSaveCritThreshold` is clamped to the legal 2–20 range so a malformed
 * grant can never collapse the success/failure bands. The Advantage half of
 * Defy Death is handled separately via the `advantage-on` save primitive — this
 * helper only models the "18-20 = 20" rule.
 */
export function deathSaveOutcome(
  d20: number,
  deathSaveCritThreshold = 20
): DeathSaveResult {
  const threshold = Math.max(2, Math.min(20, Math.floor(deathSaveCritThreshold)));
  const face = Math.floor(d20);
  if (face <= 1) return "two-failures";
  if (face >= threshold) return "natural-twenty";
  if (face <= 9) return "failure";
  return "success";
}

/** Armor `armorCategory` enum → the {@link ProficiencyToken} prefix that grants it.
 *  A proficiency token matches a category iff it STARTS with this prefix, so
 *  `medium-armor` AND `medium-armor-non-metal` both grant `"medium"` (the app does
 *  not model the metal restriction mechanically — it is display-only). */
const ARMOR_CATEGORY_TOKEN_PREFIX: Readonly<
  Record<"light" | "medium" | "heavy" | "shield", string>
> = {
  light: "light-armor",
  medium: "medium-armor",
  heavy: "heavy-armor",
  shield: "shields",
};

/**
 * Whether a class is proficient with armor of the given category.
 *
 * `classArmorProficiencies` are {@link ProficiencyToken} ids (`light-armor`,
 * `medium-armor-non-metal`, `shields`); the armor's `armorCategory` is the
 * normalised enum (`"light" | "medium" | "heavy" | "shield"`). A token matches iff
 * it starts with the category's token prefix, so the `(non-metal)` restricted
 * variants still grant their base category.
 */
export function isArmorProficient(
  armorCategory: "light" | "medium" | "heavy" | "shield" | undefined,
  classArmorProficiencies: ReadonlyArray<ProficiencyToken>
): boolean {
  if (!armorCategory) return true; // not armor → not gated
  const prefix = ARMOR_CATEGORY_TOKEN_PREFIX[armorCategory];
  return classArmorProficiencies.some((p) => p.startsWith(prefix));
}

/**
 * Whether the character is currently wearing Heavy armor — the gate for the
 * `no-heavy-armor` conditional speed grant (Ranger Roving's +10 only applies
 * "while you aren't wearing Heavy armor"). True iff any equipped SRD item has
 * `armorCategory === "heavy"`. Custom/homebrew armor carries the normalised
 * `armorCategory` enum inline (no SRD lookup needed), so it's honoured too.
 *
 * Mirrors `computeAC`'s equipped-resolve loop so they always agree about what
 * counts as "worn". Pure / deterministic.
 */
export function isHeavyArmorEquipped(
  equipment: Array<SrdEquipmentRef | CustomEquipment>,
  resolveSrd: (id: string) => SrdEquipmentData | undefined
): boolean {
  for (const item of equipment) {
    if (!item.equipped) continue;
    const category =
      "custom" in item ? item.armorCategory : resolveSrd(item.srdId)?.armorCategory;
    if (category === "heavy") return true;
  }
  return false;
}

/**
 * RA-17 — SRD "Properties — Heavy": a Heavy weapon imposes Disadvantage on
 * attack rolls when the wielder's relevant EFFECTIVE score is below 13 —
 * Strength for a Melee weapon, Dexterity for a Ranged one. Pure read-out; a
 * non-Heavy weapon (or a relevant score >= 13) returns false. The caller passes
 * the already-computed `isHeavy` / `isRanged` flags and the EFFECTIVE scores
 * (set-score item floors already folded in), so a Gauntlets-of-Ogre-Power STR 19
 * suppresses the note despite a low base score.
 */
export function heavyWeaponDisadvantage(
  isHeavy: boolean,
  isRanged: boolean,
  scores: Record<AbilityCode, number>
): boolean {
  if (!isHeavy) return false;
  return isRanged ? scores.DEX < 13 : scores.STR < 13;
}

/**
 * Calculate proficiency bonus from character level.
 * Levels 1-4: +2, 5-8: +3, 9-12: +4, 13-16: +5, 17-20: +6
 *
 * Defined in the SRD-free `@/lib/proficiency` module (imported above) and
 * re-exported here so the roster glance can import the formula without dragging
 * `compute.ts`'s SRD deps; every existing `from "@/lib/compute"` import keeps
 * resolving — single source.
 */
export { proficiencyBonus };

/**
 * Resolve the character's *effective* proficiency bonus.
 *
 * Centralizes the "override beats class table" rule so every D20-Test math
 * helper picks up the same value. Previously each compute helper hard-coded
 * `proficiencyBonus(level)` and silently ignored `proficiencyBonusOverride`,
 * so a player who raised PB by hand still saw the un-overridden spell save
 * DC, spell attack bonus, weapon attack bonus, saves, skills and passive
 * scores. The helpers now accept an explicit `pbOverride` (passed by every
 * sheet caller); tests can call without it for the pure formula.
 */
export function effectiveProficiencyBonus(
  level: number,
  override?: number | null
): number {
  return override ?? proficiencyBonus(level);
}

/**
 * Calculate spell save DC.
 * Formula: 8 + proficiency bonus + spellcasting ability modifier
 */
export function spellSaveDC(
  level: number,
  abilityScore: number,
  override?: number | null,
  pbOverride?: number | null
): number {
  if (override != null) return override;
  return 8 + effectiveProficiencyBonus(level, pbOverride) + abilityModifier(abilityScore);
}

/**
 * Calculate spell attack bonus.
 * Formula: proficiency bonus + spellcasting ability modifier
 */
export function spellAttackBonus(
  level: number,
  abilityScore: number,
  override?: number | null,
  exhaustion = 0,
  pbOverride?: number | null
): number {
  const base =
    override != null
      ? override
      : effectiveProficiencyBonus(level, pbOverride) + abilityModifier(abilityScore);
  return base + exhaustionPenalty(exhaustion);
}

/**
 * The character's EFFECTIVE spell save DC — the pure base plus the grant-derived
 * casting bump, with the bump folded under the override-first rule. This is the
 * single seam every "spell save DC" surface routes through (the cockpit spell
 * card, the cast summary, the combat resolver, the breakdown guard), so the
 * `spellSaveDC(...) + (override != null ? 0 : castingModifier)` composition lives
 * in ONE place — mirrors how `savingThrowBonus` folds `saveBonus` (golden rule 6).
 *
 * A manual `override` pins the WHOLE number (override-first), so the casting bump
 * is skipped on that path; with no override the bump is added to the base.
 */
export function effectiveSpellSaveDc(
  level: number,
  abilityScore: number,
  castingModifier: number,
  override?: number | null,
  pbOverride?: number | null
): number {
  return (
    spellSaveDC(level, abilityScore, override, pbOverride) +
    (override != null ? 0 : castingModifier)
  );
}

/**
 * The character's EFFECTIVE spell attack bonus — the pure base plus the grant-
 * derived casting bump, folded under the override-first rule (the attack twin of
 * {@link effectiveSpellSaveDc}). The single seam every "spell attack bonus"
 * surface routes through; `spellAttackBonus` already folds the exhaustion penalty
 * into the base, so this only adds the override-gated `castingModifier`.
 */
export function effectiveSpellAttackBonus(
  level: number,
  abilityScore: number,
  castingModifier: number,
  override?: number | null,
  exhaustion = 0,
  pbOverride?: number | null
): number {
  return (
    spellAttackBonus(level, abilityScore, override, exhaustion, pbOverride) +
    (override != null ? 0 : castingModifier)
  );
}

/**
 * Resolve the grant-derived bump to the spell save DC or spell attack bonus
 * (the `spell-save-dc-bonus` / `spell-attack-bonus` kinds — Rod of the Pact
 * Keeper +N, Robe of the Archmagi +2, Sorcerer "+1 to your Sorcerer spells").
 * Sums every entry whose `scope` is `"all"` or matches the casting class.
 * Pure; the consumer adds it ONLY when no manual override is set
 * (override-first — an override replaces the whole number). Previously
 * aggregated but never consumed (AX exposure audit).
 */
export function resolveCastingModifier(
  entries: ReadonlyArray<{ amount: number; scope: string }>,
  classId?: string | null
): number {
  let total = 0;
  for (const e of entries) {
    if (e.scope === "all" || (classId != null && e.scope === classId)) {
      total += e.amount;
    }
  }
  return total;
}

/**
 * The per-source parts of the spell SAVE DC for the breakdown tip
 * ("8 base · +4 PB · +3 WIS"). 8 + PB + spellcasting-ability mod + the resolved
 * `spell-save-dc-bonus` grant total (Rod of the Pact Keeper, etc.). Returns
 * `null` when a manual `override` pins the DC (a hand-set number has no
 * composition to explain — override-first). `breakdownTotal` equals
 * `spellSaveDC(...) + castingModifier` by construction; the guard pins it.
 */
export function buildSpellSaveDcBreakdown(args: {
  level: number;
  abilityScore: number;
  ability: AbilityCode;
  pbOverride?: number | null;
  override?: number | null;
  castingModifier?: number;
}): RawBreakdownPart[] | null {
  if (args.override != null) return null;
  const parts: RawBreakdownPart[] = [
    termPart("breakdown.base", 8),
    termPart(
      "character.proficiencyBonus",
      effectiveProficiencyBonus(args.level, args.pbOverride)
    ),
    abilityPart(args.ability, abilityModifier(args.abilityScore)),
  ];
  if (args.castingModifier)
    parts.push(termPart("breakdown.spell.bonus", args.castingModifier));
  return parts;
}

/**
 * The per-source parts of the spell ATTACK bonus for the breakdown tip
 * ("+4 PB · +3 WIS"). PB + spellcasting-ability mod + the `spell-attack-bonus`
 * grant total + the exhaustion penalty. `null` under a manual `override`.
 */
export function buildSpellAttackBreakdown(args: {
  level: number;
  abilityScore: number;
  ability: AbilityCode;
  pbOverride?: number | null;
  override?: number | null;
  castingModifier?: number;
  exhaustion?: number;
}): RawBreakdownPart[] | null {
  if (args.override != null) return null;
  const parts: RawBreakdownPart[] = [
    termPart(
      "character.proficiencyBonus",
      effectiveProficiencyBonus(args.level, args.pbOverride)
    ),
    abilityPart(args.ability, abilityModifier(args.abilityScore)),
  ];
  if (args.castingModifier)
    parts.push(termPart("breakdown.spell.bonus", args.castingModifier));
  const exPenalty = exhaustionPenalty(args.exhaustion ?? 0);
  if (exPenalty !== 0) parts.push(termPart("character.exhaustion", exPenalty));
  return parts;
}

/**
 * Calculate weapon attack bonus.
 * Formula: proficiency bonus + ability modifier (+ magic bonus if any)
 */
export function weaponAttackBonus(
  level: number,
  abilityScore: number,
  isProficient: boolean,
  override?: number | null,
  exhaustion = 0,
  pbOverride?: number | null
): number {
  const pb = isProficient ? effectiveProficiencyBonus(level, pbOverride) : 0;
  const base = override != null ? override : pb + abilityModifier(abilityScore);
  return base + exhaustionPenalty(exhaustion);
}

/**
 * Calculate saving throw bonus.
 * Formula: ability modifier + (proficiency bonus if proficient)
 * Override takes precedence if provided.
 */
export function savingThrowBonus(
  abilityScore: number,
  level: number,
  isProficient: boolean,
  override?: number | null,
  exhaustion = 0,
  pbOverride?: number | null,
  /**
   * Flat grant-derived bonus applied to all saves (e.g. Paladin Aura of
   * Protection = max(CHA mod, 1)). Already resolved by the caller against the
   * character's scores. Skipped when the player has set a manual `override`.
   */
  saveBonus = 0
): number {
  const mod = abilityModifier(abilityScore);
  const pb = effectiveProficiencyBonus(level, pbOverride);
  const base = override != null ? override : (isProficient ? mod + pb : mod) + saveBonus;
  return base + exhaustionPenalty(exhaustion);
}

/**
 * The per-source parts of a saving throw for the breakdown tip
 * ("+3 CON · +4 PB · +5 Aura"). Ability mod + PB (when proficient) + the
 * resolved per-save grant bonus (Paladin Aura of Protection) + exhaustion.
 * Returns `null` under a manual `override` (override-first). `breakdownTotal`
 * equals `savingThrowBonus(...)` by construction (the guard pins it). A
 * single-component save (not proficient, no bonus, no exhaustion) returns one
 * part — the consumer suppresses the tip then (golden rule 19).
 */
export function buildSaveBreakdown(args: {
  ability: AbilityCode;
  abilityScore: number;
  level: number;
  isProficient: boolean;
  override?: number | null;
  exhaustion?: number;
  pbOverride?: number | null;
  saveBonus?: number;
}): RawBreakdownPart[] | null {
  if (args.override != null) return null;
  const parts: RawBreakdownPart[] = [
    abilityPart(args.ability, abilityModifier(args.abilityScore)),
  ];
  if (args.isProficient) {
    parts.push(
      termPart(
        "character.proficiencyBonus",
        effectiveProficiencyBonus(args.level, args.pbOverride)
      )
    );
  }
  if (args.saveBonus) parts.push(termPart("breakdown.featureBonus", args.saveBonus));
  const exPenalty = exhaustionPenalty(args.exhaustion ?? 0);
  if (exPenalty !== 0) parts.push(termPart("character.exhaustion", exPenalty));
  return parts;
}

/**
 * Resolve the grant-derived saving-throw bonus that applies to ONE specific
 * save (the `saveAbility`), against the character's effective scores. This is
 * the number a caller feeds into `savingThrowBonus`'s `saveBonus` argument.
 *
 * Sums three layers from the aggregate:
 *   1. `saveBonusFlat` — flat all-saves bonus.
 *   2. `saveBonusAbilities` — all-saves ability-modifier bonuses, each
 *      `max(abilityModifier(ability), min)` (Paladin Aura of Protection).
 *   3. `saveBonusByAbility` — per-ability-SCOPED bonuses, but ONLY the entries
 *      whose `appliesToSave` equals `saveAbility` (Circle of the Moon Improved
 *      Circle Forms "Increased Toughness": +WIS mod to CON saves only). Each
 *      scoped entry contributes `max(abilityModifier(ability), min)` when an
 *      `ability` is set, otherwise its flat `amount`.
 *
 * Because the scoped layer is gated on `saveAbility`, a Wild-Shape Druid's CON
 * save gains +WIS while their STR / DEX / etc. saves do not. The scoped grant
 * only reaches the aggregate while the wrapping `while-active` toggle is on, so
 * an inactive Wild Shape contributes nothing here.
 *
 * Pure — the caller passes the aggregate + scores; no character context.
 */
export function resolveSaveBonus(
  aggregate: Pick<
    AggregatedGrants,
    "saveBonusFlat" | "saveBonusAbilities" | "saveBonusByAbility"
  >,
  abilityScores: Record<AbilityCode, number>,
  saveAbility: AbilityCode
): number {
  let total = aggregate.saveBonusFlat;
  for (const { ability, min } of aggregate.saveBonusAbilities) {
    total += Math.max(abilityModifier(abilityScores[ability]), min);
  }
  for (const entry of aggregate.saveBonusByAbility) {
    if (entry.appliesToSave !== saveAbility) continue;
    if (entry.ability) {
      total += Math.max(abilityModifier(abilityScores[entry.ability]), entry.min);
    } else {
      total += entry.amount;
    }
  }
  return total;
}

/**
 * The flat, all-saves grant bonus a display surface folds into EVERY medallion
 * once (the LeftHud + the PDF VM): the `saveBonusFlat` layer plus the
 * `saveBonusAbilities` layer (Paladin Aura of Protection +CHA), each resolved
 * `max(abilityModifier(ability), min)` against the SAME effective scores the
 * base save modifier uses (B8 — a CHA-boosting item raises it; RAW 2024).
 *
 * The single home of the reduce both surfaces used to hand-roll (rule 6): one
 * fix flows everywhere and they can't drift. Distinct from `resolveSaveBonus`,
 * which ALSO folds the per-save-SCOPED `saveBonusByAbility` layer for one named
 * save — this helper is the save-AGNOSTIC slice shared by every medallion.
 *
 * Pure — the caller passes the aggregate slice + effective scores.
 */
export function flatSaveBonus(
  aggregate: Pick<AggregatedGrants, "saveBonusFlat" | "saveBonusAbilities">,
  effectiveScores: Record<AbilityCode, number>
): number {
  return aggregate.saveBonusAbilities.reduce(
    (sum, b) => sum + Math.max(abilityModifier(effectiveScores[b.ability]), b.min),
    aggregate.saveBonusFlat
  );
}

/**
 * Resolve the grant-derived bonus added to a Constitution saving throw made to
 * MAINTAIN CONCENTRATION (and only that save) — the Bladesinger Bladesong
 * "Focus" benefit ("you can add your Intelligence modifier to the total").
 *
 * Sums two layers from the aggregate:
 *   1. `concentrationSaveBonusFlat` — flat bonuses.
 *   2. `concentrationSaveBonusAbilities` — ability-modifier bonuses, each
 *      `max(abilityModifier(ability), min)` (Bladesong Focus → +INT mod, min 0).
 *
 * Distinct from `resolveSaveBonus`, which rides EVERY saving throw: this bonus
 * never reaches an unrelated CON save (poison, Disintegrate, …). The
 * concentration-save grants only reach the aggregate while their wrapping
 * `while-active` toggle is on, so an inactive Bladesong contributes nothing.
 *
 * A consumer that shows a Concentration save adds this number to the
 * character's base CON save total. Override-first: the caller skips it (passes
 * 0 / ignores the helper) when the player pins a manual CON-save override.
 *
 * Pure — the caller passes the aggregate + scores; no character context.
 */
export function resolveConcentrationSaveBonus(
  aggregate: Pick<
    AggregatedGrants,
    "concentrationSaveBonusFlat" | "concentrationSaveBonusAbilities"
  >,
  abilityScores: Record<AbilityCode, number>
): number {
  let total = aggregate.concentrationSaveBonusFlat;
  for (const { ability, min } of aggregate.concentrationSaveBonusAbilities) {
    total += Math.max(abilityModifier(abilityScores[ability]), min);
  }
  return total;
}

/**
 * The proficiency tiers a skill / passive check can have (or `null` = untrained).
 * One named alias for the union the skill + passive helpers share.
 */
export type ProficiencyTier = "proficient" | "expertise" | "halfProficiency" | null;

/**
 * The proficiency-bonus CONTRIBUTION for one tier (RAW 2024): proficient +PB,
 * expertise +2·PB, half ⌊PB/2⌋, untrained 0. This is the SINGLE source of the
 * per-tier arithmetic — `skillBonus` adds it to its total, and the passive
 * breakdown emits it as a labelled part, so the passive headline and the tip's
 * proficiency row can never drift from the skill bonus (golden rule 6).
 */
export function proficiencyContribution(tier: ProficiencyTier, pb: number): number {
  switch (tier) {
    case "proficient":
      return pb;
    case "expertise":
      return pb * 2;
    case "halfProficiency":
      return Math.floor(pb / 2);
    default:
      return 0;
  }
}

/**
 * Calculate skill bonus.
 * Formula: ability modifier + proficiency modifier
 * Proficiency: +PB, Expertise: +2*PB, Half: +floor(PB/2)
 * Override takes precedence if provided.
 *
 * Jack of All Trades isn't a special case here. When a Bard gains the
 * feature, every previously-unset skill is auto-promoted to
 * `halfProficiency` on the character itself (see
 * `applyJackOfAllTrades` in `lib/level-up.ts` / character-build), and
 * the standard halfProficiency branch handles the math.
 */
export function skillBonus(
  abilityScore: number,
  level: number,
  proficiency: ProficiencyTier,
  override?: number | null,
  exhaustion = 0,
  pbOverride?: number | null,
  /**
   * Flat grant-derived bonus applied to this ability check (e.g. Fey Wanderer
   * Otherworldly Glamour = +WIS mod, min +1, on every Charisma check). Already
   * resolved by the caller against the character's scores — use
   * `resolveAbilityCheckBonus`. Skipped when the player has set a manual
   * `override` (override-first).
   */
  checkBonus = 0
): number {
  const penalty = exhaustionPenalty(exhaustion);
  if (override != null) return override + penalty;
  const mod = abilityModifier(abilityScore);
  const pb = effectiveProficiencyBonus(level, pbOverride);
  return mod + proficiencyContribution(proficiency, pb) + penalty + checkBonus;
}

/**
 * Resolve the total grant-derived ability-check bonus that applies to one skill.
 *
 * Each `entry.appliesTo` scope is matched against the skill three ways:
 *   - exact skill id (e.g. `"stealth"`) → that one skill only;
 *   - `"<ABILITY>-checks"` (e.g. `"CHA-checks"`) → every skill using that
 *     ability;
 *   - `"all-checks"` → every skill.
 * For each matching entry the bonus is either a flat number (`value` is a
 * number) or an ability modifier (`value === "modifier"`, add
 * `abilityModifier(scores[entry.ability])`), floored at `entry.min`. The
 * resolved bonuses sum additively. Pure — no override handling (the consumer
 * skips this entirely when a manual override is set). With no matching entries,
 * returns 0 (behavior-preserving).
 *
 * Fey Wanderer Otherworldly Glamour →
 * `{ appliesTo: "CHA-checks", ability: "WIS", value: "modifier", min: 1 }`:
 * every Charisma-based skill (Deception/Intimidation/Performance/Persuasion)
 * gains +WIS mod, minimum +1.
 */
export function resolveAbilityCheckBonus(
  entries: ReadonlyArray<{
    appliesTo: string;
    ability?: AbilityCode;
    value: "modifier" | number;
    min: number;
  }>,
  skillId: string,
  skillAbility: AbilityCode,
  abilityScores: Record<AbilityCode, number>
): number {
  let total = 0;
  for (const entry of entries) {
    const matches =
      entry.appliesTo === "all-checks" ||
      entry.appliesTo === skillId ||
      entry.appliesTo === `${skillAbility}-checks`;
    if (!matches) continue;
    if (typeof entry.value === "number") {
      total += Math.max(entry.value, entry.min);
    } else if (entry.ability) {
      total += Math.max(abilityModifier(abilityScores[entry.ability]), entry.min);
    }
  }
  return total;
}

/**
 * Resolve the total grant-derived bonus addable to ONE damage roll of a spell.
 *
 * The SPELL counterpart of `damage-rider` (weapon-only). Draconic Sorcery's
 * Elemental Affinity: when you cast a spell that deals your chosen draconic
 * damage type, add your Charisma modifier to one damage roll of that spell.
 *
 * An entry matches the spell when:
 *   - its `scope` is `"all"` or equals the spell's casting class (`spellClass`,
 *     when known — omit/`null` to skip class scoping), AND
 *   - its `damageTypes` is empty (any damaging spell) OR intersects the spell's
 *     own `damageTypes`, AND
 *   - when the entry is `cantripOnly` (Cleric Potent Spellcasting → "any Cleric
 *     cantrip"), the spell is a cantrip — `spellLevel === 0`. An entry flagged
 *     `cantripOnly` while `spellLevel` is unknown (`undefined`) is conservatively
 *     skipped; a non-`cantripOnly` entry ignores `spellLevel` entirely.
 * For each match the bonus is a flat number (`value` is a number) or an ability
 * modifier (`value === "modifier"`, add `abilityModifier(scores[entry.ability])`),
 * floored at `entry.min`. Matching bonuses sum additively. Pure — no override
 * handling (the consumer skips this entirely when a manual per-spell damage
 * override is set, per override-first). With no matching entries, returns 0.
 *
 * Elemental Affinity (chosen Fire) →
 * `{ damageTypes: ["fire"], ability: "CHA", value: "modifier", min: 0, scope: "all" }`:
 * a Fireball (Fire) gains +CHA mod; a Cone of Cold (Cold) gains nothing.
 * Potent Spellcasting →
 * `{ damageTypes: [], cantripOnly: true, ability: "WIS", scope: "cleric" }`: a
 * damaging Cleric cantrip (Sacred Flame, level 0) gains +WIS mod; a levelled
 * Cleric spell (Guiding Bolt, level 1) gains nothing.
 */
export function resolveSpellDamageBonus(
  entries: ReadonlyArray<SpellDamageBonusEntry>,
  spellDamageTypes: ReadonlyArray<DamageType>,
  abilityScores: Record<AbilityCode, number>,
  // The character's resolved class id, as a plain string. `ClassId` callers pass
  // the literal; the smart-tracker consumer passes the `getCharacterClassId`
  // string — widened to `string` here so no cast is needed (a non-matching
  // string simply never equals a scope).
  spellClass?: string | null,
  spellLevel?: number,
  spellSchool?: string | null
): number {
  const spellTypes = new Set(spellDamageTypes);
  const school = spellSchool?.toLowerCase();
  let total = 0;
  for (const entry of entries) {
    const scopeMatches =
      entry.scope === "all" || spellClass == null || entry.scope === spellClass;
    if (!scopeMatches) continue;
    // `cantripOnly` (Potent Spellcasting) rides only cantrips (level 0). With an
    // unknown level we can't prove it's a cantrip, so the entry is skipped.
    if (entry.cantripOnly && spellLevel !== 0) continue;
    // `schools` (Evoker Empowered Evocation → evocation) narrows by spell school.
    // With an unknown school we can't prove a match, so the entry is skipped.
    if (entry.schools && entry.schools.length > 0) {
      if (school == null || !entry.schools.some((s) => s.toLowerCase() === school)) {
        continue;
      }
    }
    const typeMatches =
      entry.damageTypes.length === 0 || entry.damageTypes.some((t) => spellTypes.has(t));
    if (!typeMatches) continue;
    if (typeof entry.value === "number") {
      total += Math.max(entry.value, entry.min);
    } else if (entry.ability) {
      total += Math.max(abilityModifier(abilityScores[entry.ability]), entry.min);
    }
  }
  return total;
}

/**
 * Resolve the total grant-derived bonus addable to the HIT POINTS a healing
 * spell restores — the healing counterpart of {@link resolveSpellDamageBonus}.
 *
 * Cleric Disciple of Life ("a spell of level 1+ that restores HP → +2 + the
 * spell's level") is `{ amount: 2, perSpellLevel: true, minSpellLevel: 1, scope:
 * "cleric" }`. Each matching entry contributes `amount + (perSpellLevel ?
 * spellLevel : 0)`. `scope` matches "all", a `null` cast class (defensive, like
 * the damage consumer), or the cast class id; `minSpellLevel` gates cantrips out.
 * The engine rolls no dice — the smart-tracker appends this flat amount to the
 * spell's heal verdict. Override-first by construction (no per-cast heal override
 * exists to skip).
 */
export function resolveHealBonus(
  entries: ReadonlyArray<HealBonusEntry>,
  spellClass?: string | null,
  spellLevel?: number
): number {
  const level = spellLevel ?? 0;
  let total = 0;
  for (const entry of entries) {
    const scopeMatches =
      entry.scope === "all" || spellClass == null || entry.scope === spellClass;
    if (!scopeMatches) continue;
    if (level < entry.minSpellLevel) continue;
    total += entry.amount + (entry.perSpellLevel ? level : 0);
  }
  return total;
}

/**
 * Resolve the alternate damage types a damaging spell may deal at the player's
 * choice — the type-SWAP counterpart of {@link resolveSpellDamageBonus} (which
 * adds a number). Great Old One Warlock Psychic Spells ("change a Warlock spell's
 * damage type to Psychic") is `{ toType: "psychic", scope: "warlock" }`.
 *
 * Returns every in-scope alternate type (deduped, order-preserving). `scope`
 * matches "all", a `null`/omitted cast class (defensive, like the other spell
 * consumers), or the cast class id. The smart-tracker folds these into the
 * spell's damage-type CHOICE chip so the player picks the original type or an
 * override per cast — the engine never auto-swaps and rolls no dice.
 */
export function resolveSpellDamageTypeOverrides(
  entries: ReadonlyArray<SpellDamageTypeOverrideEntry>,
  spellClass?: string | null
): DamageType[] {
  const out: DamageType[] = [];
  for (const entry of entries) {
    const scopeMatches =
      entry.scope === "all" || spellClass == null || entry.scope === spellClass;
    if (!scopeMatches) continue;
    if (!out.includes(entry.toType)) out.push(entry.toType);
  }
  return out;
}

/**
 * Resolve which components a spell may be cast WITHOUT, given the character's
 * component-waiver grants — Great Old One Psychic Spells (cast Warlock
 * Enchantment/Illusion spells without V/S). An entry applies when its `scope`
 * matches the casting class (or "all"/unknown) AND its `schools` set is empty or
 * contains the spell's school (case-insensitive). Returns the union of waived
 * components ("v"/"s"/"m"), deduped. The engine never auto-casts — the verdict
 * just marks what's optional.
 */
export function resolveComponentWaiver(
  entries: ReadonlyArray<ComponentWaiverEntry>,
  spellSchool: string,
  spellClass?: string | null
): Array<"v" | "s" | "m"> {
  const school = spellSchool.toLowerCase();
  const out: Array<"v" | "s" | "m"> = [];
  for (const entry of entries) {
    const scopeMatches =
      entry.scope === "all" || spellClass == null || entry.scope === spellClass;
    if (!scopeMatches) continue;
    const schoolMatches =
      entry.schools.length === 0 || entry.schools.some((s) => s.toLowerCase() === school);
    if (!schoolMatches) continue;
    for (const c of entry.waive) if (!out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * Resolve the total grant-derived bonus addable to the damage rolls of ONE
 * specific cantrip, matched by SRD spell id.
 *
 * The spell-id counterpart of {@link resolveSpellDamageBonus} (which is
 * damage-type keyed). Warlock's Agonizing Blast: "Choose one of your known
 * Warlock cantrips that deals damage. You can add your Charisma modifier to that
 * spell's damage rolls." The invocation is REPEATABLE, so multiple entries may
 * exist — each summed here when it targets `spellId`.
 *
 * For each entry whose `spellId` equals the cantrip's id, the bonus is a flat
 * number (`value` is a number) or an ability modifier (`value === "modifier"`,
 * add `abilityModifier(scores[entry.ability])`), floored at `entry.min`. Matching
 * bonuses sum additively. Pure — no RNG, no override handling (the consumer skips
 * this entirely when a manual per-spell damage override is set, per
 * override-first). With no matching entries, returns 0.
 *
 * Agonizing Blast (chosen Eldritch Blast) →
 * `{ spellId: "eldritch-blast", ability: "CHA", value: "modifier", min: 0 }`:
 * Eldritch Blast gains +CHA mod per beam; Fire Bolt (a different cantrip, or a
 * non-Warlock cantrip) gains nothing.
 */
export function resolveCantripDamageBonus(
  entries: ReadonlyArray<CantripDamageBonusEntry>,
  spellId: string,
  abilityScores: Record<AbilityCode, number>
): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.spellId !== spellId) continue;
    if (typeof entry.value === "number") {
      total += Math.max(entry.value, entry.min);
    } else if (entry.ability) {
      total += Math.max(abilityModifier(abilityScores[entry.ability]), entry.min);
    }
  }
  return total;
}

/**
 * PRIM-spell-die-augment consumer. Rewrite a spell's `damageDice` so its die
 * size is UPGRADED when a `spell-die-augment` entry targets that spell id
 * (Ranger Foe Slayer: Hunter's Mark "1d6" → "1d10"). Every `dM` token in the
 * formula whose `M` equals the entry's `fromDie` is rewritten to the entry's
 * `toDie` (so "2d6" → "2d10", "1d6+3" → "1d10+3"); the die COUNT and any flat
 * modifier are preserved. Other die sizes in the formula are left untouched.
 *
 * Pure, no RNG — only re-sizes the printed formula (the engine never rolls).
 * Returns `damageDice` unchanged when no entry matches the spell id, when the
 * formula has no `fromDie` token, or when `damageDice` is undefined. The largest
 * `toDie` already won at aggregation (one entry per spell), so this applies the
 * single matching augment. Override-first — the caller skips this when a manual
 * per-spell damage override is set.
 */
export function resolveSpellDieAugment(
  entries: ReadonlyArray<SpellDieAugmentEntry>,
  spellId: string,
  damageDice: string | undefined
): string | undefined {
  if (damageDice == null) return damageDice;
  const entry = entries.find((e) => e.spellId === spellId);
  if (!entry) return damageDice;
  // Replace every `<count>d<fromDie>` with `<count>d<toDie>`; the lookahead on a
  // non-digit (or end) keeps "d6" from also matching inside "d60".
  const re = new RegExp(`(\\d*)d${entry.fromDie}(?=\\D|$)`, "g");
  return damageDice.replace(re, (_m, count: string) => `${count}d${entry.toDie}`);
}

/**
 * PRIM-item-bound-bonus (weapon) consumer. Sum the `+N to attack and damage`
 * bonus an equipped+attuned magic item grants to ITS OWN weapon row (a +1/+2/+3
 * weapon, Rod of the Pact Keeper-style staves' quarterstaff bonus, Wraps of
 * Unarmed Power). Reads the source's OWN grants — not the aggregate — because
 * the bonus must ride only this weapon's row, never every attack. Returns the
 * summed `amount` of every `item-bound-bonus` grant on `grants` whose target is
 * `"weapon-attack-and-damage"` (0 when none). The caller adds it to the weapon's
 * `attackBonusOverride`-equivalent to-hit + damage. Override-first.
 */
export function resolveItemBoundWeaponBonus(
  grants: ReadonlyArray<Grant> | undefined
): number {
  if (!grants) return 0;
  let total = 0;
  for (const g of grants) {
    // `item-bound-bonus`'s only `target` is `weapon-attack-and-damage` (the one
    // item-bound case with no existing kind), so the type discriminant suffices.
    if (g.type === "item-bound-bonus") total += g.amount;
  }
  return total;
}

/** A resolved forced-movement rider on a cantrip — the consumer's read model. */
export interface ResolvedCantripForcedMovement {
  /** Direction relative to the caster ("push" away / "pull" toward). */
  direction: "push" | "pull";
  /** Maximum movement distance in feet (Repelling Blast: 10). */
  distanceFt: number;
  /** Largest creature size the rider can move (Repelling Blast: "Large"). */
  maxTargetSize: CreatureSize;
}

/**
 * Resolve the forced-movement rider (if any) that applies to ONE specific
 * cantrip, matched by SRD spell id.
 *
 * The non-damage sibling of {@link resolveCantripDamageBonus}: Warlock's
 * Repelling Blast — "When you hit a Large or smaller creature with that
 * cantrip, you can push the creature up to 10 feet straight away from you." The
 * invocation is REPEATABLE (each copy a different eligible cantrip), and a
 * cantrip could in principle pick up the rider from more than one source; when
 * several forced-movement riders target the same cantrip they do NOT stack
 * distance (you take ONE shove), so this returns the single rider with the
 * FARTHEST `distanceFt` (the most generous), preferring a larger `maxTargetSize`
 * on a tie. Pure — no RNG, no override handling (the caller drops this entirely
 * when a manual per-spell override is set, per override-first). Returns `null`
 * when no rider targets `spellId`.
 *
 * Repelling Blast (chosen Eldritch Blast) →
 * `{ direction: "push", distanceFt: 10, maxTargetSize: "Large" }` for
 * `"eldritch-blast"`; `null` for a different cantrip the Warlock didn't pick.
 */
export function resolveCantripForcedMovement(
  entries: ReadonlyArray<CantripEffectRiderEntry>,
  spellId: string
): ResolvedCantripForcedMovement | null {
  let best: ResolvedCantripForcedMovement | null = null;
  for (const entry of entries) {
    if (entry.spellId !== spellId) continue;
    // (`entry.effect` is currently always "forced-movement" — the only modeled
    // cantrip-rider effect — so no effect-kind guard is needed yet.)
    if (
      best === null ||
      entry.distanceFt > best.distanceFt ||
      (entry.distanceFt === best.distanceFt &&
        CREATURE_SIZE_ORDER.indexOf(entry.maxTargetSize) >
          CREATURE_SIZE_ORDER.indexOf(best.maxTargetSize))
    ) {
      best = {
        direction: entry.direction,
        distanceFt: entry.distanceFt,
        maxTargetSize: entry.maxTargetSize,
      };
    }
  }
  return best;
}

/**
 * Resolve the TOTAL range bonus (in feet) added to ONE specific cantrip, matched
 * by SRD spell id, from every {@link CantripRangeBonusEntry} that targets it.
 *
 * The level-scaled sibling of {@link resolveCantripDamageBonus}: Warlock's
 * Eldritch Spear — "Choose one of your known Warlock cantrips that deals damage
 * and has a range of 10+ feet. When you cast that spell, its range increases by
 * a number of feet equal to 30 times your Warlock level." Each entry's bonus is
 * `bonusPerLevel × <level of its `scalesWith` class>`; the caller passes the
 * character's per-class levels via `classLevels` (mirroring how Eldritch Smite's
 * dice scaling is fed the warlock's pact-slot level). The invocation is
 * REPEATABLE (one entry per chosen cantrip) and a cantrip could in principle pick
 * up the bonus from more than one source, so matching entries SUM. Pure — no RNG,
 * no override handling (the caller drops this entirely when a manual per-spell
 * range override is set, per override-first). Returns 0 when no entry targets
 * `spellId` (or the relevant class has 0 levels).
 *
 * Eldritch Spear (chosen Eldritch Blast, Warlock 9) →
 * `{ spellId: "eldritch-blast", bonusPerLevel: 30, scalesWith: "warlock" }`
 * with `classLevels.warlock = 9` → +270 ft for `"eldritch-blast"`; 0 for any
 * other cantrip the Warlock didn't pick.
 */
export function resolveCantripRangeBonus(
  entries: ReadonlyArray<CantripRangeBonusEntry>,
  spellId: string,
  classLevels: Partial<Record<ClassId, number>>
): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.spellId !== spellId) continue;
    const level = classLevels[entry.scalesWith] ?? 0;
    if (level <= 0) continue;
    total += entry.bonusPerLevel * level;
  }
  return total;
}

/**
 * The resolved combat facts of a weapon-attack cantrip (2024 True Strike) for a
 * given character. Pure projection of {@link WeaponAttackCantripData} + the
 * character's level + spellcasting ability — no RNG, no dice rolled.
 */
export interface ResolvedWeaponAttackCantrip {
  /**
   * Ability whose modifier is used for attack & damage — the spellcasting
   * ability when `useSpellcastingAbility` is set, else `null` to signal "use
   * the weapon's own STR/DEX" (the consumer keeps its default).
   */
  attackAbility: AbilityCode | null;
  /**
   * The two damage-type options the player chooses between on a hit: the
   * cantrip's override element (Radiant) and the weapon's own normal type. The
   * engine never picks — both are surfaced (override-first).
   */
  damageTypeChoices: ReadonlyArray<DamageType>;
  /**
   * Scaling extra damage at the character's current level: `dice` of
   * `damageType`, or `null` below the first threshold (e.g. a level-4 caster
   * gets no extra die from True Strike). Resolved from the highest
   * `extraDamageByLevel` threshold ≤ the character's level.
   */
  extraDamage: { dice: string; damageType: DamageType } | null;
}

/**
 * Resolve a weapon-attack cantrip (True Strike) against a character.
 *
 * - The attack & damage use the caster's spellcasting `castAbility` when the
 *   descriptor sets `useSpellcastingAbility` — the attack-row consumer should
 *   prefer this over the weapon's STR/DEX. (When false, falls back to the
 *   weapon's own ability — the consumer keeps its normal behavior.)
 * - The damage-type choice surfaces the override element + the weapon's normal
 *   type when `weaponDamageType` is known; with no weapon in hand it surfaces
 *   just the override element. Deduped (a Radiant weapon collapses to one).
 * - The scaling extra damage reads the highest `extraDamageByLevel` threshold
 *   ≤ `characterLevel`; below the first threshold there is no extra die.
 *
 * Pure — no dice, no clock. Override-first: this only computes the facts; a
 * per-spell or per-weapon manual override (handled by the caller) wins.
 */
export function resolveWeaponAttackCantrip(
  descriptor: WeaponAttackCantripData,
  characterLevel: number,
  castAbility: AbilityCode,
  weaponDamageType?: DamageType | null
): ResolvedWeaponAttackCantrip {
  // Damage-type options: the override element + the weapon's normal type.
  const choices: DamageType[] = [descriptor.damageTypeChoice];
  if (weaponDamageType && weaponDamageType !== descriptor.damageTypeChoice) {
    choices.push(weaponDamageType);
  }

  // Scaling extra damage — highest threshold ≤ the character's level.
  let bestThreshold = 0;
  let bestDice: string | null = null;
  for (const [thresholdStr, dice] of Object.entries(descriptor.extraDamageByLevel)) {
    const threshold = Number(thresholdStr);
    if (characterLevel >= threshold && threshold > bestThreshold) {
      bestThreshold = threshold;
      bestDice = dice;
    }
  }

  return {
    attackAbility: descriptor.useSpellcastingAbility ? castAbility : null,
    damageTypeChoices: choices,
    extraDamage:
      bestDice != null
        ? { dice: bestDice, damageType: descriptor.extraDamageType }
        : null,
  };
}

/**
 * Calculate passive perception (or other passive check).
 * Formula: 10 + skill bonus (+ the RA-16 ±5 advantage/disadvantage step).
 */
export function passiveScore(
  abilityScore: number,
  level: number,
  proficiency: ProficiencyTier,
  exhaustion = 0,
  pbOverride?: number | null,
  /**
   * Flat grant-derived ability-check bonus for the underlying skill (see
   * `skillBonus`'s `checkBonus`) — a passive is 10 + the same check modifier,
   * so the bonus threads through identically (AX exposure audit).
   */
  checkBonus = 0,
  /**
   * RA-16 — the SRD 2024 "Passive Perception" ±5 step: +5 when the character has
   * Advantage on the underlying check, −5 with Disadvantage, 0 otherwise (net —
   * see `passiveAdvantageStep`). The caller nets it from the aggregate.
   */
  advantageStep = 0
): number {
  return (
    10 +
    skillBonus(
      abilityScore,
      level,
      proficiency,
      null,
      exhaustion,
      pbOverride,
      checkBonus
    ) +
    advantageStep
  );
}

/**
 * The per-source parts of a passive score for the breakdown tip
 * ("10 base · +3 WIS · +4 PB"). 10 + ability mod + the proficiency portion
 * (PB / 2·PB / ⌊PB/2⌋ by proficiency tier) + the resolved check bonus +
 * exhaustion. `breakdownTotal` equals `passiveScore(...)` by construction
 * (the guard pins it). The bare "10 + mod" passive (no proficiency, no bonus)
 * still has two parts (base + ability), so it earns a tip.
 */
export function buildPassiveBreakdown(
  ability: AbilityCode,
  abilityScore: number,
  level: number,
  proficiency: ProficiencyTier,
  exhaustion = 0,
  pbOverride?: number | null,
  checkBonus = 0,
  /** RA-16 — the ±5 advantage/disadvantage step (see `passiveScore`). */
  advantageStep = 0
): RawBreakdownPart[] {
  // The proficiency row uses the SAME per-tier contribution as `skillBonus`
  // (one helper — golden rule 6), so a passive can never disagree with the
  // skill bonus it's built on.
  const profPart = proficiencyContribution(
    proficiency,
    effectiveProficiencyBonus(level, pbOverride)
  );
  const parts: RawBreakdownPart[] = [
    termPart("breakdown.base", 10),
    abilityPart(ability, abilityModifier(abilityScore)),
  ];
  if (profPart !== 0) parts.push(termPart("character.proficiencyBonus", profPart));
  if (checkBonus !== 0) parts.push(termPart("breakdown.featureBonus", checkBonus));
  if (advantageStep > 0) parts.push(termPart("common.advantage", advantageStep));
  else if (advantageStep < 0) parts.push(termPart("common.disadvantage", advantageStep));
  const exPenalty = exhaustionPenalty(exhaustion);
  if (exPenalty !== 0) parts.push(termPart("character.exhaustion", exPenalty));
  return parts;
}

/**
 * RA-16 — the SRD 2024 "Passive Perception" ±5 step for one passive skill.
 * Reads the already active-filtered aggregate and nets by EXACT `vs` check-id
 * match: +5 when the character has Advantage on that check, −5 with Disadvantage,
 * 0 when both (RAW cancellation) or neither. Only `rollType: "check"` clauses
 * whose `vs` is exactly the passive id (`"perception"` / `"insight"` /
 * `"investigation"`) count — a situational `vs: "perception-sight"` or an
 * ability-scoped `vs: "wisdom-checks"` clause is deliberately NOT folded (a
 * conditional advantage does not universally move a passive; those stay
 * follow-ups). Mirrors `hasInitiativeAdvantage`'s exact-token match.
 */
export function passiveAdvantageStep(
  aggregate: Pick<AggregatedGrants, "advantages" | "disadvantages">,
  passiveId: "perception" | "insight" | "investigation"
): number {
  const applies = (c: { rollType: string; vs: string }): boolean =>
    c.rollType === "check" && c.vs === passiveId;
  const hasAdv = aggregate.advantages.some(applies);
  const hasDis = aggregate.disadvantages.some(applies);
  return (hasAdv ? 5 : 0) - (hasDis ? 5 : 0);
}

/**
 * The per-source parts of a SKILL check for the breakdown tip ("+3 DEX · +4 PB
 * · +2 Expertise"). Ability mod + the proficiency portion (PB / 2·PB / ⌊PB/2⌋ by
 * tier) + the resolved check bonus + exhaustion — the SAME register `skillBonus`
 * sums, so the tip and the headline can never drift (golden rule 6):
 * `breakdownTotal(parts) === skillBonus(...)` (override-free) by construction.
 * Returns `null` under a manual `override` (override-first — no composition to
 * explain), exactly like {@link buildSaveBreakdown}. A single-component skill (no
 * proficiency, no bonus, no exhaustion) returns one part — the consumer suppresses
 * the tip then (golden rule 19).
 */
export function buildSkillBreakdown(args: {
  ability: AbilityCode;
  abilityScore: number;
  level: number;
  proficiency: ProficiencyTier;
  override?: number | null;
  exhaustion?: number;
  pbOverride?: number | null;
  checkBonus?: number;
}): RawBreakdownPart[] | null {
  if (args.override != null) return null;
  const profPart = proficiencyContribution(
    args.proficiency,
    effectiveProficiencyBonus(args.level, args.pbOverride)
  );
  const parts: RawBreakdownPart[] = [
    abilityPart(args.ability, abilityModifier(args.abilityScore)),
  ];
  if (profPart !== 0) parts.push(termPart("character.proficiencyBonus", profPart));
  if (args.checkBonus) parts.push(termPart("breakdown.featureBonus", args.checkBonus));
  const exPenalty = exhaustionPenalty(args.exhaustion ?? 0);
  if (exPenalty !== 0) parts.push(termPart("character.exhaustion", exPenalty));
  return parts;
}

/**
 * Resolve a character's EFFECTIVE ability scores from the stored base plus the
 * two item-derived channels — the SINGLE chokepoint every combat/cast/display/
 * PDF surface routes through (golden rule 6):
 *
 *   1. FLOORS (set-score items — Amulet of Health → CON 19, Gauntlets of Ogre
 *      Power → STR 19): each score becomes `max(base, floor)`.
 *   2. ADDITIVE item bonuses (Belt of Dwarvenkind +2 CON, +2 Ioun stones):
 *      summed per ability, added AFTER the floor, then CLAMPED to that
 *      ability's resulting-score `cap` (RAW "to a maximum of 20") — so a base
 *      already at/over the cap gains nothing.
 *
 * Pure — no item resolution. Floors come from `evaluateGrants(...).
 * abilityScoreFloors`; the additive bonus + caps from `itemAbilityScoreBonus` /
 * `itemAbilityScoreCap` (magic-item-sourced ONLY, so feat ASIs already baked
 * into `base` are NEVER re-added — no double-count). With no floors and no
 * bonus, returns an equal-valued copy, so wiring this in is behavior-preserving
 * until an ability-score item is equipped.
 */
export function effectiveAbilityScores(
  base: Record<AbilityCode, number>,
  floors: Partial<Record<AbilityCode, number>>,
  additive?: Partial<Record<AbilityCode, number>>,
  caps?: Partial<Record<AbilityCode, number>>
): Record<AbilityCode, number> {
  const out = { ...base };
  for (const ability of Object.keys(out) as AbilityCode[]) {
    const floor = floors[ability];
    if (floor != null && floor > out[ability]) out[ability] = floor;
    const bonus = additive?.[ability];
    if (bonus) {
      out[ability] += bonus;
      const cap = caps?.[ability];
      if (cap != null && out[ability] > cap) out[ability] = cap;
    }
  }
  return out;
}

/** The six ability codes in canonical stat-block order. */
const ABILITY_CODES: ReadonlyArray<AbilityCode> = [
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHA",
];

/** A resolved companion ability score: the fixed score, its modifier, and the
 *  save bonus (modifier + the owner's PB when the companion borrows it via
 *  Primal/Steel Bond). */
export interface ResolvedCompanionAbility {
  score: number;
  modifier: number;
  save: number;
}

/** A resolved companion attack: concrete to-hit + a word-free damage formula +
 *  the raw damage-type TOKEN (localized at the render edge, never here — rule 7). */
export interface ResolvedCompanionAttack {
  /** Catalogue-key segment (`<featureKey>.companion.attacks.<id>`) for name + rider. */
  id: string;
  /** Concrete to-hit bonus (owner spell-attack mod, or PB + companion ability). */
  attackBonus: number;
  /** Word-free damage formula, e.g. "1d8 + 2 + 3" (die + flat + owner modifier). */
  damageDice: string;
  /** Stable damage-type token (`"force"`, `"necrotic"`) — `t(`srd.damage_${…}`)`
   *  at the render edge resolves the localized label (NO English in the value). */
  damageType: DamageType;
  /** Distance in feet — melee reach (default 5) OR the range when `ranged`. */
  reachFt: number;
  /** `true` for a ranged attack → the view labels the distance "range". */
  ranged: boolean;
}

/** A fully resolved companion stat block (AC/HP from level/ability, defenses,
 *  senses, attacks, traits, and — when the companion borrows the owner's PB —
 *  the bonus it adds to its own checks/saves). All facts are derived; nothing
 *  is rolled. */
export interface ResolvedCompanion {
  ac: number;
  hpMax: number;
  speed?: string;
  /**
   * Multi-mode speeds in feet (Beast of the Land: walk 40, climb 40). Empty
   * object when the block carries only a single `speed` string / none.
   */
  speeds: Readonly<Partial<Record<"walk" | "climb" | "fly" | "swim" | "burrow", number>>>;
  /** Hit Die + count (one per scaling level) — display only. `null` when unset. */
  hitDice: { die: string; count: number } | null;
  /** Damage types the companion is immune to (Steel Defender → Poison). */
  damageImmunities: ReadonlySet<DamageType>;
  /** Conditions the companion is immune to (Charmed/Exhaustion/Poisoned). */
  conditionImmunities: ReadonlySet<ConditionId>;
  /** The companion's own senses, in feet (Steel Defender → Darkvision 60). */
  senses: {
    darkvisionFt: number;
    blindsightFt: number;
    tremorsenseFt: number;
    truesightFt: number;
  };
  /**
   * Resolved fixed ability scores (Beast Master beasts) with modifier + save.
   * Empty object when the block declares no `abilityScores` (Artificer).
   */
  abilities: Readonly<Partial<Record<AbilityCode, ResolvedCompanionAbility>>>;
  /** Resolved attack profiles (Beast's Strike). Empty when none declared. */
  attacks: ReadonlyArray<ResolvedCompanionAttack>;
  /** Always-on traits (Primal Bond, Flyby, Amphibious) PLUS unlocked upgrades. */
  /** Always-on traits + unlocked upgrades, by catalogue-key segment id
   *  (`<featureKey>.companion.{traits|upgrades}.<id>`). */
  traits: ReadonlyArray<{ id: string }>;
  /**
   * The flat bonus the companion adds to every ability check and saving throw
   * it makes (Steel Defender's "Steel Bond" / Beast Master's "Primal Bond" →
   * the owner's Proficiency Bonus). `null` when the companion has no such trait.
   */
  pbToChecks: number | null;
}

/**
 * Pick the active stat block from a companion that offers a `variants` choice
 * (Beast Master: Beast of the Land / Sea / Sky). Returns the variant whose
 * `variantId` matches `selectedVariantId`; falls back to the default `block`
 * when there are no variants or the selection is absent / unknown. Pure.
 *
 * Override-first: the player's variant pick (session state) drives this; with
 * no pick the default block resolves so the card always has something to show.
 */
export function selectCompanionVariant(
  block: CompanionStatBlock,
  selectedVariantId?: string | null
): CompanionStatBlock {
  if (!block.variants?.length || selectedVariantId == null) return block;
  return block.variants.find((v) => v.variantId === selectedVariantId) ?? block;
}

/**
 * Resolve a summoned companion's stat block against its owner. Covers both the
 * Artificer constructs (Steel Defender → AC 12 + INT, HP 5 + 5×level, Poison
 * immunity, Charmed/Exhaustion/Poisoned, Darkvision 60, +PB to checks/saves;
 * Eldritch Cannon → AC 18, HP 5×level) AND the Beast Master Primal Companion
 * (Beast of the Land/Sea/Sky → AC 13 + WIS, HP 5+5×level or 4+4×level, fixed
 * ability scores with Primal-Bond saves, the Beast's Strike attack whose to-hit
 * = the owner's spell attack modifier and damage = die + WIS, and the
 * level-gated Exceptional Training / Bestial Fury upgrades).
 *
 * `spellAttackMod` (optional) is the owner's spell attack modifier, fed in for
 * `attackBonus: "spell-attack"` attacks (Beast's Strike). When omitted (the
 * Artificer constructs declare no such attack), spell-attack attacks fall back
 * to `PB`. `pbOverride` (override-first) lets the character's manual PB override
 * flow into the borrowed-PB bonus and the companion's saves. Pure — NO dice.
 */
export function resolveCompanion(
  block: CompanionStatBlock,
  level: number,
  abilityScores: Record<AbilityCode, number>,
  pbOverride?: number | null,
  spellAttackMod?: number
): ResolvedCompanion {
  const ac =
    block.ac.base +
    (block.ac.ability ? abilityModifier(abilityScores[block.ac.ability]) : 0);
  const hpMax = Math.max(1, block.hp.base + block.hp.perLevel * level);
  const pb = effectiveProficiencyBonus(level, pbOverride);
  const pbToChecks = block.pbToChecks ? pb : null;

  // Multi-mode speeds → also derive a `speed` summary string from walk.
  const speeds = block.speeds ?? {};
  const speed =
    block.speed ?? (block.speeds?.walk != null ? `${block.speeds.walk} ft` : undefined);

  // Ability scores → modifier + (Primal-Bond) save.
  const abilities: Partial<Record<AbilityCode, ResolvedCompanionAbility>> = {};
  if (block.abilityScores) {
    for (const code of ABILITY_CODES) {
      const score = block.abilityScores[code];
      const modifier = abilityModifier(score);
      abilities[code] = { score, modifier, save: modifier + (pbToChecks ?? 0) };
    }
  }

  // Attacks → concrete to-hit + word-free damage formula + raw type token (the
  // localized type label is resolved at the render edge — rule 7, no dice).
  const attacks: ResolvedCompanionAttack[] = (block.attacks ?? []).map((atk) => {
    const attackBonus =
      atk.attackBonus === "spell-attack"
        ? (spellAttackMod ?? pb)
        : pb +
          (atk.attackAbility ? abilityModifier(abilityScores[atk.attackAbility]) : 0);
    let damageDice = atk.dice;
    if (atk.addAbility) {
      const mod = abilityModifier(abilityScores[atk.addAbility]);
      damageDice += mod >= 0 ? ` + ${mod}` : ` - ${Math.abs(mod)}`;
    }
    return {
      id: atk.id,
      attackBonus,
      damageDice,
      damageType: atk.damageType,
      reachFt: atk.reachFt ?? 5,
      ranged: atk.ranged ?? false,
    };
  });

  // Always-on traits PLUS level-gated upgrades whose minLevel is reached — by
  // catalogue-key segment id (name + description localized at the view edge).
  const traits: Array<{ id: string }> = [
    ...(block.traits ?? []),
    ...(block.upgrades ?? [])
      .filter((u) => level >= u.minLevel)
      .map((u) => ({ id: u.id })),
  ];

  return {
    ac,
    hpMax,
    speed,
    speeds,
    hitDice:
      block.hitDie != null ? { die: block.hitDie, count: Math.max(1, level) } : null,
    damageImmunities: new Set(block.damageImmunities ?? []),
    conditionImmunities: new Set(block.conditionImmunities ?? []),
    senses: {
      darkvisionFt: block.senses?.darkvisionFt ?? 0,
      blindsightFt: block.senses?.blindsightFt ?? 0,
      tremorsenseFt: block.senses?.tremorsenseFt ?? 0,
      truesightFt: block.senses?.truesightFt ?? 0,
    },
    abilities,
    attacks,
    traits,
    pbToChecks,
  };
}

/**
 * The resolved familiar-enhancement view a renderer/consumer reads — the merged
 * deltas a feature confers on a summoned familiar (Warlock Investment of the
 * Chain Master), with the only character-derived value (the owner's spell save
 * DC) stamped in. `present` is `false` when no source grants any enhancement;
 * the renderer then shows nothing. Override-first: every benefit is a
 * play-time option the player applies manually (the engine never auto-commands
 * the familiar, swaps damage types, or spends the Reaction).
 */
export interface ResolvedFamiliarEnhancement {
  /** `true` when at least one `familiar-enhancement` grant is in effect. */
  present: boolean;
  /** Non-walking Speed (feet) the familiar gains; `null` when none granted. */
  extraSpeedFt: number | null;
  /** Modes the player picks ONE of for `extraSpeedFt` (Fly / Swim). */
  extraSpeedModes: ReadonlyArray<"fly" | "swim" | "climb">;
  /** `true` when a Bonus Action can command the familiar to take the Attack action. */
  bonusActionAttack: boolean;
  /** Elements the familiar's B/P/S damage can be switched to (player's choice). */
  damageTypeConversion: ReadonlyArray<DamageType>;
  /**
   * The owner's spell save DC the familiar uses for saves it forces, when a
   * source grants "Your Save DC". `null` when no source grants it (the familiar
   * uses its own stat-block DC). Resolved from the owner — the seam's only
   * character-derived value.
   */
  saveDc: number | null;
  /** `true` when the owner can Reaction-grant the familiar Resistance to damage. */
  reactionResistance: boolean;
}

/**
 * Merge every `familiar-enhancement` grant in the aggregate into one resolved
 * view, stamping the owner's spell save DC where a source grants "Your Save DC".
 *
 * The familiar's own stat block comes from the Find Familiar spell (the chosen
 * Beast / special form), so — unlike a `companion`-backed stat block — the
 * engine can't resolve it; this resolves the DELTAS the feature layers on top.
 * The sole 2024 case is Warlock Investment of the Chain Master (Pact of the
 * Chain): Fly/Swim 40, a Bonus-Action Attack command, Necrotic/Radiant damage
 * conversion, the owner's save DC, and a Reaction-granted Resistance.
 *
 * Merge across sources: speed takes the largest `extraSpeedFt` (and unions the
 * mode options); boolean benefits OR together; damage-type conversions union.
 * `ownerSpellSaveDc` is the owner's already-computed spell save DC (the consumer
 * passes `spellSaveDC(...)`); it is only stamped onto `saveDc` when a source
 * sets `usesOwnerSaveDc`. Pure — NO dice, NO RNG.
 *
 * Override-first: the result is purely informational (the available options on
 * the familiar card); the engine never auto-applies any of them.
 */
export function resolveFamiliarEnhancements(
  enhancements: ReadonlyArray<FamiliarEnhancement>,
  ownerSpellSaveDc: number
): ResolvedFamiliarEnhancement {
  if (enhancements.length === 0) {
    return {
      present: false,
      extraSpeedFt: null,
      extraSpeedModes: [],
      bonusActionAttack: false,
      damageTypeConversion: [],
      saveDc: null,
      reactionResistance: false,
    };
  }

  let extraSpeedFt: number | null = null;
  const extraSpeedModes = new Set<"fly" | "swim" | "climb">();
  let bonusActionAttack = false;
  const damageTypeConversion = new Set<DamageType>();
  let usesOwnerSaveDc = false;
  let reactionResistance = false;

  for (const e of enhancements) {
    if (
      e.extraSpeedFt != null &&
      (extraSpeedFt === null || e.extraSpeedFt > extraSpeedFt)
    ) {
      extraSpeedFt = e.extraSpeedFt;
    }
    for (const m of e.extraSpeedModes ?? []) extraSpeedModes.add(m);
    if (e.bonusActionAttack) bonusActionAttack = true;
    for (const dt of e.damageTypeConversion ?? []) damageTypeConversion.add(dt);
    if (e.usesOwnerSaveDc) usesOwnerSaveDc = true;
    if (e.reactionResistance) reactionResistance = true;
  }

  return {
    present: true,
    extraSpeedFt,
    extraSpeedModes: [...extraSpeedModes],
    bonusActionAttack,
    damageTypeConversion: [...damageTypeConversion],
    saveDc: usesOwnerSaveDc ? ownerSpellSaveDc : null,
    reactionResistance,
  };
}

/**
 * Carrying capacity (2024 PHB): your Strength score × 15 (pounds). You can
 * push, drag, or lift up to twice that. Returned in pounds; the UI converts to
 * kg for IT via `formatWeight`.
 */
export function carryingCapacity(strScore: number): {
  carry: number;
  pushDragLift: number;
} {
  return { carry: strScore * 15, pushDragLift: strScore * 30 };
}

/**
 * Jump distances (2024 PHB), in feet, with a running start (≥10 ft):
 *  - long jump = your Strength SCORE (feet)
 *  - high jump = 3 + your Strength MODIFIER (feet, min 0)
 * Standing jumps are half these — the UI can note that.
 */
export function jumpDistance(strScore: number): { long: number; high: number } {
  return { long: strScore, high: Math.max(0, 3 + abilityModifier(strScore)) };
}

/**
 * The DC a target rolls against when you use your Unarmed Strike's Grapple or
 * Shove option (2024 PHB): 8 + Strength modifier + Proficiency Bonus.
 */
export function unarmedStrikeSaveDc(
  strScore: number,
  level: number,
  pbOverride?: number | null
): number {
  // Same 8 + PB + ability-mod formula as every feature DC — route through the one
  // source (golden rule 6) with STR as the governing ability.
  return featureSaveDc(level, strScore, pbOverride);
}

/**
 * The save DC a target rolls against a class/subclass FEATURE that forces a save
 * (2024 RAW): 8 + Proficiency Bonus + the feature's governing ability modifier
 * (e.g. Rogue Cunning Strike → 8 + PB + DEX mod). The generic counterpart of
 * `unarmedStrikeSaveDc` (which fixes STR); the ability score is passed in so any
 * feature DC routes through ONE formula — single source of truth (golden rule 6).
 */
export function featureSaveDc(
  level: number,
  abilityScore: number,
  pbOverride?: number | null
): number {
  return 8 + effectiveProficiencyBonus(level, pbOverride) + abilityModifier(abilityScore);
}

/**
 * Average value of a single die expressed as `"dN"` (`"d6"` → 3.5). Used to
 * pick the better of two competing Unarmed-Strike upgrades. A malformed string
 * yields 0 so a typo never beats a real die. Pure, no RNG.
 */
function dieAverage(die: string): number {
  const m = /^d(\d+)$/.exec(die.trim());
  if (!m) return 0;
  const sides = parseInt(m[1] ?? "0", 10);
  return sides > 0 ? (sides + 1) / 2 : 0;
}

/** A single declared Unarmed-Strike damage-die upgrade (the aggregate slice). */
export interface UnarmedStrikeDieGrant {
  /** A fixed die (`"d6"`) or the deferred `"classSpecific:<key>"` sentinel. */
  die: string;
  /** Ability usable for the attack roll in place of STR (best-of wins). */
  attackAbility?: AbilityCode;
  /** Ability modifier added to the damage roll (omit = die only). */
  damageAbility?: AbilityCode;
  /** Damage type the upgrade deals. */
  damageType: DamageType;
  /**
   * Source-feature id — the deferred-die resolver uses it to read the
   * `classSpecific` row from THIS upgrade's OWNING class at the character's
   * level in that class (Monk Martial Arts → Monk level; College of Dance →
   * Bard level), never one shared primary-class row at the total level.
   */
  sourceId?: string;
}

/**
 * Resolves a deferred `"classSpecific:<key>"` Unarmed-Strike die for one upgrade.
 * Given the upgrade's source-feature id and the sentinel key, returns that
 * feature's owning-class `classSpecific[key]` at the character's level in that
 * class, or `undefined` when unresolvable. The smart-tracker backs it with
 * `featureClassRow`; level-agnostic callers may pass a constant map instead.
 */
export type DeferredDieResolver = (
  sourceId: string | undefined,
  key: string
) => number | string | undefined;

/** Resolved Unarmed-Strike profile the combat / equipment row consumes. */
export interface UnarmedStrikeProfile {
  /** Ability used for the attack roll (best applicable). */
  attackAbility: AbilityCode;
  /** Attack-roll bonus: ability modifier + Proficiency Bonus. */
  attackBonus: number;
  /** Damage formula string, e.g. `"d6+3"`, `"1"` (base 1 + STR), `"1d4"`. */
  damage: string;
  /** Damage type. */
  damageType: DamageType;
  /** The die the upgrade contributes (`null` when no upgrade applies). */
  die: string | null;
}

/**
 * Resolve the character's effective Unarmed Strike, honouring any
 * `unarmed-strike-die` upgrade (Monk Martial Arts, College of Dance Bardic
 * Damage). The GENERAL primitive that replaces the per-class
 * `classSpecific.martialArtsDie` workaround.
 *
 * Base 2024 Unarmed Strike (no upgrade): 1 + STR damage, Bludgeoning, attack
 * with STR. An upgrade replaces the base damage with `bestDie + damageAbility
 * mod` of the chosen type and may let a different ability (DEX) be USED for the
 * attack roll — RAW "you can use", so the consumer takes the BEST modifier.
 *
 * Multiple upgrades (a Monk/Dance multiclass) → the one with the highest die
 * average wins; the player never stacks both. Each upgrade's own
 * `attackAbility` and `damageAbility` ride with the winning die.
 *
 * `deferredDice` resolves a `"classSpecific:<key>"` sentinel to a concrete die.
 * It is either a single `classSpecific` map (a level-agnostic caller with one
 * class context) OR a `DeferredDieResolver` that resolves each upgrade against
 * ITS OWN source-feature's owning class at the right class level (the
 * multiclass-correct path — Monk reads Monk level, Bard/Dance reads Bard level).
 * A grant whose sentinel can't be resolved (key absent / not yet unlocked) is
 * skipped.
 *
 * Override-first: `override`, when set, wins outright — the player's manual
 * Unarmed Strike attack-bonus / damage entry is never overwritten.
 */
export function effectiveUnarmedStrike(
  upgrades: ReadonlyArray<UnarmedStrikeDieGrant>,
  abilityScores: Record<AbilityCode, number>,
  level: number,
  deferredDice: Record<string, number | string> | DeferredDieResolver | undefined,
  pbOverride?: number | null,
  override?: { attackBonus?: number; damage?: string; damageType?: DamageType }
): UnarmedStrikeProfile {
  const pb = effectiveProficiencyBonus(level, pbOverride);

  // Resolve each upgrade's die (fixed or deferred via classSpecific). A
  // deferred sentinel that can't be resolved to a real "dN" is dropped. When
  // `deferredDice` is a resolver, each upgrade resolves against its OWN source
  // feature's class+level (multiclass-correct); a plain map is the shared
  // single-class fallback.
  const resolveKey = (
    sourceId: string | undefined,
    key: string
  ): number | string | undefined =>
    typeof deferredDice === "function"
      ? deferredDice(sourceId, key)
      : deferredDice?.[key];
  const resolved = upgrades
    .map((u) => {
      let die = u.die;
      const sentinel = /^classSpecific:(.+)$/.exec(u.die);
      if (sentinel) {
        const raw = resolveKey(u.sourceId, sentinel[1] ?? "");
        die = typeof raw === "string" ? raw : "";
      }
      return { ...u, die };
    })
    .filter((u) => dieAverage(u.die) > 0);

  // Pick the strongest die (highest average); ties keep the first declared.
  const best = resolved.reduce<(typeof resolved)[number] | undefined>((acc, u) => {
    if (!acc) return u;
    return dieAverage(u.die) > dieAverage(acc.die) ? u : acc;
  }, undefined);

  // Attack ability: STR by default; an upgrade's attackAbility may be USED in
  // its place — take the best modifier (RAW "you can use").
  let attackAbility: AbilityCode = "STR";
  if (best?.attackAbility) {
    const altMod = abilityModifier(abilityScores[best.attackAbility]);
    const strMod = abilityModifier(abilityScores.STR);
    if (altMod > strMod) attackAbility = best.attackAbility;
  }
  const attackMod = abilityModifier(abilityScores[attackAbility]);
  const attackBonus = override?.attackBonus ?? attackMod + pb;

  // Damage: base Unarmed Strike is "1 + STR" Bludgeoning. An upgrade replaces
  // it with bestDie (+ damageAbility mod) of the upgrade's type.
  let damage: string;
  let damageType: DamageType;
  let die: string | null;
  if (best) {
    die = best.die;
    damageType = best.damageType;
    const dmgMod = best.damageAbility
      ? abilityModifier(abilityScores[best.damageAbility])
      : 0;
    damage = appendAbilityModToDice(best.die, dmgMod);
  } else {
    die = null;
    damageType = "bludgeoning";
    const strMod = abilityModifier(abilityScores.STR);
    const total = 1 + strMod;
    damage = `${total}`;
  }

  return {
    attackAbility,
    attackBonus,
    damage: override?.damage ?? damage,
    damageType: override?.damageType ?? damageType,
    die,
  };
}

/** A weapon-attack-ability entry's optional Monk Martial Arts die upgrade. */
export interface WeaponDieUpgrade {
  /** `"monk-melee"` gates the upgrade to Monk weapons; omitted ⇒ every weapon. */
  weaponScope?: "monk-melee";
  /** A fixed die (`"d8"`) or the deferred `"classSpecific:<key>"` sentinel. */
  dieUpgrade?: string;
  /** Owning feature id — resolves the deferred die against its class+level. */
  sourceId?: string;
}

/**
 * The effective DAMAGE DIE of a carried Monk weapon — the Monk Martial Arts die
 * REPLACES the weapon's printed die when LARGER (Shortsword 1d6 → 1d8 at Monk
 * L5; a Dagger 1d4 → 1d6 even at L1). Mirrors {@link effectiveUnarmedStrike}'s
 * best-die logic (highest die face wins; the weapon's own die is one candidate).
 *
 * `weaponDie` is the printed die (`"1d6"`, possibly a multi-die `"2d6"` — left
 * untouched since a Heavy weapon is never a Monk weapon, so no upgrade applies).
 * `isMonkWeapon` gates the `"monk-melee"`-scoped upgrades. `deferredDice`
 * resolves a `"classSpecific:<key>"` sentinel (the Monk's `martialArtsDie` at the
 * Monk's own level — multiclass-correct). Returns the upgraded `"1dM"` when an
 * upgrade beats the printed face, else `weaponDie` unchanged. Pure — no rolls.
 */
export function effectiveWeaponDie(
  weaponDie: string,
  isMonkWeapon: boolean,
  upgrades: ReadonlyArray<WeaponDieUpgrade>,
  deferredDice: DeferredDieResolver
): string {
  // Printed face — the count is preserved (a Monk weapon is single-die, so a
  // multi-die weapon, which is never a Monk weapon, simply never upgrades).
  const m = /^(\d*)d(\d+)$/.exec(weaponDie.trim());
  if (!m) return weaponDie;
  const printedFace = parseInt(m[2] ?? "0", 10);
  let bestFace = printedFace;
  for (const u of upgrades) {
    if (!u.dieUpgrade) continue;
    if (u.weaponScope === "monk-melee" && !isMonkWeapon) continue;
    let die = u.dieUpgrade;
    const sentinel = /^classSpecific:(.+)$/.exec(die);
    if (sentinel) {
      const raw = deferredDice(u.sourceId, sentinel[1] ?? "");
      die = typeof raw === "string" ? raw : "";
    }
    const um = /^d?(\d+)$/.exec(die);
    if (um) bestFace = Math.max(bestFace, parseInt(um[1] ?? "0", 10));
  }
  return bestFace > printedFace ? `1d${bestFace}` : weaponDie;
}

/**
 * The save DC a TARGET rolls against when a maneuver-wielding Fighter uses a save-forcing
 * maneuver (Trip / Disarming / Pushing → STR; Goading / Menacing → WIS).
 *
 * 2024 RAW (fighter:battle-master): "If a maneuver requires a saving throw,
 * the DC equals 8 plus your Strength or Dexterity modifier (your choice) and
 * Proficiency Bonus." The player always picks the more favourable of STR / DEX,
 * so we take the higher modifier deterministically — no RNG, no input needed.
 */
export function maneuverSaveDc(
  strScore: number,
  dexScore: number,
  level: number,
  pbOverride?: number | null
): number {
  const bestMod = Math.max(abilityModifier(strScore), abilityModifier(dexScore));
  return 8 + effectiveProficiencyBonus(level, pbOverride) + bestMod;
}

/**
 * Check whether a character has a given feat (by SRD id), looking at the
 * Human origin feat slug, the background feat slug, and any feature refs.
 */
export function characterHasFeat(
  featId: string,
  origin: {
    humanOriginFeat?: string;
    bgFeat?: string;
    features?: ReadonlyArray<SrdFeatureRef | CustomFeature>;
  }
): boolean {
  if (origin.humanOriginFeat === featId || origin.bgFeat === featId) return true;
  return (origin.features ?? []).some((f) => "srdId" in f && f.srdId === featId);
}

/**
 * Compute the total initiative bonus.
 * Base = DEX modifier. The Alert feat (2024) adds Proficiency Bonus on top
 * ("Initiative Proficiency"). `proficiencyBonusValue` is passed in so any PB
 * override is respected.
 */
export function computeInitiative(
  dexScore: number,
  proficiencyBonusValue: number,
  hasAlertFeat: boolean,
  exhaustion = 0,
  /**
   * Flat grant-derived bonus to Initiative (e.g. Gloom Stalker's Dread
   * Ambusher = +WIS mod). Already resolved by the caller against the
   * character's scores. Separate from Alert's PB bonus above.
   */
  grantBonus = 0
): number {
  return (
    abilityModifier(dexScore) +
    (hasAlertFeat ? proficiencyBonusValue : 0) +
    grantBonus +
    exhaustionPenalty(exhaustion)
  );
}

/**
 * The per-source parts of {@link computeInitiative} for the breakdown tip
 * ("+2 DEX · +3 Alert"). DEX modifier + Alert's PB bump + the lumped flat grant
 * bonus + the exhaustion penalty. `breakdownTotal(parts)` equals
 * `computeInitiative(...)` by construction (golden rule 6); the guard pins it.
 */
export function buildInitiativeBreakdown(
  dexScore: number,
  proficiencyBonusValue: number,
  hasAlertFeat: boolean,
  exhaustion = 0,
  grantBonus = 0
): RawBreakdownPart[] {
  const parts: RawBreakdownPart[] = [abilityPart("DEX", abilityModifier(dexScore))];
  // The Alert feat's PB bump (2024 "Initiative Proficiency"). The label REFERENCES
  // the feat's ONE catalogue entry (`srd feat/alert/name` → "Alert"/"Allerta"),
  // never a bespoke `breakdown.*` term — so the breakdown can't localize the feat
  // differently from the feat surfaces (golden rule 6; #99, mirroring the #89-B1
  // Exhaustion fix that re-routed to `character.exhaustion`).
  if (hasAlertFeat)
    parts.push(locPart(srdText("feat", "alert", "name"), proficiencyBonusValue));
  if (grantBonus !== 0) parts.push(termPart("breakdown.featureBonus", grantBonus));
  const exPenalty = exhaustionPenalty(exhaustion);
  if (exPenalty !== 0) parts.push(termPart("character.exhaustion", exPenalty));
  return parts;
}

/**
 * Whether the character rolls Initiative with Advantage.
 *
 * Initiative is a DEX check whose *bonus* is computed by `computeInitiative`,
 * but its advantage half can't be folded into a single number (advantage is a
 * roll modifier, never an additive term — and the project never rolls dice).
 * So this reads the dedicated `advantage-on { rollType: "initiative" }` grants
 * off the aggregate. The 2024 Assassin's Assassinate ("Advantage on Initiative
 * rolls") is the canonical source.
 *
 * Override-first: the caller passes `override` straight from the character's
 * manual toggle (`character.combat.initiativeAdvantageOverride`). `true`/`false`
 * force the flag on/off regardless of grants; `null`/`undefined` defers to the
 * auto-computed grant result — so a player can claim a situational advantage
 * the engine can't see, or suppress one a DM has ruled away.
 */
export function hasInitiativeAdvantage(
  aggregate: Pick<AggregatedGrants, "advantages">,
  override?: boolean | null
): boolean {
  if (override != null) return override;
  return aggregate.advantages.some((a) => a.rollType === "initiative");
}

/**
 * The Fighter-style class-table Extra Attack contribution for ONE class at ONE
 * level (`classSpecific.extraAttacks`). Pure — narrows the loosely-typed
 * `classSpecific` value to a number, 0 when absent. Resolve the level from the
 * class's OWN entry level, never the total character level.
 */
export function tableExtraAttacksAtLevel(
  classTable: SrdClassTable | undefined,
  level: number
): number {
  const row = classTable?.levels.find((l) => l.level === level);
  const raw = row?.classSpecific?.extraAttacks;
  return typeof raw === "number" ? raw : 0;
}

/**
 * The MAX class-table Extra Attack contribution across ALL of a character's
 * classes, each resolved at THAT class's own entry level. RAW 2024 multiclass
 * rule: "If you gain the Extra Attack feature from more than one class, the
 * features don't add together" — so a Fighter 11 / Barbarian 5 makes 3 attacks
 * (Fighter's +2), never 3+1. Single-class reduces to that one class at its level.
 *
 * Takes a `getTable` resolver so this pure module stays free of the SRD class
 * data import (no cycle); callers pass `getClassTable`.
 */
export function maxTableExtraAttacks(
  classes: ReadonlyArray<{ classId: string; level: number }>,
  getTable: (classId: string) => SrdClassTable | undefined
): number {
  let best = 0;
  for (const e of classes) {
    const extra = tableExtraAttacksAtLevel(getTable(e.classId), e.level);
    if (extra > best) best = extra;
  }
  return best;
}

/**
 * Number of weapon attacks a character makes with a single Attack action.
 *
 * Base is 1. The number of EXTRA attacks comes from two sources, and the
 * largest wins (they NEVER stack):
 *  - Fighter (and any class) encodes its scaling count in the class table
 *    (`classSpecific.extraAttacks`: +1 at L5, +2 at L11, +3 at L20). For a
 *    multiclass character this is the MAX across all classes, EACH resolved at
 *    that class's own entry level (`maxTableExtraAttacks`) — NEVER the primary
 *    class read at the total character level (a Fighter 5 / Wizard 5 makes
 *    exactly 2 attacks, not the 3 a Fighter-11 row would give).
 *  - Every other Extra Attack source declares an `extra-attack` Grant which the
 *    grants aggregate collapses to `extraAttacks` (MAX, since it never stacks).
 *    Barbarian/Paladin/Ranger/Monk L5, Valor/Sword Bard, Battle Smith/Armorer
 *    Artificer, Bladesinger → +1; Warlock's Thirsting Blade invocation → +1,
 *    upgraded to +2 by Devouring Blade.
 *
 * `tableExtra` is the pre-resolved class-table contribution (use
 * `maxTableExtraAttacks(classes, getClassTable)` at the call site so the
 * per-class own-level resolution happens once and this stays a pure number op).
 * Reading `aggregate.extraAttacks` REPLACES the old `srdId.includes(
 * "extra-attack")` substring heuristic — the mechanic now flows through the
 * declarative grant seam, so non-class sources (invocations, magic items, …)
 * count without compute.ts knowing their feature ids. `aggregate` is optional
 * for legacy/test callers that have no grants context.
 *
 * (Two-Weapon Fighting and Action Surge are separate and not counted here.)
 */
export function attacksPerAction(
  tableExtra: number,
  aggregate?: Pick<AggregatedGrants, "extraAttacks">
): number {
  const grantExtra = aggregate?.extraAttacks ?? 0;
  return 1 + Math.max(tableExtra, grantExtra);
}

/**
 * Calculate point-buy cost for an ability score.
 * Scores 8-13 cost 1 per point above 8.
 * Scores 14-15 cost 2 per point above 13.
 */
export function pointBuyCost(score: number): number {
  if (score < 8 || score > 15) return -1; // Invalid
  if (score <= 13) return score - 8;
  // 14 costs 7, 15 costs 9
  return 5 + (score - 13) * 2;
}

/**
 * Calculate total point-buy cost for a full set of ability scores.
 */
export function totalPointBuyCost(scores: Record<AbilityCode, number>): number {
  return Object.values(scores).reduce((sum, score) => sum + pointBuyCost(score), 0);
}

/**
 * Calculate HP average for a hit die on level-up.
 * Formula: (die / 2) + 1 (rounded up for odd dice)
 */
export function hitDieAverage(die: 4 | 6 | 8 | 10 | 12): number {
  return die / 2 + 1;
}

/**
 * M6 — short-rest heal estimate (2024 RAW).
 *
 * Spending a hit die during a short rest restores `roll(die) + CON mod` HP,
 * with a minimum of 1 HP per die. This helper returns the min / avg / max
 * total heal across `diceSpent` dice — useful for the confirm-rest preview.
 *
 * Returns zeros when no dice are spent.
 */
export function previewShortRestHeal(args: {
  diceSpent: number;
  hitDie: 4 | 6 | 8 | 10 | 12;
  conMod: number;
}): { min: number; avg: number; max: number; perDieAvg: number } {
  const { diceSpent, hitDie, conMod } = args;
  if (diceSpent <= 0) return { min: 0, avg: 0, max: 0, perDieAvg: 0 };
  const perDieMin = Math.max(1, 1 + conMod);
  const perDieMax = Math.max(1, hitDie + conMod);
  const perDieAvg = Math.max(1, hitDieAverage(hitDie) + conMod);
  return {
    min: perDieMin * diceSpent,
    avg: perDieAvg * diceSpent,
    max: perDieMax * diceSpent,
    perDieAvg,
  };
}

/**
 * Calculate max HP at a given level.
 *
 * RAW 2024 (PHB p.21): every level grants at least 1 HP — "If your CON
 * modifier reduces the total to 0 or less, you gain 1 Hit Point." The
 * per-level floor must be applied PER LEVEL, not to the running sum.
 * Previously a low-CON character at level 5+ could be assigned negative
 * incremental HP that the level-1 grant absorbed, producing a single global
 * `max(1, …)` floor where RAW guarantees one HP per level.
 *
 * Example: d6 / CON 1 (mod −5) at level 5:
 *   • Old buggy math: 1 + 4 × (4 − 5) = −3, clamped to 1.
 *   • RAW: max(1, 6−5) + 4 × max(1, 4−5) = 1 + 4 × 1 = 5.
 *
 * Level 1 uses the hit die's max (RAW), subsequent levels use the average.
 */
export function calculateMaxHP(
  hitDie: 4 | 6 | 8 | 10 | 12,
  conScore: number,
  level: number
): number {
  const conMod = abilityModifier(conScore);
  const firstLevel = Math.max(1, hitDie + conMod);
  const perSubsequent = Math.max(1, hitDieAverage(hitDie) + conMod);
  const subsequentLevels = (level - 1) * perSubsequent;
  return firstLevel + subsequentLevels;
}

/**
 * Skill id → governing ability, DERIVED once from `ALL_SKILLS` (the single
 * source of truth for the 18 skills' abilities — golden rule 6). Built at
 * module load so `skillAbility` is an O(1) lookup with no hand-enumerated copy
 * to drift; an unknown id falls back to STR (the historical default).
 */
const SKILL_ABILITY = new Map<string, AbilityCode>(
  ALL_SKILLS.map((s) => [s.id, s.ability])
);

/**
 * Get the ability score associated with a D&D skill. Resolves against the
 * `ALL_SKILLS` catalog (no duplicated per-skill table); unknown ids → STR.
 */
export function skillAbility(skill: string): AbilityCode {
  return SKILL_ABILITY.get(skill) ?? "STR";
}

// ALL_SKILLS + skillNameToId live in the SRD-free `@/lib/skills` module (imported
// at the top, re-exported below) so eager sanitizers can use them without dragging
// the SRD; every `from "@/lib/compute"` import still resolves — single source.
export { ALL_SKILLS, skillNameToId };

/**
 * All ability scores with full names.
 */
export const ALL_ABILITIES: Array<{ code: AbilityCode; name: string }> = [
  { code: "STR", name: "Strength" },
  { code: "DEX", name: "Dexterity" },
  { code: "CON", name: "Constitution" },
  { code: "INT", name: "Intelligence" },
  { code: "WIS", name: "Wisdom" },
  { code: "CHA", name: "Charisma" },
];

// ============================================================
// Weapon Proficiency & Stat Resolution
// ============================================================

/**
 * Weapon-type group {@link ProficiencyToken} → the SRD equipment `srdId` it makes
 * the wielder proficient with. The token is plural (`longswords`); the weapon's
 * stable id is singular (`longsword`). This is the ONE place the two relate, so a
 * group proficiency is matched against the weapon's stable id, never its display
 * NAME (golden rule 7 — no localized string in the predicate).
 */
const WEAPON_GROUP_TOKEN_TO_SRD_ID: Readonly<Record<string, string>> = {
  clubs: "club",
  daggers: "dagger",
  darts: "dart",
  "hand-crossbows": "hand-crossbow",
  javelins: "javelin",
  "light-crossbows": "light-crossbow",
  longbows: "longbow",
  longswords: "longsword",
  maces: "mace",
  quarterstaffs: "quarterstaff",
  rapiers: "rapier",
  scimitars: "scimitar",
  shortbows: "shortbow",
  shortswords: "shortsword",
  sickles: "sickle",
  slings: "sling",
  spears: "spear",
};

/**
 * Check if a character is proficient with a specific weapon based on their class.
 *
 * Matches the weapon against the class/feature {@link ProficiencyToken} set:
 *  - the broad tiers `simple-weapons` / `martial-weapons` (by `weaponCategory`);
 *  - the Monk's `martial-weapons-finesse-or-light` / `martial-weapons-light`
 *    (martial + the Finesse/Light property);
 *  - `martial-ranged-weapons` (martial + `weaponType === "ranged"` — Artificer);
 *  - a weapon-type group (`longswords`, `hand-crossbows`) matched against the
 *    weapon's stable `weaponSrdId` (never its localized name);
 *  - `improvised-weapons` (never a carried SRD weapon — informational only).
 *
 * @param weaponCategory - "simple" | "martial" from SrdEquipmentData (undefined for
 *   a manifested/custom weapon with no SRD category)
 * @param weaponSrdId - The weapon's stable SRD id (e.g. "longsword"), or undefined
 *   for a manifested weapon (group tokens never apply to it)
 * @param weaponType - "melee" | "ranged" (for `martial-ranged-weapons`)
 * @param weaponProperties - Array of properties (e.g. ["Finesse", "Light"])
 * @param classWeaponProficiencies - The character's weapon proficiency tokens
 */
export function isWeaponProficient(
  weaponCategory: "simple" | "martial" | undefined,
  weaponSrdId: string | undefined,
  weaponType: "melee" | "ranged" | undefined,
  weaponProperties: ReadonlyArray<string>,
  classWeaponProficiencies: ReadonlyArray<ProficiencyToken>
): boolean {
  const tokens = new Set<string>(classWeaponProficiencies);

  // Broad tiers.
  if (weaponCategory === "simple" && tokens.has("simple-weapons")) return true;
  if (weaponCategory === "martial" && tokens.has("martial-weapons")) return true;

  // Monk: "Martial weapons (Finesse or Light)" / "(Light)".
  if (weaponCategory === "martial") {
    const hasFinesse = weaponProperties.some((p) => p.toLowerCase() === "finesse");
    const hasLight = weaponProperties.some((p) => p.toLowerCase() === "light");
    if (tokens.has("martial-weapons-finesse-or-light") && (hasFinesse || hasLight)) {
      return true;
    }
    if (tokens.has("martial-weapons-light") && hasLight) return true;
    // Artificer Battle Smith: "Martial Ranged weapons".
    if (tokens.has("martial-ranged-weapons") && weaponType === "ranged") return true;
  }

  // Weapon-type group, matched against the stable srdId (never the display name).
  if (weaponSrdId) {
    for (const token of tokens) {
      if (WEAPON_GROUP_TOKEN_TO_SRD_ID[token] === weaponSrdId) return true;
    }
  }

  return false;
}

/**
 * THE one authority for a weapon attack's ability score (golden rule 6). Every
 * surface that shows a weapon to-hit — the Combat carried-weapon row, manifested
 * weapons, AND the Inventory weapon row — resolves through THIS function, so the
 * inventory figure can never disagree with the Play card by construction.
 * - Ranged weapons → DEX.
 * - Finesse melee → the higher of STR/DEX (compared by MODIFIER, ties → DEX).
 * - Otherwise → STR.
 * Then the best of any `weapon-attack-ability` swap (Bladesong → INT; Monk
 * Martial Arts → DEX, gated to Monk weapons via the caller-supplied `isMonkMelee`
 * flag) is taken — a swap wins only when its ability's modifier is STRICTLY
 * higher. `magicOnly` swaps are skipped (magic-weapon detection not yet wired).
 * `scores` are the EFFECTIVE scores (set-score item floors), so a Gauntlets of
 * Ogre Power user resolves the same on both surfaces.
 */
export function resolveWeaponAttackStat(ctx: {
  weaponType: "melee" | "ranged" | undefined;
  properties: ReadonlyArray<string>;
  scores: Record<AbilityCode, number>;
  weaponAttackAbilities: ReadonlyArray<{
    ability: AbilityCode;
    magicOnly: boolean;
    weaponScope?: "monk-melee";
  }>;
  /** Whether THIS weapon is a Monk weapon (Simple Melee or Light Martial Melee) —
   *  gates the `weaponScope: "monk-melee"` DEX swap. The caller computes it from
   *  `isMonkMeleeWeapon` (custom weapons supply their own `attackStat` upstream). */
  isMonkMelee: boolean;
}): AbilityCode {
  const { weaponType, properties, scores, weaponAttackAbilities, isMonkMelee } = ctx;
  const isRanged = weaponType === "ranged";
  const isFinesse = properties.some((p) => p.toLowerCase() === "finesse");

  let attackStat: AbilityCode = "STR";
  if (isRanged) {
    attackStat = "DEX";
  } else if (isFinesse) {
    attackStat =
      abilityModifier(scores.DEX) >= abilityModifier(scores.STR) ? "DEX" : "STR";
  }
  for (const wa of weaponAttackAbilities) {
    if (wa.magicOnly) continue;
    if (wa.weaponScope === "monk-melee" && !isMonkMelee) continue;
    if (abilityModifier(scores[wa.ability]) > abilityModifier(scores[attackStat])) {
      attackStat = wa.ability;
    }
  }
  return attackStat;
}

/**
 * Classes that have the Weapon Mastery feature (all at level 1).
 */
const WEAPON_MASTERY_CLASSES: ReadonlySet<string> = new Set([
  "barbarian",
  "fighter",
  "paladin",
  "ranger",
  "rogue",
]);

/**
 * Check if a character's class grants the Weapon Mastery feature.
 */
export function hasWeaponMastery(classId: string): boolean {
  return WEAPON_MASTERY_CLASSES.has(classId.toLowerCase());
}
