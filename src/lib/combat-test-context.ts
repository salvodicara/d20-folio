/**
 * Pure table-context composition for one attack D20 Test.
 *
 * The character/action engines already own the attack bonus and target AC. This seam
 * adds only facts that depend on the two creatures and the physical table: conditions,
 * visibility, distance, cover, and range. Every derived rule keeps a stable source id
 * so a result can explain exactly why Advantage, Disadvantage, ineligibility, or a
 * forced Critical Hit applied.
 */

import { evaluateD20Test, reviewD20Test } from "@/lib/d20-test";
import type {
  DiceObservation,
  DiceRollRequirement,
  DiceTrailObservation,
} from "@/types/dice-formula";
import type {
  D20ResolutionFact,
  D20TestObservation,
  D20TestRequest,
  D20TestResult,
} from "@/types/d20-test";
import type { EntityRef } from "@/types/mechanics-reference";

/**
 * Deterministic transient identity for one combat-table creature. Entered
 * combat D20 Tests are evaluated and discarded in the same interaction, so a
 * synthetic shared material is enough; the prefix keeps every combatant id
 * (including the solo "self") a legal material entity id.
 */
export function combatTableEntityRef(combatantId: string): EntityRef {
  return {
    entityId: `combatant:${combatantId}`,
    material: { campaignId: "combat-table", kind: "shared-combat" },
    ordinal: 1,
  };
}

export type CombatAttackCover = "none" | "half" | "three-quarters" | "total";
export type CombatAttackRangeBand = "normal" | "long" | "beyond";
export type CombatAttackModeAdjustment = {
  readonly sourceId: string;
  readonly mode: "advantage" | "disadvantage";
};

export interface CombatAttackTableFacts {
  readonly attackerCanSeeTarget: boolean;
  readonly targetCanSeeAttacker: boolean;
  readonly targetWithinFiveFeet: boolean;
  readonly rangeBand: CombatAttackRangeBand;
  readonly cover: CombatAttackCover;
  /** A reviewed source that explicitly ignores this target's cover. */
  readonly coverIgnoredBySourceId?: string;
  /** A hostile creature within 5 feet threatens this ranged attack. */
  readonly rangedThreatenedWithinFiveFeet: boolean;
  /** The selected target is the creature currently grappling the attacker. */
  readonly targetIsGrappler: boolean;
  /** The source of the attacker's Frightened condition is currently in sight. */
  readonly frighteningSourceInSight: boolean;
}

export interface ComposeCombatAttackContextInput {
  readonly testId: string;
  readonly actorId: string;
  readonly targetId: string;
  readonly attackBonus: number;
  readonly criticalThreshold: number;
  readonly baseArmorClass: number;
  readonly attackMode: "melee" | "ranged";
  readonly actorConditions: readonly string[];
  readonly targetConditions: readonly string[];
  readonly table: CombatAttackTableFacts;
  readonly externalModeAdjustments?: readonly CombatAttackModeAdjustment[];
}

export type CombatAttackContextEffect =
  | "advantage"
  | "disadvantage"
  | "forced-critical"
  | "cover-bonus"
  | "cover-ignored"
  | "ineligible";

export interface CombatAttackContextFact {
  readonly sourceId: string;
  readonly effect: CombatAttackContextEffect;
  readonly value?: number;
}

export interface ComposedCombatAttackContext {
  readonly context: Extract<D20TestRequest, { readonly kind: "attack" }>;
  readonly baseArmorClass: number;
  readonly effectiveArmorClass: number;
  readonly coverBonus: number;
  readonly facts: readonly CombatAttackContextFact[];
}

const TARGET_ADVANTAGE_CONDITIONS = [
  "blinded",
  "paralyzed",
  "petrified",
  "restrained",
  "stunned",
  "unconscious",
] as const;

const ACTOR_DISADVANTAGE_CONDITIONS = [
  "blinded",
  "poisoned",
  "prone",
  "restrained",
] as const;

const INCAPACITATING_CONDITIONS = [
  "incapacitated",
  "paralyzed",
  "petrified",
  "stunned",
  "unconscious",
] as const;

/** Sensible reviewed defaults: clear sight, normal range, and no cover. */
export function defaultCombatAttackTableFacts(
  attackMode: "melee" | "ranged"
): CombatAttackTableFacts {
  return {
    attackerCanSeeTarget: true,
    targetCanSeeAttacker: true,
    targetWithinFiveFeet: attackMode === "melee",
    rangeBand: "normal",
    cover: "none",
    rangedThreatenedWithinFiveFeet: false,
    targetIsGrappler: false,
    frighteningSourceInSight: true,
  };
}

function conditionSet(values: readonly string[]): ReadonlySet<string> {
  return new Set(values.map((value) => value.toLowerCase()));
}

