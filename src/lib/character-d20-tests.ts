/**
 * Character-owned D20 Test facts.
 *
 * These builders are the sole bridge from a live character document to the
 * locale-free entered-d20 kernel. They never roll: callers supply the physical
 * die faces, while this module resolves the character's current modifiers and
 * Advantage/Disadvantage sources at the commit boundary.
 */

import { heldSpellCastWith } from "@/lib/play/cast-record";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { totalLevel } from "@/lib/classes";
import { getSpellById } from "@/data/spells";
import {
  combatTableEntityRef,
  evaluateEnteredCombatD20Test,
} from "@/lib/combat-test-context";
import {
  concentrationSaveDc,
  exhaustionPenalty,
  flatSaveBonus,
  resolveConcentrationSaveBonus,
  resolveSaveBonus,
  savingThrowBonus,
  aggregateAbilityScores,
  exhaustionOf,
} from "@/lib/compute";
import type { D20RerollClause } from "@/lib/grants";
import type { CharacterDoc } from "@/types/character";
import type { ReactableRoll, ActionRollEffect } from "@/data/types";
import { STANDARD_DIE_SIDES, type DieSides } from "@/types/dice-formula";
import type {
  D20EnteredModifierRule,
  D20RollMode,
  D20TestRequest,
  D20TestResult,
} from "@/types/d20-test";
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
  /** Face-triggered rerolls the character may take on this test (Halfling Luck). */
  readonly rerolls: readonly D20RerollClause[];
  /** Dice the character may add after the roll (a held Bardic Inspiration die). */
  readonly enteredModifiers: readonly D20EnteredModifierRule[];
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
    scores: aggregateAbilityScores(
      character.character.abilityScores,
      aggregate,
      character.character.abilityScoreOverrides
    ),
  };
}

/** The entered-modifier source of a held Bardic Inspiration die. */
export const BARDIC_INSPIRATION_DIE_SOURCE = "bardic-inspiration-die";

/** A sheet action as the post-roll seam reads it (the resolved action summary). */
export interface PostRollAction {
  readonly id: string;
  readonly summary: { readonly rollEffect?: ActionRollEffect };
}

/** What a character may add to a d20 test it has rolled (2024 D20 Test reactions). */
export interface PostRollSources {
  /** Dice added after the roll, each optional: the held Bardic Inspiration die
   *  («roll the die and add the number rolled to the d20»). */
  readonly enteredModifiers: readonly D20EnteredModifierRule[];
  /** Actions that pay for Advantage on your own save, opted into at the roll
   *  (a Luck Point: «spend 1 Luck Point to give yourself Advantage on the roll»). */
  readonly advantageOptIns: readonly string[];
}

/** A post-roll use the player chose on one entered save. Paying for it (the die,
 *  the Luck Point) stays with the caller, as for every reaction. */
export interface PostRollUse {
  /** The faces rolled for each entered post-roll die, by its source. */
  readonly enteredModifierFaces?: Readonly<Record<string, readonly number[]>>;
  /** A paid Advantage chosen at the roll, and the sheet's actions that allow it. */
  readonly advantage?: {
    readonly sourceId: string;
    readonly actions: ReadonlyArray<PostRollAction>;
  };
}

/** One die of `sides` faces, added: the entered-modifier rule for a held die. */
function oneDieRule(sourceId: string, sides: DieSides): D20EnteredModifierRule {
  return {
    kind: "dice-formula",
    formula: {
      terms: [
        {
          kind: "dice",
          count: { kind: "fixed", value: 1 },
          operation: "add",
          sides,
          termId: sourceId,
        },
      ],
    },
    required: false,
    sourceId,
  };
}

/**
 * The one seam for post-roll sources on the d20 tests the app judges (death and
 * Concentration saves): every request builder reads it, so a new source lands in all
 * of them at once. Outcomes judged at the table (attacks, checks, most saves) take
 * these at the table; the app only pays and logs the use there.
 */
export function postRollSources(
  character: CharacterDoc,
  actions: ReadonlyArray<PostRollAction> = [],
  /** The roll the entry takes (a save the app judges, or the initiative roll). */
  roll: ReactableRoll = "save"
): PostRollSources {
  const held = /^d(\d+)$/.exec(character.session.bardicInspirationDie ?? "");
  const sides = STANDARD_DIE_SIDES.find((s) => s === Number(held?.[1]));
  return {
    enteredModifiers:
      sides === undefined ? [] : [oneDieRule(BARDIC_INSPIRATION_DIE_SOURCE, sides)],
    advantageOptIns: actions.flatMap((action) =>
      action.summary.rollEffect?.kind === "advantage" &&
      action.summary.rollEffect.rolls.includes(roll)
        ? [action.id]
        : []
    ),
  };
}

