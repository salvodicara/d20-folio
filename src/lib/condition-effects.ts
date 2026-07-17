/**
 * Condition gates (ARCHITECTURE.md combat model — `CONDITION_GATES`).
 *
 * Each 2024 condition's *self-side* mechanical effects on the afflicted
 * character (what the player's own sheet must reflect): which economy slots it
 * forbids, whether it zeroes speed or breaks Concentration, which saves it
 * auto-fails, and the advantage/disadvantage it imposes. The adv/dis is emitted
 * as `AdvantageClause`s (the same shape `evaluateGrants` produces) so a consumer
 * merges them into the single advantages/disadvantages list — one source of
 * truth for "why do I have Disadvantage on attacks". Adding a condition effect
 * is one data row here, never combat-code.
 *
 * Attacker-side effects ("attack rolls against you have Advantage") are NOT
 * modeled here — they belong to whoever attacks this creature, not its own
 * roll state. Exhaustion is a numeric stepper handled elsewhere, not a gate.
 *
 * Pure module — no React/store/Firebase imports.
 */
import type { AbilityCode, BiText, ConditionId, SrdEquipmentData } from "@/data/types";
import type { CustomEquipment, SrdEquipmentRef } from "@/types/character";
import type { ProficiencyToken } from "@/types/ids";
import type { AdvantageClause } from "@/lib/grants";
import { isArmorProficient } from "@/lib/compute";
import { litText } from "@/lib/loc-text";

/** Combat economy slots a condition can forbid. */
export type GatedSlot = "action" | "bonus" | "reaction";

/** A single condition's self-side mechanical footprint. */
export interface ConditionGate {
  /** Economy slots this condition forbids (Incapacitated → action + bonus + reaction). */
  blockedSlots?: ReadonlyArray<GatedSlot>;
  /** Speed becomes 0 (Grappled, Restrained, the Incapacitated-adjacent set). */
  speedZero?: boolean;
  /** Concentration ends / can't be maintained (Incapacitated family). */
  breaksConcentration?: boolean;
  /** Ability saves the condition auto-fails (Paralyzed/Stunned → STR + DEX). */
  autoFailSaves?: ReadonlyArray<AbilityCode>;
  /** Self-side advantage the condition grants (rare — Invisible → your attacks). */
  advantages?: ReadonlyArray<{
    rollType: AdvantageClause["rollType"];
    vs: string;
    description: BiText;
  }>;
  /** Self-side disadvantage the condition imposes. */
  disadvantages?: ReadonlyArray<{
    rollType: AdvantageClause["rollType"];
    vs: string;
    description: BiText;
  }>;
}

const ATTACKS = { en: "Attack rolls", it: "Tiri per colpire" };
const ABILITY_CHECKS = { en: "Ability checks", it: "Prove di caratteristica" };

/** The Incapacitated family all forbid every action type + break Concentration. */
const INCAPACITATED_SLOTS: ReadonlyArray<GatedSlot> = ["action", "bonus", "reaction"];

export const CONDITION_GATES: Readonly<Partial<Record<ConditionId, ConditionGate>>> = {
  blinded: {
    disadvantages: [{ rollType: "attack", vs: "blinded", description: ATTACKS }],
  },
  frightened: {
    disadvantages: [
      { rollType: "attack", vs: "frightened", description: ATTACKS },
      { rollType: "check", vs: "frightened", description: ABILITY_CHECKS },
    ],
  },
  // 2024 RAW adds an "Attacks Affected" bullet absent from the 2014 condition:
  // Disadvantage on attack rolls against any target OTHER than the grappler
  // (the target-exclusion caveat rides as narrative, same pattern as
  // Frightened's line-of-sight caveat — no per-target roll-context primitive).
  grappled: {
    speedZero: true,
    disadvantages: [{ rollType: "attack", vs: "grappled", description: ATTACKS }],
  },
  incapacitated: {
    blockedSlots: INCAPACITATED_SLOTS,
    breaksConcentration: true,
  },
  invisible: {
    advantages: [{ rollType: "attack", vs: "invisible", description: ATTACKS }],
  },
  paralyzed: {
    blockedSlots: INCAPACITATED_SLOTS,
    breaksConcentration: true,
    speedZero: true,
    autoFailSaves: ["STR", "DEX"],
  },
  petrified: {
    blockedSlots: INCAPACITATED_SLOTS,
    breaksConcentration: true,
    speedZero: true,
    autoFailSaves: ["STR", "DEX"],
  },
  poisoned: {
    disadvantages: [
      { rollType: "attack", vs: "poisoned", description: ATTACKS },
      { rollType: "check", vs: "poisoned", description: ABILITY_CHECKS },
    ],
  },
  prone: {
    disadvantages: [{ rollType: "attack", vs: "prone", description: ATTACKS }],
  },
  restrained: {
    speedZero: true,
    disadvantages: [
      { rollType: "attack", vs: "restrained", description: ATTACKS },
      {
        rollType: "save",
        vs: "restrained-dex",
        description: { en: "Dexterity saving throws", it: "Tiri salvezza su Destrezza" },
      },
    ],
  },
  // 2024 RAW deliberately drops the 2014 "can't move" / Speed-0 clause here —
  // Stunned no longer zeroes Speed (that's now exclusive to Paralyzed among
  // the Incapacitated-adjacent conditions, distinguishing the two).
  stunned: {
    blockedSlots: INCAPACITATED_SLOTS,
    breaksConcentration: true,
    autoFailSaves: ["STR", "DEX"],
  },
  unconscious: {
    blockedSlots: INCAPACITATED_SLOTS,
    breaksConcentration: true,
    speedZero: true,
    autoFailSaves: ["STR", "DEX"],
  },
};

