/**
 * The corpus transcriber: declarative catalogue facts → one authored
 * MechanicsProgram plus an honest clause-level classification.
 *
 * Every rule-bearing field an entity declares becomes a clause. A clause is
 * `automated` only when this transcriber emitted executable program structure
 * for it and the whole program conforms; irreducible physical rolls are
 * `physical-input`; table/spatial adjudication is `table`/`spatial`;
 * flavor-only facts are `narrative`; anything declared but not yet expressible
 * is `unsupported` — never silently green. The classification is DERIVED from
 * the fields present on the entity, never from a hand-kept list.
 */

import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import type { SrdSpellData } from "@/data/types";
import type { AbilityCode } from "@/types/ability";
import type { IntegerExpression } from "@/types/integer-expression";
import type { MechanicsProgram } from "@/types/mechanics-program-authoring";

export type TranscriptionClauseStatus =
  | "automated"
  | "physical-input"
  | "table"
  | "spatial"
  | "narrative"
  | "unsupported";

export interface TranscriptionClause {
  readonly clauseId: string;
  readonly detail: string | null;
  readonly status: TranscriptionClauseStatus;
}

export interface SpellTranscription {
  readonly clauses: readonly TranscriptionClause[];
  readonly entityId: string;
  readonly program: Readonly<MechanicsProgram> | null;
}

/** Static bindings the runtime authority must supply for transcribed programs. */
export const TRANSCRIPTION_BINDINGS = {
  castingModifier: "spellcasting-modifier",
  saveDc: "spell-save-dc",
} as const;

const DICE_PATTERN = /^(\d+)d(\d+)(?:\s*\+\s*(\d+))?$/;

interface ParsedDice {
  readonly bonus: number;
  readonly count: number;
  readonly sides: number;
}

function parseDice(value: string): ParsedDice | null {
  const match = DICE_PATTERN.exec(value.trim());
  if (!match) return null;
  const count = Number(match[1]);
  const sides = Number(match[2]);
  const bonus = match[3] === undefined ? 0 : Number(match[3]);
  return Number.isSafeInteger(count) &&
    count >= 1 &&
    Number.isSafeInteger(sides) &&
    sides >= 2 &&
    Number.isSafeInteger(bonus)
    ? { bonus, count, sides }
    : null;
}

function fixed(value: number): IntegerExpression {
  return { kind: "fixed", value };
}

/** base + perUpcast × max(0, chosen slot level − spell level). */
function upcastCount(
  base: number,
  perUpcast: number | null,
  spellLevel: number
): IntegerExpression {
  if (perUpcast === null || perUpcast === 0) return fixed(base);
  return {
    kind: "add",
    terms: [
      fixed(base),
      {
        factors: [
          fixed(perUpcast),
          {
            kind: "max",
            values: [
              fixed(0),
              {
                kind: "add",
                terms: [
                  { bindingId: "input.slot.level", kind: "binding" },
                  fixed(-spellLevel),
                ],
              },
            ],
          },
        ],
        kind: "multiply",
      },
    ],
  };
}

function diceInput(
  inputId: string,
  dice: ParsedDice,
  perUpcastDice: ParsedDice | null,
  spellLevel: number,
  upcastScales: boolean
): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [
    {
      count: upcastScales
        ? upcastCount(dice.count, perUpcastDice?.count ?? null, spellLevel)
        : fixed(dice.count),
      kind: "dice",
      operation: "add",
      sides: dice.sides,
      termId: `${inputId}-die`,
    },
  ];
  if (dice.bonus !== 0) {
    terms.push({
      kind: "integer",
      operation: "add",
      termId: `${inputId}-bonus`,
      value: fixed(dice.bonus),
    });
  }
  return {
    acceptancePolicy: [],
    expansion: { binding: "caster", kind: "single" },
    formula: { terms },
    inputId,
    kind: "dice",
    payments: [],
    replacementPolicy: [],
    when: null,
  };
}

const CANONICAL_ROLL_RULES = {
  advantageSourceIds: [],
  disadvantageSourceIds: [],
  extraD20SourceIds: [],
  faceFloors: [],
  replacements: [],
  substitutions: [],
  totalFloors: [],
} as const;

function savingThrowInput(ability: AbilityCode): Record<string, unknown> {
  return {
    expansion: { bind: "actor", inputId: "targets", kind: "entities" },
    inputId: "saves",
    kind: "d20",
    payments: [],
    request: {
      ability,
      actor: "target",
      difficultyClass: {
        bindingId: TRANSCRIPTION_BINDINGS.saveDc,
        kind: "binding",
      },
      enteredModifiers: [],
      kind: "saving-throw",
      modifiers: [],
      resolution: { kind: "rolled" },
      rollRules: CANONICAL_ROLL_RULES,
      target: "caster",
      testId: "spell-save",
    },
    when: null,
  };
}