/** The context with a chosen paid Advantage added; throws when the sheet has no
 *  action that allows it. */
function withPostRollAdvantage<C extends CharacterD20TestContext>(
  character: CharacterDoc,
  context: C,
  use: PostRollUse | undefined
): C {
  if (!use?.advantage) return context;
  const allowed = postRollSources(character, use.advantage.actions).advantageOptIns;
  if (!allowed.includes(use.advantage.sourceId)) {
    throw new TypeError("no action on the sheet allows this Advantage");
  }
  return {
    ...context,
    advantageSourceIds: [...context.advantageSourceIds, use.advantage.sourceId],
  };
}

/**
 * The source that lets an entered d20 face be rerolled, or `null` (Halfling
 * Luck: "When you roll a 1 on the d20 of a D20 Test, you can reroll the die").
 * Any D20 Test entry asks this; the new face then stands.
 */
export function d20RerollFor(
  rerolls: ReadonlyArray<D20RerollClause>,
  face: number
): string | null {
  return rerolls.find((reroll) => reroll.faces.includes(face))?.sourceId ?? null;
}

/**
 * Whether damage to `character` queues a Concentration save on the spell it
 * holds. `false` when nothing is held, or when a source makes that spell's
 * Concentration damage-proof (Relentless Hunter: "Taking damage can't break your
 * Concentration on Hunter's Mark"), or every spell (Boon of the Iron Mind), or a
 * school's (Focused Conjuration). Dropping to 0 HP still ends Concentration;
 * that rule is the damage seam's, not this one's.
 */
export function damageQueuesConcentrationSave(character: CharacterDoc): boolean {
  if (!character.session.concentration) return false;
  return heldConcentrationClauses(character).length === 0;
}

/** The school of the spell held (by its id), for school-scoped bonuses. */
function heldSpellSchool(held: string | null | undefined): string | undefined {
  return held ? getSpellById(held)?.school : undefined;
}

/** The damage-proof clauses that cover the spell `character` holds. */
function heldConcentrationClauses(character: CharacterDoc) {
  const held = character.session.concentration;
  if (!held) return [];
  const aggregate = aggregateCharacterGrants(character.character, character.session);
  const school = getSpellById(held)?.school;
  return aggregate.concentrationDamageProof.filter(
    (clause) =>
      clause.spellId === held ||
      clause.spells === "any" ||
      (typeof clause.spells === "object" && clause.spells.school === school)
  );
}

/**
 * Whether gaining `condition` ends the Concentration `character` holds. The
 * Incapacitated family ends it (SRD 5.2.1); with Boon of the Iron Mind only
 * Petrified and Unconscious still do ("your Concentration ends only if … you have
 * the Petrified or Unconscious condition, or you die").
 */
export function conditionEndsHeldConcentration(
  character: CharacterDoc,
  breaksConcentration: boolean,
  condition: string
): boolean {
  if (!breaksConcentration || !character.session.concentration) return false;
  if (condition === "petrified" || condition === "unconscious") return true;
  return !heldConcentrationClauses(character).some((c) => c.alsoWhileIncapacitated);
}

/** Build a Death Save without smuggling in an ability-scoped CON-save bonus. */
export function deathSaveD20Context(
  character: CharacterDoc
): CharacterDeathSaveD20Context {
  const { aggregate, scores } = effectiveScores(character);
  const allSaveBonus = flatSaveBonus(aggregate, scores);
  const exhaustion = exhaustionPenalty(exhaustionOf(character.session));
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
    rerolls: aggregate.d20Rerolls,
    enteredModifiers: postRollSources(character).enteredModifiers,
  };
}

/** Build the live Constitution save used to maintain one queued Concentration spell. */
/** A failed save taken again (Indomitable, Countercharm): the source that allows it,
 *  the bonus to the new roll (Indomitable: the Fighter level), and whether the new
 *  roll has Advantage. The new roll stands. */
export interface FailedSaveReroll {
  readonly sourceId: string;
  readonly bonus?: number;
  readonly advantage?: true;
}