/**
 * RA-06 — does gaining THIS single condition end Concentration? True for the
 * Incapacitated family (Incapacitated / Stunned / Paralyzed / Petrified /
 * Unconscious), per SRD 5.2.1 "Concentration": "Your Concentration ends if you
 * have the Incapacitated condition." Reads the SAME `CONDITION_GATES` source the
 * unioned resolver does (golden rule 6), so the store's auto-drop can never drift
 * from the derived `breaksConcentration` flag. Unknown / custom ids → false.
 */
export function conditionBreaksConcentration(id: string): boolean {
  return CONDITION_GATES[id as ConditionId]?.breaksConcentration === true;
}

/** The resolved, unioned effect of every active condition on this character. */
export interface ResolvedConditionEffects {
  /** Economy slots forbidden by at least one active condition. */
  blockedSlots: ReadonlySet<GatedSlot>;
  /** Speed is 0 this turn. */
  speedZero: boolean;
  /** Concentration can't be held. */
  breaksConcentration: boolean;
  /** Ability saves auto-failed. */
  autoFailSaves: ReadonlySet<AbilityCode>;
  /** Self-side advantage clauses (mergeable into the grants advantages list). */
  advantages: ReadonlyArray<AdvantageClause>;
  /** Self-side disadvantage clauses (mergeable into the grants disadvantages list). */
  disadvantages: ReadonlyArray<AdvantageClause>;
}

/**
 * Union the gates of every active condition. The advantage/disadvantage clauses
 * carry `sourceId = <conditionId>` so a consumer can attribute and de-conflict
 * them (a roll with both an advantage and a disadvantage clause cancels to a
 * straight roll — that netting is the consumer's `netRollState`, not here).
 */
