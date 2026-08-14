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
  attackBonus: "spell-attack-bonus",
  castingModifier: "spellcasting-modifier",
  characterLevel: "character-level",
  saveDc: "spell-save-dc",
  targetArmorClass: "target-armor-class",
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

/** The register carrying the chosen cast level into later triggered phases. */
const CAST_LEVEL_REGISTER = "cast-level";

/**
 * Legacy authored effect-programs whose ENTIRE semantics the declarative
 * transcription now reproduces — their `effectProgram` field is dead weight
 * kept only for the not-yet-cut-over legacy executor and is deleted with it.
 */
const SUPERSEDED_LEGACY_PROGRAMS: ReadonlySet<string> = new Set(["eldritch-blast"]);

/**
 * base + perUpcast × max(0, chosen slot level − spell level). The cast phase
 * reads the slot answer directly; a recurring pulse phase reads the cast level
 * recorded into the {@link CAST_LEVEL_REGISTER} at resolution.
 */
function upcastCount(
  base: number,
  perUpcast: number | null,
  spellLevel: number,
  levelBindingId = "input.slot.level"
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
                  { bindingId: levelBindingId, kind: "binding" },
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

/** count × (1 + ⌊(character level + 1) / 6⌋) — the 2024 cantrip progression (5/11/17). */
function cantripScaledCount(count: number): IntegerExpression {
  return {
    factors: [
      fixed(count),
      {
        kind: "add",
        terms: [
          fixed(1),
          {
            dividend: {
              kind: "add",
              terms: [
                { bindingId: TRANSCRIPTION_BINDINGS.characterLevel, kind: "binding" },
                fixed(1),
              ],
            },
            divisor: fixed(6),
            kind: "divide",
            rounding: "floor",
          },
        ],
      },
    ],
    kind: "multiply",
  };
}

function diceInput(
  inputId: string,
  dice: ParsedDice,
  count: Readonly<IntegerExpression>,
  expansion: Readonly<Record<string, unknown>> = { binding: "caster", kind: "single" }
): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [
    {
      count,
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
    expansion,
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

function savingThrowInput(
  ability: AbilityCode,
  when: Readonly<Record<string, unknown>> | null = null,
  inputId = "saves",
  targetsInputId = "targets"
): Record<string, unknown> {
  return {
    expansion: { bind: "actor", inputId: targetsInputId, kind: "entities" },
    inputId,
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
    when,
  };
}

/** True once the resolved attack input landed at least one hit or critical. */
function attackLanded(p: (id: string) => string): Readonly<Record<string, unknown>> {
  return {
    kind: "any",
    predicates: [
      {
        inputId: p("attack"),
        kind: "answer-d20",
        outcomeId: "hit",
        quantifier: "any",
      },
      {
        inputId: p("attack"),
        kind: "answer-d20",
        outcomeId: "critical-hit",
        quantifier: "any",
      },
    ],
  };
}

/**
 * One spell-attack request per answered target slot: the caster rolls, each
 * request adjudicates against the bound target armor class, and the observation
 * keeps the table-override channel for adjudication the world cannot see.
 */
function attackInput(p: (id: string) => string): Record<string, unknown> {
  return {
    expansion: { bind: "target", inputId: p("targets"), kind: "entities" },
    inputId: p("attack"),
    kind: "d20",
    payments: [],
    request: {
      actor: "caster",
      armorClass: {
        bindingId: TRANSCRIPTION_BINDINGS.targetArmorClass,
        kind: "binding",
      },
      automaticCriticalSourceIds: [],
      criticalThreshold: fixed(20),
      enteredModifiers: [],
      kind: "attack",
      modifiers: [
        {
          sourceId: "spell-attack-bonus",
          value: { bindingId: TRANSCRIPTION_BINDINGS.attackBonus, kind: "binding" },
        },
      ],
      resolution: { kind: "rolled" },
      rollRules: CANONICAL_ROLL_RULES,
      target: "target",
      testId: "spell-attack",
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

/** A per-attack-outcome damage roll: input expansion and step target must match. */
function attackOutcomeSelector(
  outcomeIds: readonly string[],
  p: (id: string) => string
): Record<string, unknown> {
  return {
    cardinality: "per-request",
    inputId: p("attack"),
    kind: "d20-outcome",
    outcomeIds,
    quantifier: "any",
  };
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
 * Clause classification DERIVED from a hand-authored program's own inputs and
 * steps — the one honest source when the executable truth is the program
 * itself rather than the declarative fields.
 */
function clausesFromAuthoredProgram(
  program: Readonly<MechanicsProgram>
): TranscriptionClause[] {
  const derived: TranscriptionClause[] = [
    clause("authored-program", "automated", "hand-authored-canonical-format"),
  ];
  for (const phase of program.phases) {
    for (const input of phase.inputs) {
      const id = `${phase.phaseId}-${input.inputId}`;
      if (input.kind === "d20" || input.kind === "dice") {
        derived.push(clause(id, "physical-input"));
      } else if (input.kind === "table") {
        derived.push(clause(id, "table", "table-adjudicated-input"));
      } else {
        derived.push(clause(id, "automated"));
      }
    }
    for (const step of phase.steps) {
      derived.push(clause(`${phase.phaseId}-${step.stepId}`, "automated"));
    }
    if (phase.trigger.kind === "root-pulse") {
      derived.push(
        clause(`${phase.phaseId}-occupancy`, "spatial", "table-signals-pulse")
      );
    }
  }
  return derived;
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
  let pulsePhase: Record<string, unknown> | null = null;
  const unsupported = (clauseId: string, detail: string): void => {
    clauses.push(clause(clauseId, "unsupported", detail));
  };

  if (spell.mechanicsProgram !== undefined) {
    const authored = conformMechanicsProgram(spell.mechanicsProgram);
    if (!authored) {
      return {
        clauses: [clause("authored-program", "unsupported", "program-conformance")],
        entityId: spell.id,
        program: null,
      };
    }
    return {
      clauses: clausesFromAuthoredProgram(authored),
      entityId: spell.id,
      program: authored,
    };
  }
  if (spell.effectProgram && !SUPERSEDED_LEGACY_PROGRAMS.has(spell.id)) {
    clauses.push(
      clause("effect-program", "unsupported", "legacy-authored-program-migration")
    );
    return { clauses, entityId: spell.id, program: null };
  }
  if (spell.effectProgram) {
    clauses.push(clause("effect-program", "automated", "superseded-by-declarative"));
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

  // Resolution gates (read early so targeting can express per-ray slots).
  const hasSave = spell.saveAbility !== undefined;
  const hasAttack = spell.attackType !== undefined;
  // A recurring spell re-runs its whole resolution suite on each table-signaled
  // pulse; a deferred one (`resolveOnCast: false`) resolves ONLY there.
  const pulse = spell.recurrence !== undefined;
  const deferred = spell.resolveOnCast === false;

  // Targeting: the table selects who is inside an area; the engine applies.
  // An instanced attack spell (Scorching Ray) targets one entity SLOT per ray —
  // the same creature may occupy several slots, and each slot is its own attack.
  const maxTargets = spell.targeting?.maxTargets;
  const instances = spell.instances;
  const targetMaximum = typeof maxTargets === "number" ? maxTargets : spell.area ? 20 : 1;
  const dynamicTargets = typeof maxTargets === "string";
  if (dynamicTargets) {
    unsupported("targeting", `dynamic-max-targets:${String(maxTargets)}`);
  } else {
    clauses.push(clause("targeting", "automated"));
    if (instances !== undefined && spell.cantripInstances === true) {
      clauses.push(clause("instances", "automated", "scale-with-character-level"));
    } else if (instances !== undefined && hasAttack) {
      clauses.push(clause("instances", "automated", "one-target-slot-per-ray"));
    } else if (instances !== undefined && !hasSave) {
      clauses.push(clause("instances", "automated", "one-roll-per-instance-slot"));
    } else if (instances !== undefined) {
      unsupported("instances", "per-instance-save-rolls-pending");
    }
    if (spell.area) {
      clauses.push(clause("area-selection", "spatial", "table-selects-occupants"));
    }
  }

  // A combined gate (Ray of Sickness): the attack gates the damage, and only a
  // landed hit forces the saving throw, which gates the condition. One target
  // set only — a second area-saving component (Ice Knife) stays unexpressed.
  const combinedGates = hasAttack && hasSave;
  const comboExpressible =
    combinedGates &&
    spell.damageOnSave === undefined &&
    !spell.secondaryDamage &&
    !spell.area;
  if (combinedGates && !comboExpressible) {
    unsupported(
      "attack-and-save",
      spell.damageOnSave !== undefined
        ? "save-halved-damage-under-attack-gate"
        : "two-target-set-combo-pending"
    );
  } else if (combinedGates) {
    clauses.push(clause("attack-and-save", "automated", "hit-then-save"));
  }
  if (hasAttack) {
    clauses.push(clause("attack-roll", "physical-input"));
    clauses.push(
      clause(
        "attack-adjudication",
        targetMaximum === 1 && instances === undefined ? "automated" : "table",
        targetMaximum === 1 && instances === undefined
          ? "hit-vs-bound-armor-class"
          : "shared-armor-class-binding-per-ray-override"
      )
    );
    clauses.push(clause("attack-range", "spatial", `table-verifies-${spell.attackType}`));
  }
  if (hasSave) {
    clauses.push(
      clause("saving-throw", "physical-input", combinedGates ? "only-on-hit" : null)
    );
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
  // Damage always rides the attack when one exists; a combined save gates only
  // the condition rider, never the damage (Ray of Sickness).
  const gatedByAttack = hasAttack;

  // Classification — once per mechanic, phase-independent. A deferred spell
  // with no pulse never rolls its dice at all (Hex: the die belongs to the
  // standing rider), so its component clauses live with the rider instead.
  for (const component of pulse || !deferred ? components : []) {
    clauses.push(clause(component.inputId, "physical-input"));
    if (spell.level === 0 && spell.cantripInstances !== true) {
      clauses.push(clause(`${component.inputId}-cantrip-scaling`, "automated"));
    }
    if (gatedByAttack) {
      clauses.push(clause(`${component.inputId}-crit-dice`, "automated", "doubled"));
    } else if (hasSave && component.damageOnSave === "half") {
      clauses.push(clause(`${component.inputId}-on-save`, "automated"));
    } else if (hasSave && component.damageOnSave === null) {
      clauses.push(clause(`${component.inputId}-on-save`, "automated", "negates"));
    }
    clauses.push(clause(`${component.inputId}-application`, "automated"));
  }
  if (gatedByAttack && spell.damageOnMiss !== undefined) {
    unsupported("damage-on-miss", "half-on-miss-roll-attribution-pending");
  }

  // Emission — the full targeting/gate/damage suite, once per carrying phase
  // (the cast phase normally; the recurring pulse phase re-runs it verbatim).
  const emitResolutionSuite = (
    into: {
      inputs: Record<string, unknown>[];
      steps: Record<string, unknown>[];
    },
    levelBindingId = "input.slot.level",
    prefix = ""
  ): void => {
    if (dynamicTargets) return;
    const p = (id: string): string => `${prefix}${id}`;
    const slotMaximum: IntegerExpression =
      instances !== undefined
        ? spell.level > 0
          ? upcastCount(
              instances,
              spell.instancesPerUpcast ?? null,
              spell.level,
              levelBindingId
            )
          : spell.cantripInstances === true
            ? cantripScaledCount(instances)
            : fixed(instances)
        : fixed(targetMaximum);
    into.inputs.push({
      eligibility: "creature",
      inputId: p("targets"),
      kind: "entities",
      maximum: slotMaximum,
      minimum: fixed(0),
      multiplicity: "slots",
      when: null,
    });
    if (hasAttack) into.inputs.push(attackInput(p));
    if (spell.saveAbility !== undefined) {
      into.inputs.push(
        savingThrowInput(
          spell.saveAbility,
          combinedGates ? attackLanded(p) : null,
          p("saves"),
          p("targets")
        )
      );
    }
    for (const component of components) {
      // Base + cantrip/upcast scaling on the rolled dice count.
      const scaledCount: IntegerExpression =
        spell.level === 0
          ? spell.cantripInstances === true
            ? fixed(component.dice.count)
            : cantripScaledCount(component.dice.count)
          : upcastCount(
              component.dice.count,
              component.perUpcast?.count ?? null,
              spell.level,
              levelBindingId
            );
      if (gatedByAttack) {
        // One damage roll per landed request; critical hits double the DICE
        // (never the flat bonus), so they ride their own doubled-count input.
        const critCount: IntegerExpression = {
          factors: [fixed(2), scaledCount],
          kind: "multiply",
        };
        const families = [
          { count: scaledCount, inputId: p(component.inputId), outcomeIds: ["hit"] },
          {
            count: critCount,
            inputId: p(`${component.inputId}-crit`),
            outcomeIds: ["critical-hit"],
          },
        ] as const;
        for (const family of families) {
          into.inputs.push(
            diceInput(family.inputId, component.dice, family.count, {
              inputId: p("attack"),
              kind: "d20-outcomes",
              outcomeIds: family.outcomeIds,
            })
          );
          into.steps.push({
            delivery: "attack",
            kind: "damage",
            parts: [
              {
                amount: {
                  cardinality: "per-target-request",
                  inputId: family.inputId,
                  kind: "dice-input",
                  transform: INPUT_TOTAL,
                },
                damageType: component.damageType,
                partId: `${family.inputId}-full`,
              },
            ],
            stepId: `${family.inputId}-apply`,
            target: attackOutcomeSelector(family.outcomeIds, p),
            traits: ["spell"],
            when: null,
          });
        }
        continue;
      }
      if (!hasSave && instances !== undefined) {
        // One automatic-delivery roll per instance slot (Magic Missile darts).
        into.inputs.push(
          diceInput(p(component.inputId), component.dice, scaledCount, {
            inputId: p("targets"),
            kind: "entities",
          })
        );
        into.steps.push({
          delivery: "automatic",
          kind: "damage",
          parts: [
            {
              amount: {
                cardinality: "per-target-request",
                inputId: p(component.inputId),
                kind: "dice-input",
                transform: INPUT_TOTAL,
              },
              damageType: component.damageType,
              partId: p(`${component.inputId}-full`),
            },
          ],
          stepId: p(`${component.inputId}-apply`),
          target: { inputId: p("targets"), kind: "input" },
          traits: ["spell"],
          when: null,
        });
        continue;
      }
      into.inputs.push(diceInput(p(component.inputId), component.dice, scaledCount));
      const delivery = hasSave ? "saving-throw" : "automatic";
      const failedTarget = hasSave
        ? {
            cardinality: "per-request",
            inputId: p("saves"),
            kind: "d20-outcome",
            outcomeIds: ["failure"],
            quantifier: "any",
          }
        : { inputId: p("targets"), kind: "input" };
      into.steps.push({
        delivery,
        kind: "damage",
        parts: [
          {
            amount: sharedDiceAmount(p(component.inputId), INPUT_TOTAL),
            damageType: component.damageType,
            partId: p(`${component.inputId}-full`),
          },
        ],
        stepId: p(`${component.inputId}-apply`),
        target: failedTarget,
        traits: ["spell"],
        when: null,
      });
      if (hasSave && component.damageOnSave === "half") {
        into.steps.push({
          delivery,
          kind: "damage",
          parts: [
            {
              amount: sharedDiceAmount(p(component.inputId), HALF_INPUT_TOTAL),
              damageType: component.damageType,
              partId: p(`${component.inputId}-half`),
            },
          ],
          stepId: p(`${component.inputId}-apply-half`),
          target: {
            cardinality: "per-request",
            inputId: p("saves"),
            kind: "d20-outcome",
            outcomeIds: ["success"],
            quantifier: "any",
          },
          traits: ["spell"],
          when: null,
        });
      }
    }
  };
  if (!deferred) emitResolutionSuite({ inputs, steps });
  if (spell.bonusDamageAgainst) {
    unsupported("bonus-damage-against", "creature-type-gated-damage");
  }
  if (spell.damageAddsCastMod === true) {
    clauses.push(clause("damage-cast-modifier", "unsupported", "per-part-attribution"));
  }

  // Healing. A flat formula ("70", "1") needs no roll — the amount is exact,
  // upcast by the flat per-level increment when one is declared.
  const flatHeal = /^\d+$/.test(spell.healDice?.trim() ?? "")
    ? Number(spell.healDice)
    : null;
  const flatHealPerUpcast = /^\d+$/.test(spell.healDicePerUpcast?.trim() ?? "")
    ? Number(spell.healDicePerUpcast)
    : null;
  if (
    spell.healDice !== undefined &&
    flatHeal !== null &&
    spell.healDicePerUpcast !== undefined &&
    flatHealPerUpcast === null
  ) {
    unsupported("healing", `mixed-flat-and-dice-upcast:${spell.healDicePerUpcast}`);
  } else if (spell.healDice !== undefined && flatHeal !== null) {
    steps.push({
      amount: {
        expression:
          spell.level > 0
            ? upcastCount(flatHeal, flatHealPerUpcast, spell.level)
            : fixed(flatHeal),
        kind: "integer",
      },
      kind: "heal",
      stepId: "heal-apply",
      target: { inputId: "targets", kind: "input" },
      when: null,
    });
    clauses.push(clause("healing-application", "automated", "flat-amount"));
    if (flatHealPerUpcast !== null) clauses.push(clause("healing-upcast", "automated"));
  } else if (spell.healDice !== undefined) {
    const dice = parseDice(spell.healDice);
    const perUpcast =
      spell.healDicePerUpcast === undefined ? null : parseDice(spell.healDicePerUpcast);
    if (!dice || (spell.healDicePerUpcast !== undefined && !perUpcast)) {
      unsupported("healing", `dice:${spell.healDice}`);
    } else {
      inputs.push(
        diceInput(
          "heal-roll",
          dice,
          spell.level > 0
            ? upcastCount(dice.count, perUpcast?.count ?? null, spell.level)
            : fixed(dice.count)
        )
      );
      steps.push({
        amount: sharedDiceAmount(
          "heal-roll",
          spell.healAddsCastMod === true
            ? {
                kind: "add",
                terms: [
                  INPUT_TOTAL,
                  {
                    bindingId: TRANSCRIPTION_BINDINGS.castingModifier,
                    kind: "binding",
                  },
                ],
              }
            : INPUT_TOTAL
        ),
        kind: "heal",
        stepId: "heal-apply",
        target: { inputId: "targets", kind: "input" },
        when: null,
      });
      clauses.push(clause("healing-roll", "physical-input"));
      if (spell.healAddsCastMod === true) {
        clauses.push(clause("healing-cast-modifier", "automated"));
      }
      if (perUpcast !== null) clauses.push(clause("healing-upcast", "automated"));
      clauses.push(clause("healing-application", "automated"));
    }
  }
  if (spell.healingMode === "full") {
    // "Regains all its hit points": the kernel clamps healing at the target's
    // maximum, and 1000 exceeds every legal 2024 hit-point maximum, so the
    // clamp makes the domain bound exact — no sentinel semantics.
    steps.push({
      amount: { expression: fixed(1000), kind: "integer" },
      kind: "heal",
      stepId: "heal-full",
      target: { inputId: "targets", kind: "input" },
      when: null,
    });
    clauses.push(clause("healing-full-restore", "automated", "clamped-domain-bound"));
  } else if (spell.healingMode !== undefined) {
    unsupported("healing-consumable", "consumable-item-creation-pending");
  }
  if (spell.healingPool !== undefined) {
    unsupported("healing-pool", "per-target-pool-split-pending");
  }

  // Temporary hit points.
  if (spell.tempHpRoll) {
    const dice =
      spell.tempHpRoll.dice === undefined ? null : parseDice(spell.tempHpRoll.dice);
    if (spell.tempHpRoll.dice !== undefined && !dice) {
      unsupported("temporary-hit-points", `dice:${spell.tempHpRoll.dice}`);
    } else {
      if (dice) {
        inputs.push(diceInput("temp-hp-roll", dice, fixed(dice.count)));
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

  // Conditions — classified once; emitted into every phase that carries the
  // resolution suite (the cast normally; the pulse for recurring zones, where
  // each table-signaled event re-applies to that event's failed saves).
  const conditionEntries: {
    readonly conditionId: string;
    readonly lifetime: Readonly<Record<string, unknown>>;
  }[] = [];
  if (spell.conditionApplication) {
    const application = spell.conditionApplication;
    if (application.max !== undefined && application.max < application.options.length) {
      clauses.push(clause("condition-choice", "table", "table-picks-subset"));
    }
    if (application.on === "hit" && !gatedByAttack) {
      unsupported("condition-gate", "on-hit-without-attack-gate");
    } else if (application.on === "hit") {
      clauses.push(clause("condition-gate", "automated", "on-landed-attack"));
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
      conditionEntries.push({ conditionId, lifetime: conditionLifetime });
      clauses.push(clause(`condition-${conditionId}`, "automated"));
    }
  }
  const emitConditionSuite = (
    into: { steps: Record<string, unknown>[] },
    prefix = ""
  ): void => {
    const application = spell.conditionApplication;
    if (!application) return;
    const p = (id: string): string => `${prefix}${id}`;
    for (const entry of conditionEntries) {
      into.steps.push({
        conditionId: entry.conditionId,
        kind: "condition",
        lifetime: entry.lifetime,
        operation: "apply",
        stepId: p(`condition-${entry.conditionId}`),
        target:
          hasSave && application.on !== "automatic"
            ? {
                cardinality: "per-request",
                inputId: p("saves"),
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              }
            : gatedByAttack && application.on === "hit"
              ? attackOutcomeSelector(["hit", "critical-hit"], p)
              : { inputId: p("targets"), kind: "input" },
        when: null,
      });
    }
  };
  if (!deferred) emitConditionSuite({ steps });
  if (spell.conditionRemoval) {
    for (const conditionId of spell.conditionRemoval.options) {
      if (conditionId === "exhaustion") {
        unsupported("cure-exhaustion", "exhaustion-step-authoring-pending");
        continue;
      }
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

  // Standing buffs (`while-active` grants): the cast lights the buff's active
  // key on the caster — and marks the chosen creature when the buff is
  // target-scoped (Hex). The rider the buff carries stays with the DERIVED
  // grant layer: by product design the app models no enemy in solo play, so
  // the extra die is player-applied on a hit, never auto-summed.
  const whileActiveGrants = (spell.grants ?? []).flatMap((grant) =>
    grant.type === "while-active" ? [grant] : []
  );
  let standingNeedsTargets = false;
  for (const grant of whileActiveGrants) {
    const timed =
      grant.duration !== undefined && grant.duration.kind === "timed"
        ? grant.duration
        : null;
    const turnBounded =
      grant.duration !== undefined && grant.duration.kind === "turn-boundary"
        ? grant.duration
        : null;
    const standingLifetime: Record<string, unknown> =
      spell.concentration || grant.duration === undefined
        ? { kind: "source-end" }
        : timed !== null
          ? { kind: "duration", seconds: fixed(timed.minutes * 60) }
          : turnBounded !== null
            ? {
                combatant: "caster",
                kind: "turn-boundary",
                offsetTurns: fixed(turnBounded.turns),
                phase: turnBounded.phase === "turn-start" ? "start" : "end",
              }
            : { kind: "source-end" };
    if (grant.duration?.kind === "maintained") {
      clauses.push(
        clause(`standing-${grant.activeKey}-duration`, "table", "maintained-by-table")
      );
    } else if (timed?.byCastLevel !== undefined) {
      clauses.push(
        clause(
          `standing-${grant.activeKey}-upcast-duration`,
          "table",
          "cast-level-duration-tiers"
        )
      );
    } else if (!spell.concentration && grant.duration !== undefined) {
      clauses.push(clause(`standing-${grant.activeKey}-duration`, "automated"));
    }
    steps.push({
      fact: { key: grant.activeKey, kind: "active-key" },
      kind: "standing",
      lifetime: standingLifetime,
      operation: "start",
      stepId: `standing-${grant.activeKey}`,
      target: { kind: "role", role: "caster" },
      when: null,
    });
    clauses.push(clause(`standing-${grant.activeKey}`, "automated"));
    if (grant.targetScope !== undefined) {
      standingNeedsTargets = true;
      steps.push({
        fact: {
          kind: "target-mark",
          markId: grant.targetScope,
          marked: { inputId: "targets", kind: "input" },
        },
        kind: "standing",
        lifetime: standingLifetime,
        operation: "start",
        stepId: `mark-${grant.targetScope}`,
        target: { kind: "role", role: "caster" },
        when: null,
      });
      clauses.push(clause(`mark-${grant.targetScope}`, "automated"));
    }
    for (const inner of grant.grants) {
      clauses.push(
        inner.type === "damage-rider"
          ? clause(
              `rider-${grant.activeKey}`,
              "table",
              "player-applies-die-on-hit-by-design"
            )
          : clause(`standing-grant-${inner.type}`, "automated", "derived-grant-layer")
      );
    }
  }
  if (standingNeedsTargets && deferred && !pulse && !dynamicTargets) {
    // A deferred standing cast still chooses whom to mark.
    inputs.push({
      eligibility: "creature",
      inputId: "targets",
      kind: "entities",
      maximum: fixed(targetMaximum),
      minimum: fixed(1),
      multiplicity: "slots",
      when: null,
    });
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

  // The recurring pulse phase: the table signals each recurrence event (who is
  // in the area when — spatial truth); the engine re-runs the full resolution
  // suite. A deferred spell carries its suite ONLY here (Moonbeam); a repeating
  // one re-rolls the same suite it resolved at cast (Sunbeam). A successful
  // repeat save can end the whole program (Searing Smite).
  if (
    deferred &&
    (spell.healDice !== undefined ||
      spell.tempHpRoll !== undefined ||
      spell.conditionRemoval !== undefined)
  ) {
    unsupported("deferred-resolution", "deferred-non-damage-suite-pending");
  } else if (pulse) {
    const pulseInputs: Record<string, unknown>[] = [];
    const pulseSteps: Record<string, unknown>[] = [];
    if (spell.level > 0) {
      // The pulse re-reads the cast level recorded when the slot was paid.
      steps.splice(0, 0, {
        kind: "register",
        operation: {
          kind: "set-integer",
          value: { bindingId: "input.slot.level", kind: "binding" },
        },
        registerId: CAST_LEVEL_REGISTER,
        stepId: "record-cast-level",
        when: null,
      });
    }
    emitResolutionSuite(
      { inputs: pulseInputs, steps: pulseSteps },
      `register.${CAST_LEVEL_REGISTER}`,
      "pulse-"
    );
    emitConditionSuite({ steps: pulseSteps }, "pulse-");
    if (spell.endsOnSuccessfulSave === true && hasSave) {
      pulseSteps.push({
        kind: "end-program",
        stepId: "pulse-ends-on-save",
        when: {
          inputId: "pulse-saves",
          kind: "answer-d20",
          outcomeId: "success",
          quantifier: "any",
        },
      });
      clauses.push(clause("ends-on-save", "automated", "repeat-save-ends-program"));
    } else if (spell.endsOnSuccessfulSave === true) {
      unsupported("ends-on-save", "no-saving-throw-to-repeat");
    }
    if (pulseSteps.length === 0) {
      unsupported("recurrence", "empty-pulse-suite");
    } else {
      clauses.push(
        clause("recurrence", "automated", `pulse-on-${spell.recurrence ?? "event"}`)
      );
      clauses.push(clause("pulse-occupancy", "spatial", "table-signals-pulse"));
      if (deferred) {
        clauses.push(clause("deferred-resolution", "automated", "suite-lives-in-pulse"));
      }
      pulsePhase = {
        inputs: pulseInputs,
        phaseId: "pulse",
        steps: pulseSteps,
        trigger: { eventId: "pulse", kind: "root-pulse" },
      };
    }
  } else if (deferred && whileActiveGrants.length > 0) {
    clauses.push(
      clause("deferred-resolution", "automated", "suite-lives-in-standing-rider")
    );
  } else if (deferred) {
    unsupported("deferred-resolution", "resolve-later-without-recurrence");
  }
  if (spell.followUp) unsupported("follow-up", "follow-up-action-pending");
  if (spell.endsOnSuccessfulSave === true && !pulse) {
    unsupported("ends-on-save", "repeat-save-without-recurrence");
  }
  if (spell.selfHealingFromDamage) {
    unsupported("self-healing-from-damage", "landed-damage-feedback-pending");
  }

  const phases: Record<string, unknown>[] = [
    { inputs, phaseId: "resolve", steps, trigger: { kind: "invocation" } },
    ...(pulsePhase ? [pulsePhase] : []),
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
  const stepless = steps.length === 0 && pulsePhase === null;
  if (blocked || stepless) {
    return {
      clauses:
        stepless && !blocked
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
    registers:
      pulsePhase !== null && spell.level > 0
        ? [{ initial: spell.level, registerId: CAST_LEVEL_REGISTER }]
        : [],
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
