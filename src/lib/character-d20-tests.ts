/**
 * Character-owned D20 Test facts.
 *
 * These builders are the sole bridge from a live character document to the
 * locale-free entered-d20 kernel. They never roll: callers supply the physical
 * die faces, while this module resolves the character's current modifiers and
 * Advantage/Disadvantage sources at the commit boundary.
 */

import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { totalLevel } from "@/lib/classes";
import {
  combatTableEntityRef,
  evaluateEnteredCombatD20Test,
} from "@/lib/combat-test-context";
import {
  concentrationSaveDc,
  effectiveAbilityScores,
  exhaustionPenalty,
  flatSaveBonus,
  resolveConcentrationSaveBonus,
  resolveSaveBonus,
  savingThrowBonus,
} from "@/lib/compute";
import type { CharacterDoc } from "@/types/character";
import type { D20RollMode, D20TestRequest, D20TestResult } from "@/types/d20-test";
import type { PendingConcentrationSave } from "@/types/combat-state";

const DEATH_SAVE_VS = "death-saving-throws";
const CONCENTRATION_SAVE_VS = "concentration-con-save";

/** One resolved deterministic bonus term with its display provenance. */
export interface CharacterD20ModifierTerm {
  readonly sourceId: string;
  readonly kind: "feature" | "exhaustion" | "other";
  readonly value: number;
}

interface CharacterD20ContextBase {
  readonly testId: string;
  readonly actorId: string;
  readonly difficultyClass: number;
  readonly modifierTerms: readonly CharacterD20ModifierTerm[];
  readonly advantageSourceIds: readonly string[];
  readonly disadvantageSourceIds: readonly string[];
}

/** Fully resolved facts for one character Death Save. */
export interface CharacterDeathSaveD20Context extends CharacterD20ContextBase {
  readonly kind: "death-save";
  readonly deathSavePolicy: { readonly naturalTwentyThreshold: number };
}

/** Fully resolved facts for one queued Concentration maintenance save. */
export interface CharacterConcentrationSaveD20Context extends CharacterD20ContextBase {
  readonly kind: "concentration-save";
}

export type CharacterD20TestContext =
  | CharacterDeathSaveD20Context
  | CharacterConcentrationSaveD20Context;

/** Character-facing outcome view of one entered save. */
export interface CharacterReviewedD20Outcome {
  readonly status: "success" | "failure" | "total-only" | "ineligible";
  readonly deathSave?: {
    readonly naturalOne: boolean;
    readonly naturalTwentyBenefit: boolean;
    readonly naturalTwentyThreshold: number;
    readonly hitPointsRegained: 0 | 1;
    readonly successes: 0 | 1;
    readonly failures: 0 | 1 | 2;
  };
}

/** The full kernel fact plus the character-facing reviewed summary. */
export interface CharacterEnteredD20Result extends D20TestResult {
  readonly deterministicModifier: number;
  readonly mode: D20RollMode;
  readonly reviewedOutcome: CharacterReviewedD20Outcome;
}

function matchingSourceIds(
  clauses: ReadonlyArray<{ sourceId: string; rollType: string; vs: string }>,
  vs: string,
  polarity: "advantage" | "disadvantage"
): string[] {
  return [
    ...new Set(
      clauses
        .filter((clause) => clause.rollType === "save" && clause.vs === vs)
        // Source ids must be unique across one kernel request. Namespacing the
        // polarity keeps an authored source that contributes both sides valid;
        // the kernel then applies ordinary all-or-nothing cancellation.
        .map((clause) => `${polarity}:${clause.sourceId}`)
    ),
  ];
}

function effectiveScores(character: CharacterDoc) {
  const aggregate = aggregateCharacterGrants(character.character, character.session);
  return {
    aggregate,
    scores: effectiveAbilityScores(
      character.character.abilityScores,
      aggregate.abilityScoreFloors,
      aggregate.itemAbilityScoreBonus,
      aggregate.itemAbilityScoreCap
    ),
  };
}

/** Build a Death Save without smuggling in an ability-scoped CON-save bonus. */
export function deathSaveD20Context(
  character: CharacterDoc
): CharacterDeathSaveD20Context {
  const { aggregate, scores } = effectiveScores(character);
  const allSaveBonus = flatSaveBonus(aggregate, scores);
  const exhaustion = exhaustionPenalty(character.session.exhaustion);
  return {
    testId: `death-save:${character.id}`,
    actorId: character.id,
    kind: "death-save",
    difficultyClass: 10,
    deathSavePolicy: {
      naturalTwentyThreshold: aggregate.deathSaveCritThreshold,
    },
    modifierTerms: [
      ...(allSaveBonus === 0
        ? []
        : [
            {
              sourceId: "death-save:all-saves",
              kind: "feature" as const,
              value: allSaveBonus,
            },
          ]),
      ...(exhaustion === 0
        ? []
        : [
            {
              sourceId: "death-save:exhaustion",
              kind: "exhaustion" as const,
              value: exhaustion,
            },
          ]),
    ],
    advantageSourceIds: matchingSourceIds(
      aggregate.advantages,
      DEATH_SAVE_VS,
      "advantage"
    ),
    disadvantageSourceIds: matchingSourceIds(
      aggregate.disadvantages,
      DEATH_SAVE_VS,
      "disadvantage"
    ),
  };
}