export function concentrationSaveD20Context(
  character: CharacterDoc,
  pending: PendingConcentrationSave,
  reroll?: FailedSaveReroll
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
    override == null
      ? resolveConcentrationSaveBonus(
          aggregate,
          scores,
          heldSpellSchool(character.session.concentration)
        )
      : 0;
  const exhaustion = exhaustionPenalty(exhaustionOf(character.session));
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
      ...(reroll?.bonus
        ? [{ sourceId: reroll.sourceId, kind: "feature" as const, value: reroll.bonus }]
        : []),
    ],
    advantageSourceIds: [
      ...matchingSourceIds(aggregate.advantages, CONCENTRATION_SAVE_VS, "advantage"),
      ...(reroll?.advantage ? [reroll.sourceId] : []),
      // Extended Spell (2024): Advantage on the saves to keep the spell it extended.
      ...(heldSpellCastWith(
        character.session.logEntries,
        character.session.concentration,
        "extended-spell"
      )
        ? ["extended-spell"]
        : []),
    ],
    disadvantageSourceIds: matchingSourceIds(
      aggregate.disadvantages,
      CONCENTRATION_SAVE_VS,
      "disadvantage"
    ),
    rerolls: aggregate.d20Rerolls,
    enteredModifiers: postRollSources(character).enteredModifiers,
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
    enteredModifiers: [...context.enteredModifiers],
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
      // One reroll per die: the new face must be used ("you must use the new roll").
      replacements: context.rerolls.map((reroll) => ({
        appliesTo: "d20" as const,
        rule: {
          faces: reroll.faces,
          kind: "faces" as const,
          maximumUses: { kind: "fixed" as const, value: enteredD20FaceCount(context) },
          sourceId: reroll.sourceId,
        },
      })),
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

/** Each die's rerolled faces → kernel replacement steps, each naming the rule
 * that allowed it from the face it replaced (none → an unauthorized step). */
function rerollSteps(
  context: CharacterD20TestContext,
  faces: ReadonlyArray<number>,
  rerolled: ReadonlyArray<ReadonlyArray<number>>
) {
  return rerolled.map((chain, index) => {
    let current = faces[index] ?? 0;
    return chain.map((face) => {
      const sourceId = d20RerollFor(context.rerolls, current) ?? "unauthorized-reroll";
      current = face;
      return { face, sourceId };
    });
  });
}

function resolveEnteredFaces(
  context: CharacterD20TestContext,
  faces: ReadonlyArray<number>,
  rerolled: ReadonlyArray<ReadonlyArray<number>> = [],
  use?: PostRollUse
): CharacterEnteredD20Result {
  // A die entered for a source the character doesn't hold is refused, not ignored.
  const held = new Set(context.enteredModifiers.map((rule) => rule.sourceId));
  for (const sourceId of Object.keys(use?.enteredModifierFaces ?? {})) {
    if (!held.has(sourceId)) {
      throw new TypeError(`no post-roll source ${sourceId} on this test`);
    }
  }
  const result = evaluateEnteredCombatD20Test(kernelRequest(context), {
    faces,
    ...(rerolled.length > 0
      ? { replacements: rerollSteps(context, faces, rerolled) }
      : {}),
    ...(use?.enteredModifierFaces
      ? { enteredModifierFaces: use.enteredModifierFaces }
      : {}),
  });
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

/** `rerolled[i]`: the faces die `i` was rerolled to, in order (Halfling Luck). */
export function resolveCharacterDeathSave(
  character: CharacterDoc,
  faces: ReadonlyArray<number>,
  rerolled: ReadonlyArray<ReadonlyArray<number>> = [],
  /** A post-roll use the player chose (a Bardic Inspiration die, a paid Advantage). */
  use?: PostRollUse
): CharacterEnteredD20Result {
  return resolveEnteredFaces(
    withPostRollAdvantage(character, deathSaveD20Context(character), use),
    faces,
    rerolled,
    use
  );
}

export function resolveCharacterConcentrationSave(
  character: CharacterDoc,
  pending: PendingConcentrationSave,
  faces: ReadonlyArray<number>,
  rerolled: ReadonlyArray<ReadonlyArray<number>> = [],
  /** The failed save taken again (Indomitable): its bonus and Advantage. */
  reroll?: FailedSaveReroll,
  /** A post-roll use the player chose (a Bardic Inspiration die, a paid Advantage). */
  use?: PostRollUse
): CharacterEnteredD20Result {
  if (concentrationSaveDc(pending.damage) !== pending.difficultyClass) {
    throw new TypeError("pending Concentration save has a stale damage/DC pair");
  }
  return resolveEnteredFaces(
    withPostRollAdvantage(
      character,
      concentrationSaveD20Context(character, pending, reroll),
      use
    ),
    faces,
    rerolled,
    use
  );
}