/** Compose one exact attack context; never rolls, mutates, or localizes. */
export function composeCombatAttackContext(
  input: ComposeCombatAttackContextInput
): ComposedCombatAttackContext {
  const actor = conditionSet(input.actorConditions);
  const target = conditionSet(input.targetConditions);
  const advantages: string[] = [];
  const disadvantages: string[] = [];
  const forcedCriticals: string[] = [];
  const facts: CombatAttackContextFact[] = [];

  const add = (
    list: string[],
    sourceId: string,
    effect: "advantage" | "disadvantage" | "forced-critical"
  ): void => {
    list.push(sourceId);
    facts.push({ sourceId, effect });
  };

  for (const condition of ACTOR_DISADVANTAGE_CONDITIONS) {
    if (actor.has(condition)) {
      add(
        disadvantages,
        `condition:actor:${condition}:attack-disadvantage`,
        "disadvantage"
      );
    }
  }
  if (actor.has("frightened") && input.table.frighteningSourceInSight) {
    add(disadvantages, "condition:actor:frightened:source-in-sight", "disadvantage");
  }
  if (actor.has("grappled") && !input.table.targetIsGrappler) {
    add(disadvantages, "condition:actor:grappled:other-target", "disadvantage");
  }

  for (const condition of TARGET_ADVANTAGE_CONDITIONS) {
    if (target.has(condition)) {
      add(
        advantages,
        `condition:target:${condition}:incoming-attack-advantage`,
        "advantage"
      );
    }
  }

  if (!input.table.attackerCanSeeTarget) {
    add(
      disadvantages,
      target.has("invisible")
        ? "condition:target:invisible:unseen"
        : "table:visibility:target-unseen",
      "disadvantage"
    );
  }
  if (!input.table.targetCanSeeAttacker) {
    add(
      advantages,
      actor.has("invisible")
        ? "condition:actor:invisible:unseen-attacker"
        : "table:visibility:attacker-unseen",
      "advantage"
    );
  }

  if (target.has("prone")) {
    add(
      input.table.targetWithinFiveFeet ? advantages : disadvantages,
      input.table.targetWithinFiveFeet
        ? "condition:target:prone:within-5-feet"
        : "condition:target:prone:beyond-5-feet",
      input.table.targetWithinFiveFeet ? "advantage" : "disadvantage"
    );
  }

  if (input.attackMode === "ranged" && input.table.rangeBand === "long") {
    add(disadvantages, "table:range:long", "disadvantage");
  }
  if (input.attackMode === "ranged" && input.table.rangedThreatenedWithinFiveFeet) {
    add(disadvantages, "table:ranged-threat:within-5-feet", "disadvantage");
  }

  input.externalModeAdjustments?.forEach((adjustment, index) => {
    add(
      adjustment.mode === "advantage" ? advantages : disadvantages,
      `external:${index}:${adjustment.sourceId}:${adjustment.mode}`,
      adjustment.mode
    );
  });

  if (input.table.targetWithinFiveFeet) {
    for (const condition of ["paralyzed", "unconscious"] as const) {
      if (target.has(condition)) {
        add(
          forcedCriticals,
          `condition:target:${condition}:critical-within-5-feet`,
          "forced-critical"
        );
      }
    }
  }

  const coverIgnored =
    input.table.cover !== "none" &&
    input.table.coverIgnoredBySourceId !== undefined &&
    input.table.coverIgnoredBySourceId.trim().length > 0;
  const coverBonus = coverIgnored
    ? 0
    : input.table.cover === "half"
      ? 2
      : input.table.cover === "three-quarters"
        ? 5
        : 0;
  if (coverIgnored) {
    facts.push({
      sourceId: `table:cover:ignored:${input.table.coverIgnoredBySourceId}`,
      effect: "cover-ignored",
    });
  } else if (coverBonus > 0) {
    facts.push({
      sourceId: `table:cover:${input.table.cover}`,
      effect: "cover-bonus",
      value: coverBonus,
    });
  }

  let resolutionFact: Extract<D20ResolutionFact, { kind: "ineligible" }> | undefined;
  const incapacitatingCondition = INCAPACITATING_CONDITIONS.find((condition) =>
    actor.has(condition)
  );
  if (incapacitatingCondition) {
    resolutionFact = {
      kind: "ineligible",
      sourceId: `condition:actor:${incapacitatingCondition}:cannot-attack`,
      reasonId: "actor-incapacitated",
    };
  } else if (input.table.rangeBand === "beyond") {
    resolutionFact = {
      kind: "ineligible",
      sourceId: "table:range:beyond",
      reasonId: "beyond-range",
    };
  } else if (input.table.cover === "total" && !coverIgnored) {
    resolutionFact = {
      kind: "ineligible",
      sourceId: "table:cover:total",
      reasonId: "total-cover",
    };
  }
  if (resolutionFact) {
    facts.push({ sourceId: resolutionFact.sourceId, effect: "ineligible" });
  }

  const effectiveArmorClass = input.baseArmorClass + coverBonus;
  return {
    context: {
      actor: combatTableEntityRef(input.actorId),
      armorClass: { kind: "fixed", value: effectiveArmorClass },
      automaticCriticalSourceIds: forcedCriticals,
      criticalThreshold: { kind: "fixed", value: input.criticalThreshold },
      enteredModifiers: [],
      kind: "attack",
      modifiers: [
        {
          sourceId: `action:${input.testId}:attack-bonus`,
          value: { kind: "fixed", value: input.attackBonus },
        },
      ],
      resolution: resolutionFact ?? { kind: "rolled" },
      rollRules: {
        advantageSourceIds: advantages,
        disadvantageSourceIds: disadvantages,
        extraD20SourceIds: [],
        faceFloors: [],
        replacements: [],
        substitutions: [],
        totalFloors: [],
      },
      target: combatTableEntityRef(input.targetId),
      testId: input.testId,
    },
    baseArmorClass: input.baseArmorClass,
    effectiveArmorClass,
    coverBonus,
    facts,
  };
}