/** Build the live Constitution save used to maintain one queued Concentration spell. */
export function concentrationSaveD20Context(
  character: CharacterDoc,
  pending: PendingConcentrationSave
): CharacterConcentrationSaveD20Context {
  const { aggregate, scores } = effectiveScores(character);
  const data = character.character;
  const override = data.savingThrowBonusOverrides?.CON ?? null;
  const allAndConScoped = resolveSaveBonus(aggregate, scores, "CON");
  const conSave = savingThrowBonus(
    scores.CON,
    totalLevel(data),
    data.savingThrows.includes("CON") || aggregate.saveProficiencies.has("CON"),
    override,
    0,
    data.proficiencyBonusOverride,
    allAndConScoped
  );
  // A pinned CON-save override owns the whole ordinary save total. Match the
  // established override-first contract by withholding concentration-only
  // derived bonuses in that case; Exhaustion remains a universal D20 penalty.
  const concentrationOnly =
    override == null ? resolveConcentrationSaveBonus(aggregate, scores) : 0;
  const exhaustion = exhaustionPenalty(character.session.exhaustion);
  return {
    testId: `concentration-save:${pending.id}`,
    actorId: character.id,
    kind: "concentration-save",
    difficultyClass: pending.difficultyClass,
    modifierTerms: [
      {
        sourceId: "concentration-save:con-save",
        kind: "other",
        value: conSave,
      },
      ...(concentrationOnly === 0
        ? []
        : [
            {
              sourceId: "concentration-save:only",
              kind: "feature" as const,
              value: concentrationOnly,
            },
          ]),
      ...(exhaustion === 0
        ? []
        : [
            {
              sourceId: "concentration-save:exhaustion",
              kind: "exhaustion" as const,
              value: exhaustion,
            },
          ]),
    ],
    advantageSourceIds: matchingSourceIds(
      aggregate.advantages,
      CONCENTRATION_SAVE_VS,
      "advantage"
    ),
    disadvantageSourceIds: matchingSourceIds(
      aggregate.disadvantages,
      CONCENTRATION_SAVE_VS,
      "disadvantage"
    ),
  };
}

/** One physical face normally; two only when exactly one roll polarity is present. */
export function enteredD20FaceCount(context: {
  readonly advantageSourceIds: readonly string[];
  readonly disadvantageSourceIds: readonly string[];
}): 1 | 2 {
  return context.advantageSourceIds.length > 0 !==
    context.disadvantageSourceIds.length > 0
    ? 2
    : 1;
}

function kernelRequest(context: CharacterD20TestContext): D20TestRequest {
  const common = {
    actor: combatTableEntityRef(context.actorId),
    enteredModifiers: [],
    modifiers: context.modifierTerms.map((term) => ({
      sourceId: term.sourceId,
      value: { kind: "fixed" as const, value: term.value },
    })),
    resolution: { kind: "rolled" as const },
    rollRules: {
      advantageSourceIds: context.advantageSourceIds,
      disadvantageSourceIds: context.disadvantageSourceIds,
      extraD20SourceIds: [],
      faceFloors: [],
      replacements: [],
      substitutions: [],
      totalFloors: [],
    },
    testId: context.testId,
  };
  if (context.kind === "death-save") {
    return {
      ...common,
      kind: "death-save",
      recoveryThreshold: {
        kind: "fixed",
        value: context.deathSavePolicy.naturalTwentyThreshold,
      },
      target: null,
    };
  }
  return {
    ...common,
    ability: "CON",
    difficultyClass: { kind: "fixed", value: context.difficultyClass },
    kind: "saving-throw",
    target: null,
  };
}

function resolveEnteredFaces(
  context: CharacterD20TestContext,
  faces: ReadonlyArray<number>
): CharacterEnteredD20Result {
  const result = evaluateEnteredCombatD20Test(kernelRequest(context), { faces });
  if (!result) {
    throw new TypeError("entered D20 faces do not satisfy the resolved save request");
  }
  const outcome = result.outcome;
  return {
    ...result,
    deterministicModifier: result.review.deterministicModifier,
    mode: result.review.mode,
    reviewedOutcome: {
      status: outcome.status,
      ...(outcome.kind === "death-save"
        ? {
            deathSave: {
              naturalOne: outcome.naturalOne,
              naturalTwentyBenefit: outcome.recoveryBenefit,
              naturalTwentyThreshold: outcome.recoveryThreshold,
              hitPointsRegained: outcome.hitPointsRegained,
              successes: outcome.successes,
              failures: outcome.failures,
            },
          }
        : {}),
    },
  };
}

export function resolveCharacterDeathSave(
  character: CharacterDoc,
  faces: ReadonlyArray<number>
): CharacterEnteredD20Result {
  return resolveEnteredFaces(deathSaveD20Context(character), faces);
}

export function resolveCharacterConcentrationSave(
  character: CharacterDoc,
  pending: PendingConcentrationSave,
  faces: ReadonlyArray<number>
): CharacterEnteredD20Result {
  if (concentrationSaveDc(pending.damage) !== pending.difficultyClass) {
    throw new TypeError("pending Concentration save has a stale damage/DC pair");
  }
  return resolveEnteredFaces(concentrationSaveD20Context(character, pending), faces);
}