export function resolveConditionEffects(
  // Accepts the session's raw `conditions: string[]` — unknown / custom
  // condition strings simply have no gate and are skipped.
  active: ReadonlyArray<string>
): ResolvedConditionEffects {
  const blockedSlots = new Set<GatedSlot>();
  const autoFailSaves = new Set<AbilityCode>();
  const advantages: AdvantageClause[] = [];
  const disadvantages: AdvantageClause[] = [];
  let speedZero = false;
  let breaksConcentration = false;

  for (const id of active) {
    const gate = CONDITION_GATES[id as ConditionId];
    if (!gate) continue;
    for (const slot of gate.blockedSlots ?? []) blockedSlots.add(slot);
    if (gate.speedZero) speedZero = true;
    if (gate.breaksConcentration) breaksConcentration = true;
    for (const ability of gate.autoFailSaves ?? []) autoFailSaves.add(ability);
    for (const a of gate.advantages ?? []) {
      advantages.push({
        sourceId: id,
        rollType: a.rollType,
        vs: a.vs,
        // Engine-authored condition-rule blurb (not SRD data) → an engine literal.
        description: litText(a.description),
      });
    }
    for (const d of gate.disadvantages ?? []) {
      disadvantages.push({
        sourceId: id,
        rollType: d.rollType,
        vs: d.vs,
        description: litText(d.description),
      });
    }
  }

  return {
    blockedSlots,
    speedZero,
    breaksConcentration,
    autoFailSaves,
    advantages,
    disadvantages,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Armor effects (S13) — the heavy-armor Strength SPEED penalty + the
// unproficient-armor self-side DISADVANTAGE, both derived from CURRENTLY WORN
// armor (a runtime equipment state, not a static grant). Emits the same
// `AdvantageClause` shape the condition gates do, so the unproficient-armor
// disadvantage merges into the ONE advantages/disadvantages list (rule 6 — one
// source: the combat chip list AND the Inventory gloss both read this predicate).
// ════════════════════════════════════════════════════════════════════════════

/** Engine-authored roll descriptors for the unproficient-armor disadvantage. */
const UNPROFICIENT_ARMOR_STR_DEX_CHECKS: BiText = {
  en: "Strength + Dexterity ability checks",
  it: "Prove di Forza e Destrezza",
};
const UNPROFICIENT_ARMOR_STR_DEX_SAVES: BiText = {
  en: "Strength + Dexterity saving throws",
  it: "Tiri salvezza su Forza e Destrezza",
};
const UNPROFICIENT_ARMOR_ATTACKS: BiText = {
  en: "Attack rolls (wearing armor you lack proficiency with)",
  it: "Tiri per colpire (indossando armatura senza competenza)",
};

/** The resolved self-side footprint of currently worn armor. */
export interface ResolvedArmorEffects {
  /**
   * Flat walking-Speed penalty in feet (−10 when worn body armor lists a
   * Strength requirement the wearer's EFFECTIVE Strength doesn't meet; a flat
   * −10, never cumulative). 0 when nothing applies / no resolver.
   */
  speedPenaltyFt: number;
  /** True iff any equipped armor is in a category the class lacks proficiency in. */
  unproficientArmorEquipped: boolean;
  /**
   * The unproficient-armor self-side DISADVANTAGE clauses (STR/DEX checks +
   * saves + attack rolls — 2024 RAW), mergeable into the grants disadvantages
   * list. Empty when proficient / no armor worn.
   */
  disadvantages: ReadonlyArray<AdvantageClause>;
}

const NO_ARMOR_EFFECTS: ResolvedArmorEffects = {
  speedPenaltyFt: 0,
  unproficientArmorEquipped: false,
  disadvantages: [],
};

/**
 * Resolve the self-side effects of CURRENTLY WORN armor. Mirrors `computeAC`'s
 * "equipped" + resolve loop so the two always agree about what counts as "worn".
 *
 * - `speedPenaltyFt`: a flat −10 ft when worn body armor's `strengthReq` exceeds
 *   the wearer's EFFECTIVE Strength (Plate/Splint → Str 15, Chain Mail → Str 13).
 *   Shields are exempt. The same `effectiveStr` the combat/score family uses
 *   (post-Gauntlets/Belt) is passed in by the consumer.
 * - the unproficient-armor DISADVANTAGE on every Strength + Dexterity D20 test,
 *   emitted as `AdvantageClause`s (the can't-cast-spells note already lives in
 *   the Inventory gloss). `classArmorProficiencies` is the EFFECTIVE token set —
 *   pass it (even EMPTY, e.g. a Wizard proficient with NO armor) to RUN the
 *   proficiency gate; OMIT it (`undefined`) to SKIP the gate entirely (the
 *   speed-only caller, which can't see proficiencies and doesn't need them).
 *
 * Pure / deterministic. Only SRD armor carries `strengthReq`/`armorCategory`;
 * custom armor exposes `armorCategory` inline and contributes the proficiency
 * gate but no Strength penalty (homebrew carries no requirement).
 */
export function resolveArmorEffects(
  equipment: ReadonlyArray<SrdEquipmentRef | CustomEquipment>,
  resolveSrd: (id: string) => SrdEquipmentData | undefined,
  effectiveStr: number,
  classArmorProficiencies?: ReadonlyArray<ProficiencyToken>
): ResolvedArmorEffects {
  let speedPenaltyFt = 0;
  let unproficientArmorEquipped = false;
  for (const item of equipment) {
    if (!item.equipped) continue;
    const armorCategory =
      "custom" in item ? item.armorCategory : resolveSrd(item.srdId)?.armorCategory;
    if (!armorCategory) continue;
    // Body armor (never a shield) carries the Strength-requirement speed penalty.
    if (armorCategory !== "shield" && !("custom" in item)) {
      const srd = resolveSrd(item.srdId);
      if (srd?.strengthReq != null && effectiveStr < srd.strengthReq) speedPenaltyFt = 10;
    }
    if (
      classArmorProficiencies !== undefined &&
      !isArmorProficient(armorCategory, classArmorProficiencies)
    ) {
      unproficientArmorEquipped = true;
    }
  }

  if (!unproficientArmorEquipped) {
    return speedPenaltyFt === 0
      ? NO_ARMOR_EFFECTS
      : { speedPenaltyFt, unproficientArmorEquipped: false, disadvantages: [] };
  }

  // 2024 RAW: wearing armor you lack proficiency with → Disadvantage on every
  // ability check, saving throw, and attack roll that uses STR or DEX.
  const disadvantages: AdvantageClause[] = [
    {
      sourceId: "unproficient-armor",
      rollType: "check",
      vs: "unproficient-armor",
      description: litText(UNPROFICIENT_ARMOR_STR_DEX_CHECKS),
    },
    {
      sourceId: "unproficient-armor",
      rollType: "save",
      vs: "unproficient-armor",
      description: litText(UNPROFICIENT_ARMOR_STR_DEX_SAVES),
    },
    {
      sourceId: "unproficient-armor",
      rollType: "attack",
      vs: "unproficient-armor",
      description: litText(UNPROFICIENT_ARMOR_ATTACKS),
    },
  ];
  return { speedPenaltyFt, unproficientArmorEquipped: true, disadvantages };
}

/**
 * RAW 2024 advantage/disadvantage netting: if a roll has at least one source of
 * Advantage AND at least one source of Disadvantage, they cancel to a straight
 * roll — regardless of how many of each. Otherwise the present side wins.
 */
export function netRollState(
  hasAdvantage: boolean,
  hasDisadvantage: boolean
): "advantage" | "disadvantage" | "none" {
  if (hasAdvantage && hasDisadvantage) return "none";
  if (hasAdvantage) return "advantage";
  if (hasDisadvantage) return "disadvantage";
  return "none";
}