/** Physical facts entered at the table for one combat D20 Test. */
export interface CombatEnteredD20Facts {
  /** Natural d20 faces in trail order; empty for a non-rolled test. */
  readonly faces: readonly number[];
  /** Entered faces per authored entered-modifier source, in trail order. */
  readonly enteredModifierFaces?: Readonly<Record<string, readonly number[]>>;
  /** An explicit table ruling that replaces the computed outcome. */
  readonly manualOutcome?: "success" | "failure" | null;
  readonly manualOutcomeSourceId?: string;
}

function facedTrails(
  requirement: Readonly<DiceRollRequirement>,
  faces: readonly number[]
): DiceObservation | null {
  if (requirement.trails.length !== faces.length || requirement.aggregates.length > 0) {
    return null;
  }
  const trails: DiceTrailObservation[] = [];
  for (const [index, trail] of requirement.trails.entries()) {
    const face = faces[index];
    if (face === undefined) return null;
    trails.push({ initialFace: face, steps: [], trailId: trail.trailId });
  }
  return { aggregates: [], trails };
}

/**
 * Evaluate one already-resolved combat D20 request against entered faces.
 * The request's expressions must be closed (no bindings); returns `null` for
 * any malformed request or physical fact instead of guessing.
 */
export function evaluateEnteredCombatD20Test(
  requestValue: unknown,
  entered: CombatEnteredD20Facts
): Readonly<D20TestResult> | null {
  const review = reviewD20Test(requestValue, {});
  if (!review) return null;

  let d20: D20TestObservation["d20"] = null;
  const enteredModifiers: D20TestObservation["enteredModifiers"][number][] = [];
  if (review.d20Requirement === null) {
    if (entered.faces.length > 0) return null;
  } else {
    d20 = facedTrails(review.d20Requirement, entered.faces);
    if (!d20) return null;
    for (const rule of review.enteredModifiers) {
      const faces = entered.enteredModifierFaces?.[rule.sourceId];
      if (faces === undefined) {
        if (rule.required) return null;
        continue;
      }
      if (rule.kind !== "dice-formula") return null;
      const observation = facedTrails(rule.requirement, faces);
      if (!observation) return null;
      enteredModifiers.push({
        kind: "dice-formula",
        observation,
        sourceId: rule.sourceId,
      });
    }
  }

  let tableOverride: D20TestObservation["tableOverride"] = null;
  const manualOutcome = entered.manualOutcome ?? null;
  if (manualOutcome !== null) {
    const request = review.request;
    const sourceId =
      entered.manualOutcomeSourceId ?? `${request.testId}:review:table-ruling`;
    if (request.kind === "death-save") return null;
    if (request.kind === "attack") {
      const natural = evaluateD20Test(
        requestValue,
        {},
        {
          d20,
          enteredModifiers,
          tableOverride: null,
        }
      );
      if (!natural || natural.computedOutcome.kind !== "attack") return null;
      const hit = manualOutcome === "success";
      tableOverride = {
        critical:
          hit &&
          (natural.computedOutcome.naturalCritical ||
            request.automaticCriticalSourceIds.length > 0),
        hit,
        kind: "attack",
        reasonId: "table-ruling",
        sourceId,
      };
    } else {
      tableOverride = {
        kind: "outcome",
        outcome: manualOutcome,
        reasonId: "table-ruling",
        sourceId,
      };
    }
  }

  return evaluateD20Test(requestValue, {}, { d20, enteredModifiers, tableOverride });
}