function sharedDiceAmount(
  inputId: string,
  transform: Readonly<IntegerExpression>
): Record<string, unknown> {
  return { cardinality: "shared", inputId, kind: "dice-input", transform };
}

const INPUT_TOTAL: IntegerExpression = { bindingId: "input-total", kind: "binding" };
const HALF_INPUT_TOTAL: IntegerExpression = {
  dividend: INPUT_TOTAL,
  divisor: fixed(2),
  kind: "divide",
  rounding: "floor",
};

function clause(
  clauseId: string,
  status: TranscriptionClauseStatus,
  detail: string | null = null
): TranscriptionClause {
  return { clauseId, detail, status };
}

interface SpellDamageComponent {
  readonly damageOnSave: "half" | null;
  readonly damageType: string;
  readonly dice: ParsedDice;
  readonly inputId: string;
  readonly perUpcast: ParsedDice | null;
}

/**
 * Transcribe one spell's declarative facts. The result's program is null when
 * any emitted structure failed program conformance — in that case every clause
 * that would have been automated reports `unsupported` with the failure.
 */
export function transcribeSpell(spell: Readonly<SrdSpellData>): SpellTranscription {
  const clauses: TranscriptionClause[] = [];
  const inputs: Record<string, unknown>[] = [];
  const steps: Record<string, unknown>[] = [];
  const lifetime: Record<string, unknown>[] = [];
  const unsupported = (clauseId: string, detail: string): void => {
    clauses.push(clause(clauseId, "unsupported", detail));
  };

  if (spell.effectProgram) {
    clauses.push(
      clause("effect-program", "unsupported", "legacy-authored-program-migration")
    );
    return { clauses, entityId: spell.id, program: null };
  }

  // Slot payment.
  if (spell.level > 0) {
    inputs.push({
      inputId: "slot",
      kind: "resource",
      term: {
        amount: fixed(1),
        selector: {
          kind: "spell-slot",
          level: { kind: "minimum", value: spell.level },
          owner: "caster",
          pool: "either",
        },
      },
      when: null,
    });
    clauses.push(clause("slot-payment", "automated"));
  }

  // Targeting: the table selects who is inside an area; the engine applies.
  const maxTargets = spell.targeting?.maxTargets;
  const targetMaximum = typeof maxTargets === "number" ? maxTargets : spell.area ? 20 : 1;
  if (typeof maxTargets === "string") {
    unsupported("targeting", `dynamic-max-targets:${maxTargets}`);
  } else {
    inputs.push({
      eligibility: "creature",
      inputId: "targets",
      kind: "entities",
      maximum: fixed(targetMaximum),
      minimum: fixed(0),
      multiplicity: "slots",
      when: null,
    });
    clauses.push(clause("targeting", "automated"));
    if (spell.area) {
      clauses.push(clause("area-selection", "spatial", "table-selects-occupants"));
    }
  }

  // Resolution gate.
  const hasSave = spell.saveAbility !== undefined;
  const hasAttack = spell.attackType !== undefined;
  if (spell.saveAbility !== undefined) {
    inputs.push(savingThrowInput(spell.saveAbility));
    clauses.push(clause("saving-throw", "physical-input"));
  }
  if (hasAttack) {
    unsupported("attack-roll", "spell-attack-gate-pending-attack-request-context");
  }

  // Damage components.
  const components: SpellDamageComponent[] = [];
  if (spell.damageDice !== undefined && spell.damageType !== undefined) {
    const dice = parseDice(spell.damageDice);
    const perUpcast =
      spell.damageDicePerUpcast === undefined
        ? null
        : parseDice(spell.damageDicePerUpcast);
    if (!dice || (spell.damageDicePerUpcast !== undefined && !perUpcast)) {
      unsupported("damage", `dice:${spell.damageDice}`);
    } else {
      components.push({
        damageOnSave: spell.damageOnSave ?? null,
        damageType: spell.damageType,
        dice,
        inputId: "damage-roll",
        perUpcast,
      });
    }
  }
  if (spell.secondaryDamage) {
    const dice = parseDice(spell.secondaryDamage.dice);
    const perUpcast =
      spell.secondaryDamage.dicePerUpcast === undefined
        ? null
        : parseDice(spell.secondaryDamage.dicePerUpcast);
    if (!dice || (spell.secondaryDamage.dicePerUpcast !== undefined && !perUpcast)) {
      unsupported("secondary-damage", `dice:${spell.secondaryDamage.dice}`);
    } else {
      components.push({
        damageOnSave: spell.secondaryDamage.damageOnSave ?? null,
        damageType: spell.secondaryDamage.damageType,
        dice,
        inputId: "secondary-damage-roll",
        perUpcast,
      });
    }
  }
  for (const component of components) {
    inputs.push(
      diceInput(
        component.inputId,
        component.dice,
        component.perUpcast,
        spell.level,
        spell.level > 0 && component.perUpcast !== null
      )
    );
    clauses.push(clause(component.inputId, "physical-input"));
    const delivery = hasSave ? "saving-throw" : "automatic";
    const failedTarget = hasSave
      ? {
          cardinality: "per-request",
          inputId: "saves",
          kind: "d20-outcome",
          outcomeIds: ["failure"],
          quantifier: "any",
        }
      : { inputId: "targets", kind: "input" };
    steps.push({
      delivery,
      kind: "damage",
      parts: [
        {
          amount: sharedDiceAmount(component.inputId, INPUT_TOTAL),
          damageType: component.damageType,
          partId: `${component.inputId}-full`,
        },
      ],
      stepId: `${component.inputId}-apply`,
      target: failedTarget,
      traits: ["spell"],
      when: null,
    });
    if (hasSave && component.damageOnSave === "half") {
      steps.push({
        delivery,
        kind: "damage",
        parts: [
          {
            amount: sharedDiceAmount(component.inputId, HALF_INPUT_TOTAL),
            damageType: component.damageType,
            partId: `${component.inputId}-half`,
          },
        ],
        stepId: `${component.inputId}-apply-half`,
        target: {
          cardinality: "per-request",
          inputId: "saves",
          kind: "d20-outcome",
          outcomeIds: ["success"],
          quantifier: "any",
        },
        traits: ["spell"],
        when: null,
      });
      clauses.push(clause(`${component.inputId}-on-save`, "automated"));
    } else if (hasSave && component.damageOnSave === null) {
      clauses.push(clause(`${component.inputId}-on-save`, "automated", "negates"));
    }
    clauses.push(clause(`${component.inputId}-application`, "automated"));
  }
  if (spell.bonusDamageAgainst) {
    unsupported("bonus-damage-against", "creature-type-gated-damage");
  }
  if (spell.damageAddsCastMod === true) {
    unsupported("damage-adds-cast-mod", "modifier-term-pending");
  }

  // Healing.
  if (spell.healDice !== undefined) {
    const dice = parseDice(spell.healDice);
    if (!dice) {
      unsupported("healing", `dice:${spell.healDice}`);
    } else {
      inputs.push(diceInput("heal-roll", dice, null, spell.level, false));
      steps.push({
        amount: sharedDiceAmount("heal-roll", INPUT_TOTAL),
        kind: "heal",
        stepId: "heal-apply",
        target: { inputId: "targets", kind: "input" },
        when: null,
      });
      clauses.push(clause("healing-roll", "physical-input"));
      clauses.push(clause("healing-application", "automated"));
    }
  }
  if (spell.healingMode !== undefined || spell.healingPool !== undefined) {
    unsupported("healing-pool", "pooled-healing-pending");
  }

  // Temporary hit points.
  if (spell.tempHpRoll) {
    const dice =
      spell.tempHpRoll.dice === undefined ? null : parseDice(spell.tempHpRoll.dice);
    if (spell.tempHpRoll.dice !== undefined && !dice) {
      unsupported("temporary-hit-points", `dice:${spell.tempHpRoll.dice}`);
    } else {
      if (dice) {
        inputs.push(diceInput("temp-hp-roll", dice, null, spell.level, false));
        clauses.push(clause("temporary-hit-points-roll", "physical-input"));
      }
      const bonus = upcastCount(
        spell.tempHpRoll.bonus,
        spell.tempHpRoll.bonusPerUpcast ?? null,
        spell.level
      );
      steps.push({
        amount: dice
          ? sharedDiceAmount("temp-hp-roll", {
              kind: "add",
              terms: [INPUT_TOTAL, bonus],
            })
          : { expression: bonus, kind: "integer" },
        decision: "replace",
        kind: "temporary-hit-points",
        lifetime: { kind: "manual" },
        stepId: "temp-hp-apply",
        target: { inputId: "targets", kind: "input" },
        when: null,
      });
      clauses.push(clause("temporary-hit-points", "automated"));
    }
  }
  if (spell.tempHpPool !== undefined) {
    unsupported("temporary-hit-points-pool", "pooled-temp-hp-pending");
  }

  // Conditions.
  if (spell.conditionApplication) {
    const application = spell.conditionApplication;
    if (application.max !== undefined && application.max < application.options.length) {
      clauses.push(clause("condition-choice", "table", "table-picks-subset"));
    }
    if (application.on === "hit" && !hasSave) {
      unsupported("condition-gate", "on-hit-conditions-pending-attack-gate");
    }
    for (const conditionId of application.options) {
      if (conditionId === "exhaustion") {
        unsupported("condition-exhaustion", "exhaustion-uses-exhaustion-change");
        continue;
      }
      const authored =
        application.lifetimes?.[conditionId] ?? application.lifetime ?? null;
      let conditionLifetime: Record<string, unknown>;
      if (authored === null || authored.kind === "manual") {
        conditionLifetime = { kind: "manual" };
        clauses.push(
          clause(`condition-${conditionId}-lifetime`, "table", "table-owned-end")
        );
      } else if (authored.kind === "source") {
        conditionLifetime = { kind: "source-end" };
        clauses.push(clause(`condition-${conditionId}-lifetime`, "automated"));
      } else if (authored.kind === "timed") {
        if (authored.byCastLevel) {
          unsupported(
            `condition-${conditionId}-lifetime`,
            "cast-level-scaled-lifetime-pending"
          );
          continue;
        }
        conditionLifetime = {
          kind: "duration",
          seconds: fixed(authored.minutes * 60),
        };
        clauses.push(clause(`condition-${conditionId}-lifetime`, "automated"));
      } else {
        conditionLifetime = {
          combatant: authored.anchor === "target" ? "target" : "caster",
          kind: "turn-boundary",
          offsetTurns: fixed(authored.turns),
          phase: authored.phase === "turn-start" ? "start" : "end",
        };
        clauses.push(clause(`condition-${conditionId}-lifetime`, "automated"));
      }
      steps.push({
        conditionId,
        kind: "condition",
        lifetime: conditionLifetime,
        operation: "apply",
        stepId: `condition-${conditionId}`,
        target:
          hasSave && application.on !== "automatic"
            ? {
                cardinality: "per-request",
                inputId: "saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              }
            : { inputId: "targets", kind: "input" },
        when: null,
      });
      clauses.push(clause(`condition-${conditionId}`, "automated"));
    }
  }
  if (spell.conditionRemoval) {
    for (const conditionId of spell.conditionRemoval.options) {
      steps.push({
        conditionId,
        kind: "condition",
        lifetime: null,
        operation: "remove",
        stepId: `cure-${conditionId}`,
        target: { inputId: "targets", kind: "input" },
        when: null,
      });
      clauses.push(clause(`cure-${conditionId}`, "automated"));
    }
    if (spell.conditionRemoval.max !== undefined) {
      clauses.push(clause("cure-choice", "table", "table-picks-subset"));
    }
  }

  // Concentration and duration.
  if (spell.concentration) {
    steps.push({
      kind: "concentration",
      lifetime: { kind: "manual" },
      operation: "start",
      stepId: "hold-concentration",
      when: null,
    });
    clauses.push(clause("concentration", "automated"));
  }
  const persistent =
    spell.concentration ||
    spell.conditionApplication !== undefined ||
    spell.tempHpRoll !== undefined;
  if (spell.instantaneous !== true && persistent) {
    clauses.push(clause("duration", "table", "no-structured-spell-duration-fact"));
    lifetime.push({ kind: "manual" });
  }

  // Boundary facts that stay with the table by design.
  if (spell.recurrence) unsupported("recurrence", "recurrent-cadence-pending");
  if (spell.followUp) unsupported("follow-up", "follow-up-action-pending");
  if (spell.resolveOnCast === false) {
    unsupported("deferred-resolution", "resolve-later-pending");
  }
  if (spell.endsOnSuccessfulSave === true) {
    unsupported("ends-on-save", "repeat-save-pending");
  }
  if (spell.selfHealingFromDamage) {
    unsupported("self-healing-from-damage", "landed-damage-feedback-pending");
  }

  const phases: Record<string, unknown>[] = [
    { inputs, phaseId: "resolve", steps, trigger: { kind: "invocation" } },
  ];
  if (spell.concentration) {
    phases.push({
      inputs: [],
      phaseId: "release",
      steps: [{ kind: "end-program", stepId: "release-spell", when: null }],
      trigger: { kind: "source-end" },
    });
  }

  const blocked = clauses.some((entry) => entry.status === "unsupported");
  if (blocked || steps.length === 0) {
    return {
      clauses:
        steps.length === 0 && !blocked
          ? [...clauses, clause("resolution", "narrative", "no-mechanical-steps")]
          : clauses,
      entityId: spell.id,
      program: null,
    };
  }

  const program = conformMechanicsProgram({
    id: `spell:${spell.id}`,
    ...(lifetime.length > 0 ? { lifetime } : {}),
    phases,
    registers: [],
    version: 1,
  });
  if (!program) {
    return {
      clauses: [
        ...clauses.map((entry) =>
          entry.status === "automated"
            ? clause(entry.clauseId, "unsupported", "program-conformance")
            : entry
        ),
      ],
      entityId: spell.id,
      program: null,
    };
  }
  return { clauses, entityId: spell.id, program };
}
