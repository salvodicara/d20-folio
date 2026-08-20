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
import { ALL_SKILLS } from "@/lib/skills";
import type { SrdActionDef, SrdSpellData } from "@/data/types";
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
  /** The resolved die COUNT of a feature action's level/ability-scaled attack
   *  dice (Breath Weapon's 2 at character level 5, Sear Undead's WIS-mod many —
   *  the same `pickByLevel`/`resolveDiceCount` numbers the action card shows). */
  attackDiceCount: "feature-attack-dice-count",
  attackBonus: "spell-attack-bonus",
  castingModifier: "spellcasting-modifier",
  characterLevel: "character-level",
  /** The resolved flat bonus of a feature action's heal/THP/attack term (a
   *  class-level or ability-modifier additive — Second Wind's Fighter level,
   *  Divine Spark's +WIS, Radiance of the Dawn's +Cleric level). */
  featureBonus: "feature-bonus",
  saveDc: "spell-save-dc",
  targetArmorClass: "target-armor-class",
} as const;

/** Skill id → governing ability, from the single `ALL_SKILLS` source. */
const SKILL_ABILITY = new Map<string, AbilityCode>(
  ALL_SKILLS.map((skill) => [skill.id, skill.ability])
);

/** The catalogue's `byLevel` tier rule: the highest threshold at or below the
 *  scaling level wins (the same `pickByLevel` semantics the action card uses). */
function pickLevelTier<Value>(
  byLevel: Readonly<Record<number, Value>>,
  level: number
): Value | null {
  let best: { readonly threshold: number; readonly value: Value } | null = null;
  for (const [key, value] of Object.entries(byLevel)) {
    const threshold = Number(key);
    if (
      Number.isSafeInteger(threshold) &&
      threshold <= level &&
      (best === null || threshold > best.threshold)
    ) {
      best = { threshold, value };
    }
  }
  return best === null ? null : best.value;
}

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
  expansion: Readonly<Record<string, unknown>> = { binding: "caster", kind: "single" },
  when: Readonly<Record<string, unknown>> | null = null
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
    when,
  };
}

/** Conjoin optional gates: none ⇒ ungated, one ⇒ itself, several ⇒ `all`. */
function allOf(
  ...gates: readonly (Readonly<Record<string, unknown>> | null)[]
): Readonly<Record<string, unknown>> | null {
  const present = gates.filter(
    (gate): gate is Readonly<Record<string, unknown>> => gate !== null
  );
  return present.length === 0
    ? null
    : present.length === 1
      ? (present[0] ?? null)
      : { kind: "all", predicates: present };
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
  targetsInputId = "targets",
  overrides: Readonly<{
    difficultyClass?: Readonly<IntegerExpression>;
    testId?: string;
  }> = {}
): Record<string, unknown> {
  return {
    expansion: { bind: "actor", inputId: targetsInputId, kind: "entities" },
    inputId,
    kind: "d20",
    payments: [],
    request: {
      ability,
      actor: "target",
      difficultyClass: overrides.difficultyClass ?? {
        bindingId: TRANSCRIPTION_BINDINGS.saveDc,
        kind: "binding",
      },
      enteredModifiers: [],
      kind: "saving-throw",
      modifiers: [],
      resolution: { kind: "rolled" },
      rollRules: CANONICAL_ROLL_RULES,
      target: "caster",
      testId: overrides.testId ?? "spell-save",
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
function attackInput(
  p: (id: string) => string,
  overrides: Readonly<{
    bonus?: Readonly<IntegerExpression>;
    criticalThreshold?: number;
    sourceId?: string;
    testId?: string;
  }> = {}
): Record<string, unknown> {
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
      criticalThreshold: fixed(overrides.criticalThreshold ?? 20),
      enteredModifiers: [],
      kind: "attack",
      modifiers: [
        {
          sourceId: overrides.sourceId ?? "spell-attack-bonus",
          value: overrides.bonus ?? {
            bindingId: TRANSCRIPTION_BINDINGS.attackBonus,
            kind: "binding",
          },
        },
      ],
      resolution: { kind: "rolled" },
      rollRules: CANONICAL_ROLL_RULES,
      target: "target",
      testId: overrides.testId ?? "spell-attack",
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
  /** The Ice Knife shape: this component saves over its OWN burst target set
   *  instead of riding the primary attack gate. */
  readonly areaSave: boolean;
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
    if (phase.trigger.kind === "damage-taken") {
      // The reactive phase fires only inside a kernel damaging action; the
      // table (the player's pick at damage entry) affirms the trigger fact.
      derived.push(
        clause(`${phase.phaseId}-trigger`, "table", "table-affirms-damage-trigger")
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
  // A healing/Temp-HP pool divides among "any number" of creatures — the same
  // 20-slot domain bound the area path uses. A `primaryTargetOnly` attack aims
  // exactly ONE target even under an area (the burst set is selected apart).
  const targetMaximum =
    typeof maxTargets === "number"
      ? maxTargets
      : hasAttack && spell.primaryTargetOnly === true
        ? 1
        : spell.area || spell.healingPool !== undefined || spell.tempHpPool !== undefined
          ? 20
          : 1;
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
  // landed hit forces the saving throw, which gates the condition. A SECOND
  // target set (Ice Knife) is the other lawful combo: the attack resolves the
  // primary target while the save runs over an independent burst set the table
  // selects — the explosion happens hit or miss, so the save is never
  // attack-gated.
  const combinedGates = hasAttack && hasSave;
  const secondaryAreaSave =
    combinedGates &&
    spell.secondaryDamage !== undefined &&
    spell.secondaryDamage.resolution === "save" &&
    spell.secondaryDamage.area === true &&
    spell.damageOnSave === undefined &&
    !spell.area;
  // The same second-set machinery with NO secondary dice (Searing Orb): the
  // attack damages only its primary target while the area's occupants save
  // against the condition rider.
  const primaryOnlyAreaSave =
    combinedGates &&
    spell.area === true &&
    spell.primaryTargetOnly === true &&
    spell.secondaryDamage === undefined &&
    spell.damageOnSave === undefined;
  const burstSave = secondaryAreaSave || primaryOnlyAreaSave;
  const comboExpressible =
    combinedGates &&
    spell.damageOnSave === undefined &&
    !spell.secondaryDamage &&
    !spell.area;
  if (combinedGates && !comboExpressible && !burstSave) {
    unsupported(
      "attack-and-save",
      spell.damageOnSave !== undefined
        ? "save-halved-damage-under-attack-gate"
        : "two-target-set-combo-pending"
    );
  } else if (burstSave) {
    clauses.push(clause("attack-and-save", "automated", "attack-plus-area-save"));
    if (secondaryAreaSave) {
      clauses.push(clause("burst-area-selection", "spatial", "table-selects-occupants"));
    }
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
        areaSave: false,
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
        areaSave: secondaryAreaSave,
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
    if (component.areaSave) {
      clauses.push(
        clause(
          `${component.inputId}-on-save`,
          "automated",
          component.damageOnSave === "half" ? null : "negates"
        )
      );
    } else if (gatedByAttack) {
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
    if (spell.saveAbility !== undefined && burstSave) {
      // The burst set (the primary target and every creature around it) is a
      // SECOND table-selected target set; the explosion saves hit or miss.
      into.inputs.push({
        eligibility: "creature",
        inputId: p("burst-targets"),
        kind: "entities",
        maximum: fixed(20),
        minimum: fixed(0),
        multiplicity: "slots",
        when: null,
      });
      into.inputs.push(
        savingThrowInput(spell.saveAbility, null, p("saves"), p("burst-targets"))
      );
    } else if (spell.saveAbility !== undefined) {
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
      if (component.areaSave) {
        // The burst component: one shared roll, save-delivered over the burst
        // set; a successful save negates (or halves when declared).
        into.inputs.push(diceInput(p(component.inputId), component.dice, scaledCount));
        into.steps.push({
          delivery: "saving-throw",
          kind: "damage",
          parts: [
            {
              amount: sharedDiceAmount(p(component.inputId), INPUT_TOTAL),
              damageType: component.damageType,
              partId: p(`${component.inputId}-full`),
            },
          ],
          stepId: p(`${component.inputId}-apply`),
          target: {
            cardinality: "per-request",
            inputId: p("saves"),
            kind: "d20-outcome",
            outcomeIds: ["failure"],
            quantifier: "any",
          },
          traits: ["spell"],
          when: null,
        });
        if (component.damageOnSave === "half") {
          into.steps.push({
            delivery: "saving-throw",
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
        continue;
      }
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
    // Creature-type-gated bonus dice (Divine Smite's +1d8 vs Fiends/Undead):
    // the table confirms the target's type through an opt-in boolean, and the
    // confirmed roll lands with the same automatic delivery as the primary
    // smite damage. The weapon hit that licensed the cast already happened in
    // its own program, so a critical's doubled smite dice stay with the table.
    const bonus = spell.bonusDamageAgainst;
    const bonusDice = bonus ? parseDice(bonus.dice) : null;
    if (bonus && bonusDice && !hasAttack && !hasSave) {
      const confirmed: Readonly<Record<string, unknown>> = {
        equals: true,
        inputId: p("bonus-type-confirm"),
        kind: "answer-boolean",
      };
      into.inputs.push({
        inputId: p("bonus-type-confirm"),
        kind: "boolean",
        when: null,
      });
      into.inputs.push(
        diceInput(
          p("bonus-damage-roll"),
          bonusDice,
          fixed(bonusDice.count),
          { binding: "caster", kind: "single" },
          confirmed
        )
      );
      into.steps.push({
        delivery: "automatic",
        kind: "damage",
        parts: [
          {
            amount: sharedDiceAmount(p("bonus-damage-roll"), INPUT_TOTAL),
            damageType: bonus.damageType,
            partId: p("bonus-damage-full"),
          },
        ],
        stepId: p("bonus-damage-apply"),
        target: { inputId: p("targets"), kind: "input" },
        traits: ["spell"],
        when: confirmed,
      });
    }
    // Deterministic leech (Vampiric Touch): the caster heals half the damage
    // the attack-gated steps actually LANDED — read back through the kernel's
    // landed-damage ledger, one heal per hit/crit family, zero on a miss.
    const leech = spell.selfHealingFromDamage;
    if (leech && leech.fraction === 0.5 && hasAttack && !hasSave) {
      for (const component of components) {
        for (const suffix of ["", "-crit"] as const) {
          into.steps.push({
            amount: {
              kind: "landed-damage",
              partId: null,
              stepId: p(`${component.inputId}${suffix}-apply`),
              transform: HALF_INPUT_TOTAL,
            },
            kind: "heal",
            stepId: p(`${component.inputId}${suffix}-leech`),
            target: { kind: "role", role: "caster" },
            when: null,
          });
        }
      }
    }
  };
  if (!deferred) emitResolutionSuite({ inputs, steps });
  if (spell.bonusDamageAgainst) {
    const bonusDice = parseDice(spell.bonusDamageAgainst.dice);
    if (!bonusDice) {
      unsupported("bonus-damage-against", `dice:${spell.bonusDamageAgainst.dice}`);
    } else if (hasAttack || hasSave) {
      unsupported("bonus-damage-against", "creature-type-bonus-under-gates-pending");
    } else {
      clauses.push(
        clause("bonus-damage-against", "automated", "table-confirms-creature-type")
      );
      clauses.push(clause("bonus-damage-roll", "physical-input"));
      clauses.push(
        clause("bonus-damage-creature-type", "table", "table-verifies-creature-type")
      );
    }
  }
  if (spell.selfHealingFromDamage) {
    if (spell.selfHealingFromDamage.fraction === 0.5 && hasAttack && !hasSave) {
      clauses.push(clause("self-healing-from-damage", "automated", "half-landed-damage"));
    } else {
      unsupported(
        "self-healing-from-damage",
        hasAttack && !hasSave
          ? `fraction:${String(spell.selfHealingFromDamage.fraction)}`
          : "leech-without-attack-gate-pending"
      );
    }
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
  // A healing POOL or a CONSUMABLE batch carries the heal itself — the plain
  // heal emission is suppressed for both (the pool splits per target below;
  // the consumable heals when each conjured item is eaten).
  const plainHealing =
    spell.healingPool === undefined && spell.healingMode !== "consumable";
  if (
    plainHealing &&
    spell.healDice !== undefined &&
    flatHeal !== null &&
    spell.healDicePerUpcast !== undefined &&
    flatHealPerUpcast === null
  ) {
    unsupported("healing", `mixed-flat-and-dice-upcast:${spell.healDicePerUpcast}`);
  } else if (plainHealing && spell.healDice !== undefined && flatHeal !== null) {
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
  } else if (plainHealing && spell.healDice !== undefined) {
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
  } else if (spell.healingMode === "consumable") {
    // The cast conjures a closed consumable batch (Goodberry's ten berries);
    // each item's own canonical program heals when it is eaten, and the whole
    // batch expires on the authored lifetime clock.
    const batch = spell.consumableItem;
    if (!batch) {
      unsupported("healing-consumable", "consumable-item-facts-missing");
    } else {
      steps.push({
        instanceKey: batch.itemId,
        itemId: batch.itemId,
        kind: "inventory-create",
        lifetime: {
          kind: "duration",
          seconds: fixed(batch.lifetimeHours * 3600),
        },
        owner: "caster",
        quantity: fixed(batch.count),
        stepId: "conjure-consumables",
        when: null,
      });
      clauses.push(
        clause("healing-consumable", "automated", "conjured-batch-heals-on-consume")
      );
      clauses.push(clause("consumable-lifetime", "automated", "expires-by-duration"));
    }
  }
  if (spell.healingPool !== undefined) {
    // The pool split (Mass Heal): the player chooses each target's portion;
    // the review caps every portion and their SUM at the authored pool.
    inputs.push({
      expansion: { inputId: "targets", kind: "entities" },
      inputId: "portions",
      kind: "integer",
      maximum: fixed(spell.healingPool),
      minimum: fixed(1),
      totalMaximum: fixed(spell.healingPool),
      when: null,
    });
    steps.push({
      amount: {
        cardinality: "per-target-request",
        inputId: "portions",
        kind: "integer-input",
        transform: INPUT_TOTAL,
      },
      kind: "heal",
      stepId: "pool-split-heal",
      target: { inputId: "targets", kind: "input" },
      when: null,
    });
    clauses.push(clause("healing-pool", "automated", "per-target-chosen-split"));
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
    // The Temp-HP pool split (Power Word Fortify): the healing-pool law with a
    // temporary-hit-points step per chosen portion.
    inputs.push({
      expansion: { inputId: "targets", kind: "entities" },
      inputId: "temp-hp-portions",
      kind: "integer",
      maximum: fixed(spell.tempHpPool),
      minimum: fixed(1),
      totalMaximum: fixed(spell.tempHpPool),
      when: null,
    });
    steps.push({
      amount: {
        cardinality: "per-target-request",
        inputId: "temp-hp-portions",
        kind: "integer-input",
        transform: INPUT_TOTAL,
      },
      decision: "replace",
      kind: "temporary-hit-points",
      lifetime: { kind: "manual" },
      stepId: "temp-hp-pool-split",
      target: { inputId: "targets", kind: "input" },
      when: null,
    });
    clauses.push(
      clause("temporary-hit-points-pool", "automated", "per-target-chosen-split")
    );
  }

  // Conditions — classified once; emitted into every phase that carries the
  // resolution suite (the cast normally; the pulse for recurring zones, where
  // each table-signaled event re-applies to that event's failed saves).
  const conditionEntries: {
    readonly conditionId: string;
    /** Chosen-slot-level gates (cast-level duration tiers) — empty ⇒ ungated. */
    readonly levelGates: readonly { comparison: "gte" | "lte"; value: number }[];
    readonly lifetime: Readonly<Record<string, unknown>>;
    readonly suffix: string;
  }[] = [];
  let exhaustionApplication = false;
  if (spell.conditionApplication) {
    const application = spell.conditionApplication;
    if (application.max !== undefined && application.max < application.options.length) {
      clauses.push(clause("condition-choice", "table", "table-picks-subset"));
    }
    if (application.on === "hit" && !gatedByAttack) {
      unsupported("condition-gate", "on-hit-without-attack-gate");
    } else if (application.on === "hit") {
      clauses.push(clause("condition-gate", "automated", "on-landed-attack"));
    } else if (application.on === "passed-check") {
      unsupported("condition-gate", "passed-check-is-action-only");
    }
    for (const conditionId of application.options) {
      if (conditionId === "exhaustion") {
        // Exhaustion is a vitality LEVEL, not a tracked occurrence: the gain
        // is one exhaustion-change; any authored early end (Sickening
        // Radiance's levels vanishing when the spell ends) stays a table
        // correction because levels carry no source identity.
        exhaustionApplication = true;
        clauses.push(clause("condition-exhaustion", "automated", "one-level-gained"));
        clauses.push(
          clause("condition-exhaustion-end", "table", "level-removal-table-owned")
        );
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
        if (authored.byCastLevel !== undefined && authored.byCastLevel.length > 0) {
          // Cast-level duration tiers (Geas: 30 days, a year from 7th,
          // until removed at 9th): one condition step per level SEGMENT,
          // gated on the chosen slot level, each with its exact duration —
          // an `indefinite` top tier keeps the table-owned manual end.
          const tiers = [...authored.byCastLevel].sort(
            (left, right) => left.minLevel - right.minLevel
          );
          const tierable =
            spell.level > 0 &&
            new Set(tiers.map((tier) => tier.minLevel)).size === tiers.length &&
            tiers.every(
              (tier) =>
                tier.minLevel > spell.level &&
                tier.minLevel <= 9 &&
                (tier.indefinite === true || typeof tier.minutes === "number")
            );
          if (!tierable) {
            unsupported(`condition-${conditionId}-lifetime`, "cast-level-tier-shape");
            continue;
          }
          const segments = [
            { from: spell.level, indefinite: false, minutes: authored.minutes },
            ...tiers.map((tier) => ({
              from: tier.minLevel,
              indefinite: tier.indefinite === true,
              minutes: tier.minutes ?? 0,
            })),
          ];
          for (const [index, segment] of segments.entries()) {
            const to =
              segments[index + 1] !== undefined
                ? (segments[index + 1]?.from ?? 10) - 1
                : 9;
            conditionEntries.push({
              conditionId,
              levelGates: [
                ...(segment.from > spell.level
                  ? [{ comparison: "gte" as const, value: segment.from }]
                  : []),
                ...(to < 9 ? [{ comparison: "lte" as const, value: to }] : []),
              ],
              lifetime: segment.indefinite
                ? { kind: "manual" }
                : { kind: "duration", seconds: fixed(segment.minutes * 60) },
              suffix: index === 0 ? "" : `-t${segment.from}`,
            });
          }
          clauses.push(
            clause(`condition-${conditionId}-lifetime`, "automated", "cast-level-tiers")
          );
          if (segments.some((segment) => segment.indefinite)) {
            clauses.push(
              clause(
                `condition-${conditionId}-lifetime-top-tier`,
                "table",
                "until-removed-table-owned"
              )
            );
          }
          clauses.push(clause(`condition-${conditionId}`, "automated"));
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
      conditionEntries.push({
        conditionId,
        levelGates: [],
        lifetime: conditionLifetime,
        suffix: "",
      });
      clauses.push(clause(`condition-${conditionId}`, "automated"));
    }
  }
  const emitConditionSuite = (
    into: { steps: Record<string, unknown>[] },
    levelBindingId = "input.slot.level",
    prefix = ""
  ): void => {
    const application = spell.conditionApplication;
    if (!application) return;
    const p = (id: string): string => `${prefix}${id}`;
    const gatedTarget = (): Readonly<Record<string, unknown>> =>
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
          : { inputId: p("targets"), kind: "input" };
    if (exhaustionApplication) {
      into.steps.push({
        amount: fixed(1),
        kind: "exhaustion-change",
        operation: "gain",
        stepId: p("condition-exhaustion"),
        target: gatedTarget(),
        when: null,
      });
    }
    for (const entry of conditionEntries) {
      into.steps.push({
        conditionId: entry.conditionId,
        kind: "condition",
        lifetime: entry.lifetime,
        operation: "apply",
        stepId: p(`condition-${entry.conditionId}${entry.suffix}`),
        target: gatedTarget(),
        when:
          entry.levelGates.length === 0
            ? null
            : allOf(
                ...entry.levelGates.map((gate) => ({
                  bindingId: levelBindingId,
                  comparison: gate.comparison,
                  kind: "binding",
                  value: fixed(gate.value),
                }))
              ),
      });
    }
  };
  if (!deferred) emitConditionSuite({ steps });
  if (spell.conditionRemoval) {
    for (const conditionId of spell.conditionRemoval.options) {
      if (conditionId === "exhaustion") {
        // Exhaustion lives on the vitality track, not the condition ledger:
        // the cure is one exhaustion level removed (Greater Restoration), a
        // safe no-op at level 0.
        steps.push({
          amount: fixed(1),
          kind: "exhaustion-change",
          operation: "remove",
          stepId: "cure-exhaustion",
          target: { inputId: "targets", kind: "input" },
          when: null,
        });
        clauses.push(clause("cure-exhaustion", "automated", "one-level-removed"));
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
    emitConditionSuite(
      { steps: pulseSteps },
      `register.${CAST_LEVEL_REGISTER}`,
      "pulse-"
    );
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
  // The persistent follow-up (Wall of Fire: the standing wall damages whoever
  // enters it or ends their turn beside it): the SAME root-pulse machinery a
  // recurring spell uses, carrying only the follow-up's own automatic-damage
  // suite. The table signals each occurrence; the engine rolls and applies.
  let followUpPhase: Record<string, unknown> | null = null;
  let followUpUsesRegister = false;
  if (spell.followUp) {
    const followUp = spell.followUp;
    const followUpAttack = followUp.attack;
    const followUpDice =
      followUpAttack?.dice !== undefined ? parseDice(followUpAttack.dice) : null;
    const followUpPer =
      followUpAttack?.dicePerUpcast !== undefined
        ? parseDice(followUpAttack.dicePerUpcast)
        : null;
    const followUpMax = followUp.targeting?.maxTargets;
    const expressible =
      !pulse &&
      !deferred &&
      followUpAttack !== undefined &&
      followUpAttack.resolution === "automatic" &&
      followUpDice !== null &&
      (followUpAttack.dicePerUpcast === undefined ||
        (followUpPer !== null && followUpPer.sides === followUpDice.sides)) &&
      followUpAttack.damageType !== undefined &&
      followUpAttack.mode === undefined &&
      followUp.saveAbility === undefined &&
      followUp.attackType === undefined &&
      followUp.conditionApplication === undefined &&
      followUp.heal === undefined &&
      typeof followUpMax !== "string";
    if (!expressible) {
      unsupported("follow-up", "follow-up-shape-unexpressed");
    } else {
      followUpUsesRegister = spell.level > 0 && followUpPer !== null;
      followUpPhase = {
        inputs: [
          {
            eligibility: "creature",
            inputId: "follow-up-targets",
            kind: "entities",
            maximum: fixed(
              typeof followUpMax === "number"
                ? followUpMax
                : followUp.area === true
                  ? 20
                  : 1
            ),
            minimum: fixed(0),
            multiplicity: "slots",
            when: null,
          },
          diceInput(
            "follow-up-roll",
            followUpDice,
            followUpUsesRegister
              ? upcastCount(
                  followUpDice.count,
                  followUpPer?.count ?? null,
                  spell.level,
                  `register.${CAST_LEVEL_REGISTER}`
                )
              : fixed(followUpDice.count)
          ),
        ],
        phaseId: "follow-up",
        steps: [
          {
            delivery: "automatic",
            kind: "damage",
            parts: [
              {
                amount: sharedDiceAmount("follow-up-roll", INPUT_TOTAL),
                damageType: followUpAttack.damageType,
                partId: "follow-up-damage",
              },
            ],
            stepId: "follow-up-apply",
            target: { inputId: "follow-up-targets", kind: "input" },
            traits: ["spell"],
            when: null,
          },
        ],
        trigger: { eventId: "follow-up", kind: "root-pulse" },
      };
      clauses.push(clause("follow-up", "automated", "table-signaled-pulse-damage"));
      clauses.push(clause("follow-up-roll", "physical-input"));
      clauses.push(clause("follow-up-occupancy", "spatial", "table-signals-pulse"));
      clauses.push(clause("follow-up-application", "automated"));
    }
  }
  if (spell.endsOnSuccessfulSave === true && !pulse) {
    unsupported("ends-on-save", "repeat-save-without-recurrence");
  }

  // The chosen cast level is recorded once at resolution for every later
  // triggered phase that re-reads it (a recurring pulse spliced its own
  // recorder above; an upcasting follow-up needs the same record).
  if (followUpUsesRegister && pulsePhase === null) {
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

  const phases: Record<string, unknown>[] = [
    { inputs, phaseId: "resolve", steps, trigger: { kind: "invocation" } },
    ...(pulsePhase ? [pulsePhase] : []),
    ...(followUpPhase ? [followUpPhase] : []),
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
  const stepless = steps.length === 0 && pulsePhase === null && followUpPhase === null;
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
      (pulsePhase !== null && spell.level > 0) || followUpUsesRegister
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

export interface FeatureActionTranscription {
  readonly actionId: string;
  readonly clauses: readonly TranscriptionClause[];
  readonly program: Readonly<MechanicsProgram> | null;
}

/**
 * Transcribe one feature-granted action's declarative facts (Second Wind:
 * spend one tracker use, heal 1d10 + the resolved class-level bonus). The
 * tracker rides the world's POOL model; the heal/THP flat term arrives as the
 * caller-resolved `feature-bonus` binding. Fields beyond this first family
 * report explicit unsupported boundaries — never silently green.
 */
/** The feature-level facts an action inherits (its tracker, its standing buffs)
 *  plus the caller-resolved facts a level/session-dependent emission needs. */
export interface FeatureActionContext {
  /**
   * The concrete damage type of a `damageTypeFromBundle` attack (Breath
   * Weapon's chosen Draconic Ancestry element) — session-derived, so the
   * catalogue alone cannot name it. Absent ⇒ the attack stays unexpressed.
   */
  readonly attackDamageType?: string;
  /** The RESOLVED `classSpecific:*` die of this action's heal/Temp-HP/granted
   *  die ("d8" — the monk's Martial Arts die at the character's level, the
   *  bard's Inspiration die tier). Session-derived except where a tracker's
   *  own base `die` declares it. Absent ⇒ the sentinel stays unexpressed. */
  readonly classDie?: string;
  /** The die a DICE payment pool holds ("d12" — Warrior of the Gods), read off
   *  the pool tracker's own `die` declaration. Present ⇒ a pool spend rolls
   *  the chosen number of these dice and heals the total; absent ⇒ the pool
   *  holds points and the chosen amount heals exactly (Lay on Hands). */
  readonly poolDie?: string;
  /** The action's owning-class/character scaling level — gates `fromLevel`
   *  cures/Temp-HP and picks `diceByLevel`/`damageTypeChoicesByLevel` tiers.
   *  Absent ⇒ only ungated facts transcribe. */
  readonly scalingLevel?: number;
  /** The TARGET tracker's own full-recovery rest for a `trackerTopUp` action
   *  (Uncanny Metabolism refills Focus exactly as its short rest would), read
   *  off that tracker's `recovery` declaration. Absent ⇒ top-up unexpressed. */
  readonly topUpRecovery?: "long-rest" | "short-rest";
  readonly trackerId?: string;
  readonly whileActive?: readonly Readonly<{
    readonly activeKey: string;
    readonly maintained: boolean;
  }>[];
}

/**
 * The ONE claim/requirement identity of a feature-granted reaction's kernel
 * Reaction claim — used by the transcribed program's `claim-reaction` step,
 * by an authored `mechanicsProgram`'s hand-written claim, and by the turn
 * economy projection's requirement roster (`characterTurnEconomyProjection`),
 * so the claim and its authorization can never drift. Pure id math.
 */
export function damageReactionClaimId(
  featureId: string,
  action: Readonly<Pick<SrdActionDef, "id">>,
  ordinal: number
): string {
  return `reaction.${featureId}.${action.id ?? String(ordinal)}`;
}

/**
 * The damage-reaction FAMILY (S-reaction): a `type: "reaction"` action whose
 * whole effect is reducing one observed incoming damage instance (Deflect
 * Attacks' 1d10 + DEX + Monk level). Compiles to the canonical reactive
 * shape: an invocation phase that CLAIMS the round's Reaction, plus a
 * `damage-taken` phase carrying the `incoming-damage-adjustment` — so the
 * reduction executes INSIDE the damaging causal action itself (the kernel's
 * compensating-reduction model, bounded by the triggering resolution's
 * effective damage) and the spent program ends. The damage-entry runtime
 * (`lib/damage-reaction.ts`) composes the table-entered hit around this
 * program; the trigger's attack-delivered fact is affirmed by the player's
 * pick, exactly like the legacy card's click.
 */
function transcribeDamageReactionAction(
  featureId: string,
  action: Readonly<SrdActionDef>,
  ordinal: number,
  feature: Readonly<FeatureActionContext>,
  actionId: string
): FeatureActionTranscription {
  const clauses: TranscriptionClause[] = [];
  const unsupported = (clauseId: string, detail: string): void => {
    clauses.push(clause(clauseId, "unsupported", detail));
  };
  const reduction = action.damageReduction;
  if (!reduction) throw new Error("damage-reaction transcription without reduction");
  if (action.type !== "reaction") {
    unsupported("damage-reaction", "non-reaction-carrier");
  }
  const dice = parseDice(reduction.dice);
  if (dice === null) {
    unsupported("reduction-roll", `dice:${reduction.dice}`);
  }
  // The eligible damage types are a level tier (Deflect Attacks widens from
  // B/P/S to everything at Monk 13) — resolvable only at the session level.
  const tier =
    feature.scalingLevel !== undefined
      ? pickLevelTier(reduction.damageTypesByLevel, feature.scalingLevel)
      : null;
  if (tier === null) {
    unsupported("reduction-damage-types", "level-scaled-types-need-session-level");
  }
  if (action.trigger !== undefined) {
    clauses.push(clause("reaction-trigger", "table", `table-affirms-${action.trigger}`));
  }
  if (clauses.some((entry) => entry.status === "unsupported")) {
    return { actionId, clauses, program: null };
  }
  const hasBonus = reduction.addAbility !== undefined || reduction.addLevel === true;
  const claimKey = damageReactionClaimId(featureId, action, ordinal);
  const program = conformMechanicsProgram({
    id: actionId,
    phases: [
      {
        inputs: [],
        phaseId: "resolve",
        steps: [
          {
            claim: {
              claimId: claimKey,
              kind: "claim-reaction",
              reaction: { kind: "program", requirementId: claimKey },
            },
            combatant: "caster",
            kind: "turn-claim",
            stepId: "claim-reaction",
            when: null,
          },
        ],
        trigger: { kind: "invocation" },
      },
      {
        inputs:
          dice === null ? [] : [diceInput("reduction-roll", dice, fixed(dice.count))],
        phaseId: "deflect",
        steps: [
          {
            amount: sharedDiceAmount(
              "reduction-roll",
              hasBonus
                ? {
                    kind: "add",
                    terms: [
                      INPUT_TOTAL,
                      { bindingId: TRANSCRIPTION_BINDINGS.featureBonus, kind: "binding" },
                    ],
                  }
                : INPUT_TOTAL
            ),
            kind: "incoming-damage-adjustment",
            selector: {
              // The full 13-type tier means "any damage" — the empty selector.
              damageTypes: (tier ?? []).length >= 13 ? [] : [...(tier ?? [])].sort(),
              deliveries: ["attack"],
              forbiddenTraits: [],
              requiredTraits: [],
            },
            sourceId: claimKey,
            stepId: "reduce",
            when: null,
          },
          // A reaction is single-use: the spent program ends inside the same
          // causal action, so it can never re-fire on a later hit.
          { kind: "end-program", stepId: "spent", when: null },
        ],
        trigger: { kind: "damage-taken", target: "caster" },
      },
    ],
    registers: [],
    version: 1,
  });
  if (!program) {
    return {
      actionId,
      clauses: [
        ...clauses,
        clause("damage-reaction", "unsupported", "program-conformance"),
      ],
      program: null,
    };
  }
  clauses.push(clause("economy", "automated", "kernel-claims-reaction"));
  clauses.push(clause("reduction-roll", "physical-input"));
  if (hasBonus) {
    clauses.push(clause("reduction-bonus", "automated", "caller-resolved-term"));
  }
  clauses.push(
    clause("damage-reaction", "automated", "incoming-adjustment-in-triggering-action")
  );
  return { actionId, clauses, program };
}

export function transcribeFeatureAction(
  featureId: string,
  action: Readonly<SrdActionDef>,
  ordinal: number,
  feature: Readonly<FeatureActionContext> = {}
): FeatureActionTranscription {
  const actionId = `action:${featureId}:${action.id ?? String(ordinal)}`;
  const clauses: TranscriptionClause[] = [];
  const inputs: Record<string, unknown>[] = [];
  const steps: Record<string, unknown>[] = [];
  const unsupported = (clauseId: string, detail: string): void => {
    clauses.push(clause(clauseId, "unsupported", detail));
  };

  // The hand-authored canonical channel — the action-side twin of the spell
  // `mechanicsProgram` field: served VERBATIM as the executable truth, with
  // the clause classification derived from the program's own structure
  // (Uncanny Dodge's halving reaction).
  if (action.mechanicsProgram !== undefined) {
    const authored = conformMechanicsProgram(action.mechanicsProgram);
    if (!authored) {
      return {
        actionId,
        clauses: [clause("authored-program", "unsupported", "program-conformance")],
        program: null,
      };
    }
    return {
      actionId,
      clauses: clausesFromAuthoredProgram(authored),
      program: authored,
    };
  }

  // The damage-reaction family owns its whole program shape (claim phase +
  // damage-taken adjustment phase) — never the generic accumulation below.
  if (action.damageReduction !== undefined) {
    return transcribeDamageReactionAction(featureId, action, ordinal, feature, actionId);
  }

  // The structural boundary left: an attack SEQUENCE whose unarmed-strike
  // profile is session-resolved (the weapon-attack seam's future work).
  const blockers: readonly (readonly [boolean, string, string])[] = [
    [
      action.attackSequence !== undefined,
      "attack-sequence",
      "session-attack-profile-pending",
    ],
  ];
  for (const [present, clauseId, detail] of blockers) {
    if (present) unsupported(clauseId, detail);
  }
  if (action.locksMovement === true) {
    // Movement is spatial truth the app deliberately does not model in solo
    // play — the speed-0 lock stays a table fact (Steady Aim).
    clauses.push(clause("locks-movement", "table", "speed-zero-table-owned"));
  }

  // Turn economy: a DECLARED per-turn cap compiles the canonical turn-claim
  // against the caster's turn-economy projection — the slot claim for a typed
  // action (one bonus action per turn IS Martial Arts' cap), a once-per-turn
  // manual boundary for a free action (Redirect). The compiler scopes each
  // use's claim identity by root generation, so a second capped use in the
  // SAME turn genuinely re-claims and rejects, and the next round's reset
  // ledger admits it again. Uncapped economy stays a table fact until the
  // dispatch layer claims it.
  const perTurnCapped = action.maxUsesPerTurn === 1;
  if (perTurnCapped) {
    const capKey = `per-turn.${featureId}.${action.id ?? String(ordinal)}`;
    const claim: Readonly<Record<string, unknown>> =
      action.type === "bonus"
        ? {
            bonusAction: { kind: "action", requirementId: capKey },
            claimId: capKey,
            kind: "claim-bonus-action",
          }
        : action.type === "action"
          ? { action: { kind: "magic" }, claimId: capKey, kind: "claim-action" }
          : action.type === "reaction"
            ? {
                claimId: capKey,
                kind: "claim-reaction",
                reaction: { kind: "program", requirementId: capKey },
              }
            : {
                authority: "table",
                boundaryId: capKey,
                claimId: capKey,
                kind: "record-manual-boundary",
              };
    steps.push({
      claim,
      combatant: "caster",
      kind: "turn-claim",
      stepId: "per-turn-claim",
      when: null,
    });
    clauses.push(
      clause(
        "per-turn-cap",
        "automated",
        action.type === "free" ? "manual-boundary-claim" : "turn-slot-claim"
      )
    );
  } else if (action.maxUsesPerTurn !== undefined) {
    clauses.push(clause("per-turn-cap", "table", "multi-use-cap-table-owned"));
  }
  clauses.push(
    perTurnCapped && action.type !== "free"
      ? clause("economy", "automated", `kernel-claims-${action.type}`)
      : clause("economy", "table", `table-spends-${action.type}`)
  );
  if (action.trigger !== undefined) {
    clauses.push(clause("reaction-trigger", "table", `table-signals-${action.trigger}`));
  }
  if (
    action.requiresActionThisTurn !== undefined ||
    action.requiresOutcomeThisTurn !== undefined ||
    action.requiresActionCategoryThisTurn !== undefined
  ) {
    clauses.push(clause("turn-prerequisite", "table", "table-verifies-prerequisite"));
  }

  // A maintainer re-ups an already-active state for the current round: the
  // standing key is already lit and the rounds ledger is table-owned, so the
  // whole use is a table fact in solo play (the encounter runtime's turn
  // economy is the future owner of the round extension).
  const isMaintainer = action.maintainsActiveKey !== undefined;
  if (isMaintainer) {
    clauses.push(clause("maintain", "table", "maintained-duration-table-owned"));
  }

  // Tracker payment as a world pool: the action's own tracker (or the bound
  // extra tracker), or the owning feature's tracker when the action is that
  // feature's activator (Rage). A pool-spend action pays a CHOSEN number of
  // points instead of a fixed use count, so it owns its payment below.
  const paymentTracker =
    action.costTracker ??
    action.costTrackerOverride ??
    (isMaintainer ? undefined : feature.trackerId);
  const isPoolSpend = action.poolSpendEffect !== undefined;
  if (isPoolSpend && paymentTracker === undefined) {
    unsupported("pool-spend", "pool-spend-without-tracker");
  }
  // A refund-on-fail check bonus (Tactical Mind) never pays up front: the use
  // is expended only when the die turns the failed check into a success, so
  // its debit is a conditional step below instead of a payment input.
  const refundableCheck = action.checkBonus?.refundOnFail === true;
  if (paymentTracker !== undefined && !isPoolSpend && !refundableCheck) {
    const primaryTerm = {
      amount: fixed(action.trackerCost ?? 1),
      selector: { kind: "pool", owner: "caster", resourceId: paymentTracker },
    };
    const alternate = action.alternateCost;
    const alternateTerm =
      alternate === undefined
        ? null
        : alternate.kind === "spell-slot"
          ? {
              amount: fixed(1),
              selector: {
                kind: "spell-slot",
                level: { kind: "minimum", value: alternate.minLevel },
                owner: "caster",
                pool: "either",
              },
            }
          : alternate.kind === "tracker"
            ? {
                amount: fixed(alternate.amount ?? 1),
                selector: {
                  kind: "pool",
                  owner: "caster",
                  resourceId: alternate.trackerId,
                },
              }
            : null;
    if (alternate !== undefined && alternateTerm === null) {
      unsupported("alternate-cost", `cost-kind:${alternate.kind}`);
    } else if (alternateTerm !== null) {
      // Two independent ways to pay (Wild Companion: a Wild Shape use OR a
      // spell slot): the player picks one; each payment activates on its arm.
      inputs.push({
        inputId: "cost-choice",
        kind: "choice",
        options: ["primary", "alternate"],
        when: null,
      });
      inputs.push({
        inputId: "uses",
        kind: "resource",
        term: primaryTerm,
        when: { choiceId: "primary", inputId: "cost-choice", kind: "answer-choice" },
      });
      inputs.push({
        inputId: "alternate-cost",
        kind: "resource",
        term: alternateTerm,
        when: { choiceId: "alternate", inputId: "cost-choice", kind: "answer-choice" },
      });
      clauses.push(clause("cost-choice", "automated", "player-picks-payment"));
      clauses.push(clause("tracker-payment", "automated", "chosen-of-two-costs"));
      clauses.push(clause("alternate-cost", "automated", "chosen-of-two-costs"));
    } else {
      inputs.push({
        inputId: "uses",
        kind: "resource",
        term: primaryTerm,
        when: null,
      });
      clauses.push(clause("tracker-payment", "automated"));
    }
  } else if (action.alternateCost !== undefined) {
    unsupported("alternate-cost", "alternate-without-primary-tracker");
  }

  // Activating a feature that carries while-active buffs lights each key on
  // the actor; a maintained duration stays a table-owned end (Rage's rounds).
  if (!isMaintainer && (feature.whileActive?.length ?? 0) > 0) {
    for (const buff of feature.whileActive ?? []) {
      steps.push({
        fact: { key: buff.activeKey, kind: "active-key" },
        kind: "standing",
        lifetime: { kind: "manual" },
        operation: "start",
        stepId: `standing-${buff.activeKey}`,
        target: { kind: "role", role: "caster" },
        when: null,
      });
      clauses.push(clause(`standing-${buff.activeKey}`, "automated"));
      clauses.push(
        clause(
          `standing-${buff.activeKey}-duration`,
          "table",
          buff.maintained ? "maintained-by-table" : "table-owned-end"
        )
      );
    }
  }

  // Targeting: the table selects who is inside an area; the engine applies.
  const maxTargets = action.targeting?.maxTargets;
  if (typeof maxTargets === "string") {
    unsupported("targeting", `dynamic-max-targets:${maxTargets}`);
  } else {
    inputs.push({
      eligibility: "creature",
      inputId: "targets",
      kind: "entities",
      maximum: fixed(
        typeof maxTargets === "number" ? maxTargets : action.area === true ? 20 : 1
      ),
      minimum: fixed(0),
      multiplicity: "slots",
      when: null,
    });
    clauses.push(clause("targeting", "automated"));
    if (action.area === true) {
      clauses.push(clause("area-selection", "spatial", "table-selects-occupants"));
    }
  }

  // The flat skill check (Hide's DC 15 DEX/Stealth): a real ability-check
  // request against the authored DC; the actor's skill bonus arrives as ONE
  // required table-entered modifier (the sheet knows it, the kernel verifies
  // the arithmetic). Consequences gate on the check outcome below.
  if (action.skillCheck !== undefined) {
    inputs.push({
      expansion: { binding: "caster", kind: "single" },
      inputId: "check",
      kind: "d20",
      payments: [],
      request: {
        ability: SKILL_ABILITY.get(action.skillCheck.skill) ?? "STR",
        actor: "caster",
        difficultyClass: fixed(action.skillCheck.dc),
        enteredModifiers: [
          {
            kind: "exact",
            maximum: fixed(30),
            minimum: fixed(-10),
            required: true,
            sourceId: "skill-modifier",
          },
        ],
        kind: "ability-check",
        modifiers: [],
        resolution: { kind: "rolled" },
        rollRules: CANONICAL_ROLL_RULES,
        target: null,
        testId: "skill-check",
      },
      when: null,
    });
    clauses.push(clause("skill-check", "physical-input"));
    clauses.push(clause("skill-check-adjudication", "automated", "vs-authored-dc"));
  }

  // The refundable check bonus (Tactical Mind): the die is rolled onto an
  // already-failed check; the table confirms whether it turned the check, and
  // only that confirmed success spends the use.
  if (action.checkBonus !== undefined) {
    const bonusDice = parseDice(action.checkBonus.dice);
    if (bonusDice === null) {
      unsupported("check-bonus", `dice:${action.checkBonus.dice}`);
    } else {
      inputs.push(diceInput("check-bonus-roll", bonusDice, fixed(bonusDice.count)));
      clauses.push(clause("check-bonus-roll", "physical-input"));
      clauses.push(clause("check-bonus", "automated", "die-added-to-failed-check"));
      clauses.push(clause("check-outcome", "table", "table-adjudicates-final-check"));
      if (refundableCheck && paymentTracker !== undefined) {
        const turned: Readonly<Record<string, unknown>> = {
          equals: true,
          inputId: "check-turned-success",
          kind: "answer-boolean",
        };
        inputs.push({ inputId: "check-turned-success", kind: "boolean", when: null });
        steps.push({
          kind: "resource-change",
          operation: "spend",
          stepId: "refundable-use",
          term: {
            amount: fixed(action.trackerCost ?? 1),
            selector: { kind: "pool", owner: "caster", resourceId: paymentTracker },
          },
          when: turned,
        });
        clauses.push(
          clause("tracker-payment", "automated", "debited-only-on-turned-success")
        );
      }
    }
  }

  // A granted held die (Bardic Inspiration): a standing program-fact on the
  // chosen creature carrying the die face, alive for the RAW hour; ADDING the
  // die to a later roll stays player-applied by design (the Hex-rider rule).
  if (action.grantDie !== undefined) {
    const dieToken = action.grantDie.die;
    const face = dieToken.startsWith("classSpecific:") ? feature.classDie : dieToken;
    if (face === undefined || parseDice(`1${face}`) === null) {
      unsupported("grant-die", "session-die-unresolved");
    } else {
      steps.push({
        fact: { factId: `${featureId}-die`, kind: "program-fact", value: face },
        kind: "standing",
        lifetime: { kind: "duration", seconds: fixed(3600) },
        operation: "start",
        stepId: "grant-die",
        target: { inputId: "targets", kind: "input" },
        when: null,
      });
      clauses.push(clause("grant-die", "automated", "standing-die-fact-one-hour"));
      clauses.push(clause("grant-die-use", "table", "player-applies-die-by-design"));
    }
  }

  // A full tracker top-up (Uncanny Metabolism refills Focus): the SAME
  // recovery the target tracker's own rest performs, fired now.
  if (action.trackerTopUp !== undefined) {
    if (action.trackerTopUp.upTo !== "full") {
      unsupported("tracker-topup", "partial-topup-pending");
    } else if (feature.topUpRecovery === undefined) {
      unsupported("tracker-topup", "target-tracker-recovery-unresolved");
    } else {
      steps.push({
        kind: "resource-recover",
        resource: {
          kind: "pool",
          owner: "caster",
          resourceId: action.trackerTopUp.trackerId,
        },
        stepId: "topup-recover",
        trigger: { kind: feature.topUpRecovery },
        when: null,
      });
      clauses.push(clause("tracker-topup", "automated", "full-recovery-now"));
    }
  }

  // Next-attack advantage (Steady Aim): the buff is a real standing fact until
  // the caster's turn ends; APPLYING the advantage on the next roll stays
  // player-owned by design, like every rider.
  if (action.grantsNextAttackAdvantage === true) {
    steps.push({
      fact: { factId: "next-attack-advantage", kind: "program-fact", value: true },
      kind: "standing",
      lifetime: {
        combatant: "caster",
        kind: "turn-boundary",
        // Offset 1 = the NEXT end-of-turn boundary, i.e. the end of the
        // caster's current turn (the kernel's one-based boundary convention).
        offsetTurns: fixed(1),
        phase: "end",
      },
      operation: "start",
      stepId: "standing-next-attack-advantage",
      target: { kind: "role", role: "caster" },
      when: null,
    });
    clauses.push(clause("next-attack-advantage", "automated", "standing-until-turn-end"));
    clauses.push(
      clause("next-attack-advantage-use", "table", "player-applies-advantage-by-design")
    );
  }

  // Pool spend at a chosen amount (Lay on Hands): the player picks how many
  // pool points to draw; the SAME chosen number is the pool debit and the heal
  // (a dice-unit pool rolls that many dice instead — Warrior of the Gods).
  // Pool-priced cures ride the same use as opt-in booleans, each paying its own
  // fixed debit from the SAME pool; RAW: cure points never also restore HP.
  const chosenAmount: IntegerExpression = {
    bindingId: "input.amount.value",
    kind: "binding",
  };
  if (isPoolSpend && paymentTracker !== undefined) {
    const availableCures = (action.cureConditions ?? []).filter(
      (cure) =>
        cure.fromLevel === undefined ||
        (feature.scalingLevel !== undefined && feature.scalingLevel >= cure.fromLevel)
    );
    for (const cure of action.cureConditions ?? []) {
      if (!availableCures.includes(cure)) {
        clauses.push(
          clause(`cure-${cure.condition}-locked`, "narrative", "below-unlock-level")
        );
      }
    }
    const cures = availableCures;
    const healable = cures.length > 0 ? { minimum: 0 } : { minimum: 1 };
    inputs.push({
      inputId: "amount",
      kind: "integer",
      // 1000 is the same clamped domain bound the full-restore heal uses: no
      // 2024 pool exceeds it, and the pool payment itself enforces the real
      // ceiling (an unaffordable chosen amount fails the resource review).
      maximum: fixed(1000),
      minimum: fixed(healable.minimum),
      when: null,
    });
    clauses.push(clause("pool-spend-amount", "automated", "player-chosen-pool-points"));
    const healChosen: Readonly<Record<string, unknown>> = {
      comparison: "gte",
      inputId: "amount",
      kind: "answer-integer",
      value: fixed(1),
    };
    inputs.push({
      inputId: "uses",
      kind: "resource",
      term: {
        amount: chosenAmount,
        selector: { kind: "pool", owner: "caster", resourceId: paymentTracker },
      },
      when: cures.length > 0 ? healChosen : null,
    });
    clauses.push(clause("tracker-payment", "automated", "chosen-amount-debit"));
    for (const cure of cures) {
      // The opt-in input carries the `-opt` suffix: inputs and steps share one
      // program-wide id namespace, and the remove step below owns the bare id.
      const opted: Readonly<Record<string, unknown>> = {
        equals: true,
        inputId: `cure-${cure.condition}-opt`,
        kind: "answer-boolean",
      };
      inputs.push({
        inputId: `cure-${cure.condition}-opt`,
        kind: "boolean",
        when: null,
      });
      inputs.push({
        inputId: `cure-${cure.condition}-payment`,
        kind: "resource",
        term: {
          amount: fixed(cure.costHp),
          selector: { kind: "pool", owner: "caster", resourceId: paymentTracker },
        },
        when: opted,
      });
      steps.push(
        cure.condition === "exhaustion"
          ? {
              amount: fixed(1),
              kind: "exhaustion-change",
              operation: "remove",
              stepId: `cure-${cure.condition}`,
              target: { inputId: "targets", kind: "input" },
              when: opted,
            }
          : {
              conditionId: cure.condition,
              kind: "condition",
              lifetime: null,
              operation: "remove",
              stepId: `cure-${cure.condition}`,
              target: { inputId: "targets", kind: "input" },
              when: opted,
            }
      );
      clauses.push(clause(`cure-${cure.condition}-cost`, "automated", "pool-priced"));
      clauses.push(clause(`cure-${cure.condition}`, "automated"));
    }
    // The pool's own `die` declaration is the discriminator: a dice pool rolls
    // the chosen number of dice (Warrior of the Gods, Boon of Recovery); a
    // die-less pool holds points and heals the chosen amount (Lay on Hands).
    const poolDice =
      feature.poolDie !== undefined ? parseDice(`1${feature.poolDie}`) : null;
    if (feature.poolDie !== undefined && poolDice === null) {
      unsupported("pool-spend-healing", `pool-die:${feature.poolDie}`);
    } else if (poolDice !== null) {
      inputs.push(diceInput("pool-roll", poolDice, chosenAmount));
      steps.push({
        amount: sharedDiceAmount("pool-roll", INPUT_TOTAL),
        kind: "heal",
        stepId: "pool-heal-apply",
        target: { inputId: "targets", kind: "input" },
        when: cures.length > 0 ? healChosen : null,
      });
      clauses.push(clause("pool-spend-roll", "physical-input"));
      clauses.push(clause("pool-spend-healing", "automated", "rolled-total"));
    } else {
      steps.push({
        amount: { expression: chosenAmount, kind: "integer" },
        kind: "heal",
        stepId: "pool-heal-apply",
        target: { inputId: "targets", kind: "input" },
        when: cures.length > 0 ? healChosen : null,
      });
      clauses.push(clause("pool-spend-healing", "automated", "heals-chosen-amount"));
    }
  } else if (action.cureConditions !== undefined) {
    unsupported("cure-cost-pool", "pool-priced-cures-without-pool");
  }

  // The declarative attack (S11): its choice inputs must precede the save it
  // gates, so the mode/type questions are asked before any die is rolled.
  const attack = action.attack;
  const healOrDamage = attack?.mode === "heal-or-damage";
  const damageMode: Readonly<Record<string, unknown>> | null = healOrDamage
    ? { choiceId: "damage", inputId: "attack-mode", kind: "answer-choice" }
    : null;
  if (healOrDamage) {
    inputs.push({
      inputId: "attack-mode",
      kind: "choice",
      options: ["heal", "damage"],
      when: null,
    });
    clauses.push(clause("attack-mode-choice", "automated", "player-picks-each-use"));
  }
  // Level-scaled type choices (Deflect Attacks' Redirect widening at 13)
  // resolve through the session scaling level; the catalogue alone cannot
  // pick the tier.
  const scaledTypeChoices =
    attack?.damageTypeChoicesByLevel !== undefined && feature.scalingLevel !== undefined
      ? pickLevelTier(attack.damageTypeChoicesByLevel, feature.scalingLevel)
      : null;
  const attackTypeChoices =
    attack !== undefined && attack.damageType === undefined
      ? (attack.damageTypeChoices ?? scaledTypeChoices ?? null)
      : null;
  if (attackTypeChoices !== null && attackTypeChoices.length > 0) {
    inputs.push({
      inputId: "attack-damage-type",
      kind: "choice",
      options: [...attackTypeChoices],
      when: damageMode,
    });
    clauses.push(clause("attack-damage-type-choice", "automated", "player-picks-type"));
  }

  // Saving throw (the DC binding is caller-resolved, like a spell's). Under a
  // heal-or-damage attack the save exists only when the damage mode is chosen.
  if (action.saveAbility !== undefined) {
    inputs.push(savingThrowInput(action.saveAbility, damageMode));
    clauses.push(clause("saving-throw", "physical-input"));
  }

  // The declarative attack's damage: one shared roll whose die COUNT is either
  // fixed (Radiance of the Dawn's 2d10) or the caller-resolved
  // `feature-attack-dice-count` binding (Breath Weapon's level tier, Sear
  // Undead's WIS-many d8) — the same numbers the action card already resolves.
  // The flat additive (addMod/addLevel) is the caller-resolved `feature-bonus`.
  if (attack !== undefined) {
    const attackBlockers: readonly (readonly [boolean, string, string])[] = [
      [attack.dicePerUpcast !== undefined, "attack-upcast", "spell-slot-context-pending"],
      [attack.resolution !== undefined, "attack-gate", "resolution-override-pending"],
      [
        attack.damageTypeChoicesByLevel !== undefined && scaledTypeChoices === null,
        "attack-damage-type",
        "level-scaled-type-choices-need-session-level",
      ],
    ];
    for (const [present, clauseId, detail] of attackBlockers) {
      if (present) unsupported(clauseId, detail);
    }
    // Die resolution — the FACE always comes from the catalogue; a scaled COUNT
    // arrives as a binding so the program exists independent of the character.
    let roll: {
      readonly count: Readonly<IntegerExpression>;
      readonly dice: ParsedDice;
    } | null = null;
    const boundCount: IntegerExpression = {
      bindingId: TRANSCRIPTION_BINDINGS.attackDiceCount,
      kind: "binding",
    };
    if (attack.diceCount !== undefined && attack.dieFace !== undefined) {
      const die = parseDice(`1${attack.dieFace}`);
      if (die === null) {
        unsupported("attack-dice", `die:${attack.dieFace}`);
      } else {
        roll = { count: boundCount, dice: die };
        clauses.push(clause("attack-dice-count", "automated", "caller-resolved-count"));
      }
    } else if (attack.diceByLevel !== undefined) {
      const tiers = Object.values(attack.diceByLevel).map((value) => parseDice(value));
      const first = tiers[0] ?? null;
      const uniform =
        first !== null &&
        tiers.every(
          (tier) => tier !== null && tier.sides === first.sides && tier.bonus === 0
        );
      // A tier ladder that changes the die FACE (Redirect's 2d6 → 2d12) is
      // only resolvable at the session level; the tier then fixes both the
      // count and the face exactly.
      const sessionTier =
        !uniform && feature.scalingLevel !== undefined
          ? pickLevelTier(attack.diceByLevel, feature.scalingLevel)
          : null;
      const sessionDice = sessionTier !== null ? parseDice(sessionTier) : null;
      if (uniform) {
        roll = { count: boundCount, dice: first };
        clauses.push(
          clause("attack-dice-scaling", "automated", "caller-resolved-level-count")
        );
      } else if (sessionDice !== null) {
        roll = { count: fixed(sessionDice.count), dice: sessionDice };
        clauses.push(clause("attack-dice-scaling", "automated", "session-level-tier"));
      } else {
        unsupported("attack-dice", "level-scaled-die-face-needs-session-level");
      }
    } else if (attack.dice !== undefined) {
      const die = parseDice(attack.dice);
      if (die === null) {
        unsupported("attack-dice", `dice:${attack.dice}`);
      } else {
        roll = { count: fixed(die.count), dice: die };
      }
    } else {
      unsupported("attack-dice", "no-dice-declared");
    }
    // Damage type: a fixed id, a player choice (its input is already up), or
    // the session-derived ancestry element the caller resolved.
    const damageTypes: readonly string[] =
      attack.damageType !== undefined
        ? [attack.damageType]
        : attackTypeChoices !== null && attackTypeChoices.length > 0
          ? attackTypeChoices
          : attack.damageTypeFromBundle !== undefined
            ? feature.attackDamageType !== undefined
              ? [feature.attackDamageType]
              : []
            : [];
    if (
      attack.damageTypeFromBundle !== undefined &&
      feature.attackDamageType === undefined
    ) {
      unsupported("attack-damage-type", "ancestry-damage-type-unresolved");
    } else if (attack.damageTypeFromBundle !== undefined) {
      clauses.push(clause("attack-damage-type", "automated", "ancestry-bundle-resolved"));
    } else if (
      damageTypes.length === 0 &&
      attack.damageTypeChoicesByLevel === undefined
    ) {
      unsupported("attack-damage-type", "no-damage-type-declared");
    }
    if (healOrDamage && action.attackType !== undefined) {
      unsupported("attack-mode", "heal-or-damage-under-attack-roll-pending");
    }
    const hasFlat = attack.addMod !== undefined || attack.addLevel === true;
    if (hasFlat) {
      clauses.push(clause("attack-bonus-term", "automated", "caller-resolved-term"));
    }
    const totalOf = (transform: Readonly<IntegerExpression>): IntegerExpression =>
      hasFlat
        ? {
            kind: "add",
            terms: [
              transform,
              { bindingId: TRANSCRIPTION_BINDINGS.featureBonus, kind: "binding" },
            ],
          }
        : transform;
    const typeGate = (damageType: string): Readonly<Record<string, unknown>> | null =>
      attackTypeChoices !== null && attackTypeChoices.length > 0
        ? {
            choiceId: damageType,
            inputId: "attack-damage-type",
            kind: "answer-choice",
          }
        : null;
    if (roll !== null && damageTypes.length > 0) {
      if (action.attackType !== undefined) {
        // Attack-roll gate: one spell-attack request per target slot against
        // the bound armor class; hits roll the damage, criticals double the
        // DICE (never the flat term); misses self-resolve with no roll.
        const p = (id: string): string => id;
        inputs.push(attackInput(p));
        clauses.push(clause("attack-roll", "physical-input"));
        clauses.push(
          clause(
            "attack-adjudication",
            typeof maxTargets !== "number" || maxTargets === 1 ? "automated" : "table",
            typeof maxTargets !== "number" || maxTargets === 1
              ? "hit-vs-bound-armor-class"
              : "shared-armor-class-binding-override"
          )
        );
        clauses.push(
          clause("attack-range", "spatial", `table-verifies-${action.attackType}`)
        );
        const families = [
          { count: roll.count, inputId: "attack-damage-roll", outcomeIds: ["hit"] },
          {
            count: { factors: [fixed(2), roll.count], kind: "multiply" as const },
            inputId: "attack-damage-roll-crit",
            outcomeIds: ["critical-hit"],
          },
        ] as const;
        for (const family of families) {
          inputs.push(
            diceInput(family.inputId, roll.dice, family.count, {
              inputId: "attack",
              kind: "d20-outcomes",
              outcomeIds: family.outcomeIds,
            })
          );
          for (const damageType of damageTypes) {
            steps.push({
              delivery: "attack",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "per-target-request",
                    inputId: family.inputId,
                    kind: "dice-input",
                    transform: totalOf(INPUT_TOTAL),
                  },
                  damageType,
                  partId: `${family.inputId}-${damageType}`,
                },
              ],
              stepId: `${family.inputId}-${damageType}-apply`,
              target: attackOutcomeSelector([...family.outcomeIds], p),
              traits: [],
              when: typeGate(damageType),
            });
          }
        }
        clauses.push(clause("attack-damage-roll", "physical-input"));
        clauses.push(clause("attack-damage-crit-dice", "automated", "doubled"));
        clauses.push(clause("attack-damage-application", "automated"));
      } else {
        // Save-gated (or automatic) shared roll, exactly like a save spell.
        inputs.push(diceInput("attack-damage-roll", roll.dice, roll.count));
        clauses.push(clause("attack-damage-roll", "physical-input"));
        const saved = action.saveAbility !== undefined;
        const failedTarget = saved
          ? {
              cardinality: "per-request",
              inputId: "saves",
              kind: "d20-outcome",
              outcomeIds: ["failure"],
              quantifier: "any",
            }
          : { inputId: "targets", kind: "input" };
        for (const damageType of damageTypes) {
          steps.push({
            delivery: saved ? "saving-throw" : "automatic",
            kind: "damage",
            parts: [
              {
                amount: sharedDiceAmount("attack-damage-roll", totalOf(INPUT_TOTAL)),
                damageType,
                partId: `attack-damage-${damageType}-full`,
              },
            ],
            stepId: `attack-damage-${damageType}-apply`,
            target: failedTarget,
            traits: [],
            when: allOf(damageMode, typeGate(damageType)),
          });
          if (saved && attack.damageOnSave === "half") {
            steps.push({
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: sharedDiceAmount("attack-damage-roll", {
                    dividend: totalOf(INPUT_TOTAL),
                    divisor: fixed(2),
                    kind: "divide",
                    rounding: "floor",
                  }),
                  damageType,
                  partId: `attack-damage-${damageType}-half`,
                },
              ],
              stepId: `attack-damage-${damageType}-apply-half`,
              target: {
                cardinality: "per-request",
                inputId: "saves",
                kind: "d20-outcome",
                outcomeIds: ["success"],
                quantifier: "any",
              },
              traits: [],
              when: allOf(damageMode, typeGate(damageType)),
            });
          }
        }
        if (saved && attack.damageOnSave === "half") {
          clauses.push(clause("attack-damage-on-save", "automated"));
        } else if (saved) {
          clauses.push(clause("attack-damage-on-save", "automated", "negates"));
        }
        clauses.push(clause("attack-damage-application", "automated"));
      }
      // Heal-or-damage: the SAME rolled total heals the target instead when the
      // player picks the heal mode (Divine Spark).
      if (healOrDamage) {
        steps.push({
          amount: sharedDiceAmount("attack-damage-roll", totalOf(INPUT_TOTAL)),
          kind: "heal",
          stepId: "attack-heal-apply",
          target: { inputId: "targets", kind: "input" },
          when: { choiceId: "heal", inputId: "attack-mode", kind: "answer-choice" },
        });
        clauses.push(clause("attack-heal", "automated", "same-rolled-total"));
      }
    }
  }

  // Healing: a fixed dice formula plus the caller-resolved flat bonus. A
  // `classSpecific:*` sentinel (the monk's Martial Arts die) resolves to one
  // roll of the caller-resolved `classDie`.
  if (action.heal !== undefined) {
    const formula = action.heal.dice;
    const dice =
      formula !== undefined && !formula.startsWith("classSpecific:")
        ? parseDice(formula)
        : formula !== undefined && feature.classDie !== undefined
          ? parseDice(`1${feature.classDie}`)
          : null;
    if (action.heal.diceCount !== undefined || formula === undefined || dice === null) {
      unsupported(
        "healing",
        action.heal.diceCount !== undefined
          ? "variable-die-count-pending"
          : formula?.startsWith("classSpecific:") === true
            ? "session-class-die-unresolved"
            : `dice:${formula ?? "none"}`
      );
    } else {
      inputs.push(diceInput("heal-roll", dice, fixed(dice.count)));
      steps.push({
        amount: sharedDiceAmount(
          "heal-roll",
          action.heal.plus !== undefined
            ? {
                kind: "add",
                terms: [
                  INPUT_TOTAL,
                  { bindingId: TRANSCRIPTION_BINDINGS.featureBonus, kind: "binding" },
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
      if (action.heal.plus !== undefined) {
        clauses.push(clause("healing-bonus", "automated", "caller-resolved-term"));
      }
      clauses.push(clause("healing-application", "automated"));
    }
  }

  // Conditions this action applies (save-gated when the action carries a
  // save; check-gated when it rides the action's own skill check — Hide's
  // Invisible on a passed Stealth check).
  if (
    action.conditionApplication !== undefined &&
    action.conditionApplication.on === "passed-check" &&
    action.skillCheck === undefined
  ) {
    unsupported("condition-gate", "passed-check-without-skill-check");
  } else if (action.conditionApplication !== undefined) {
    const application = action.conditionApplication;
    if (application.max !== undefined && application.max < application.options.length) {
      clauses.push(clause("condition-choice", "table", "table-picks-subset"));
    }
    if (application.on === "passed-check") {
      clauses.push(clause("condition-gate", "automated", "on-passed-check"));
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
        conditionLifetime = { kind: "duration", seconds: fixed(authored.minutes * 60) };
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
          action.saveAbility !== undefined &&
          application.on !== "automatic" &&
          application.on !== "passed-check"
            ? {
                cardinality: "per-request",
                inputId: "saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              }
            : { inputId: "targets", kind: "input" },
        when:
          application.on === "passed-check"
            ? {
                inputId: "check",
                kind: "answer-d20",
                outcomeId: "success",
                quantifier: "any",
              }
            : null,
      });
      clauses.push(clause(`condition-${conditionId}`, "automated"));
    }
  }

  // Plain fixed cures (no pool price attached).
  if (action.conditionRemoval !== undefined) {
    for (const conditionId of action.conditionRemoval.options) {
      if (conditionId === "exhaustion") {
        steps.push({
          amount: fixed(1),
          kind: "exhaustion-change",
          operation: "remove",
          stepId: "cure-exhaustion",
          target: { inputId: "targets", kind: "input" },
          when: null,
        });
        clauses.push(clause("cure-exhaustion", "automated", "one-level-removed"));
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
    if (action.conditionRemoval.max !== undefined) {
      clauses.push(clause("cure-choice", "table", "table-picks-subset"));
    }
  }

  // Temporary hit points: N rolls of one fixed die (or the caller-resolved
  // `classDie` behind a `classSpecific:*` sentinel), plus the caller-resolved
  // flat term; a `fromLevel` unlock below the scaling level stays locked.
  if (
    action.tempHpRoll !== undefined &&
    action.tempHpRoll.fromLevel !== undefined &&
    (feature.scalingLevel === undefined ||
      feature.scalingLevel < action.tempHpRoll.fromLevel)
  ) {
    clauses.push(
      clause("temporary-hit-points-locked", "narrative", "below-unlock-level")
    );
  } else if (action.tempHpRoll !== undefined) {
    const roll = action.tempHpRoll;
    const dice = roll.die.startsWith("classSpecific:")
      ? feature.classDie !== undefined
        ? parseDice(`${roll.rolls}${feature.classDie}`)
        : null
      : parseDice(`${roll.rolls}${roll.die}`);
    if (dice === null) {
      unsupported(
        "temporary-hit-points",
        roll.die.startsWith("classSpecific:")
          ? "session-class-die-unresolved"
          : `die:${roll.die}`
      );
    } else {
      inputs.push(diceInput("temp-hp-roll", dice, fixed(dice.count)));
      clauses.push(clause("temporary-hit-points-roll", "physical-input"));
      const multiplied: Readonly<IntegerExpression> =
        roll.multiplier !== undefined && roll.multiplier !== 1
          ? { factors: [fixed(roll.multiplier), INPUT_TOTAL], kind: "multiply" }
          : INPUT_TOTAL;
      steps.push({
        amount: sharedDiceAmount(
          "temp-hp-roll",
          roll.plus !== undefined
            ? {
                kind: "add",
                terms: [
                  multiplied,
                  { bindingId: TRANSCRIPTION_BINDINGS.featureBonus, kind: "binding" },
                ],
              }
            : multiplied
        ),
        decision: "replace",
        kind: "temporary-hit-points",
        lifetime: { kind: "manual" },
        stepId: "temp-hp-apply",
        target: { inputId: "targets", kind: "input" },
        when: null,
      });
      if (roll.plus !== undefined) {
        clauses.push(
          clause("temporary-hit-points-bonus", "automated", "caller-resolved-term")
        );
      }
      if (roll.multiplier !== undefined && roll.multiplier !== 1) {
        clauses.push(clause("temporary-hit-points-multiplier", "automated"));
      }
      clauses.push(clause("temporary-hit-points", "automated"));
    }
  }

  const blocked = clauses.some((entry) => entry.status === "unsupported");
  if (blocked || steps.length === 0) {
    return {
      actionId,
      clauses:
        steps.length === 0 && !blocked
          ? [...clauses, clause("resolution", "narrative", "no-mechanical-steps")]
          : clauses,
      program: null,
    };
  }
  const program = conformMechanicsProgram({
    id: actionId,
    phases: [{ inputs, phaseId: "resolve", steps, trigger: { kind: "invocation" } }],
    registers: [],
    version: 1,
  });
  if (!program) {
    return {
      actionId,
      clauses: clauses.map((entry) =>
        entry.status === "automated"
          ? clause(entry.clauseId, "unsupported", "program-conformance")
          : entry
      ),
      program: null,
    };
  }
  return { actionId, clauses, program };
}

/**
 * The resolved profile of ONE weapon attack row, read off the SAME sheet seam
 * every combat surface renders (`resolveActions`' weapon summary): the to-hit
 * total, the folded damage formula, the mastery numbers. The transcriber never
 * re-derives weapon math — it transcribes the sheet's already-single-sourced
 * numbers into the canonical attack program.
 */
export interface WeaponAttackProfile {
  /** The stable resolved action-row id ("weapon-longsword"). */
  readonly actionId: string;
  /** The resolved to-hit total (ability + PB + styles + enchant − exhaustion). */
  readonly attackBonus: number;
  /** Lowest natural d20 that crits (Champion 19/18). Default 20. */
  readonly critThreshold?: number;
  /** The resolved one-handed damage formula ("1d8+5"). */
  readonly damage: string;
  readonly damageType: string;
  /** The resolved Graze on-miss damage (= attack ability modifier, ≥ 0). */
  readonly grazeDamage?: number;
  /** The weapon's OWNED mastery token, when the character mastered it. */
  readonly mastery?: string;
  /** The resolved Topple save DC (8 + attack ability modifier + PB). */
  readonly toppleDc?: number;
  /** The resolved TWO-HANDED damage formula for a Versatile weapon. */
  readonly versatileDamage?: string;
}

export interface WeaponAttackTranscription {
  readonly actionId: string;
  readonly clauses: readonly TranscriptionClause[];
  readonly program: Readonly<MechanicsProgram> | null;
}

/**
 * Transcribe one weapon attack: the attack d20 against the table-entered
 * armor-class binding with the weapon's resolved to-hit folded in, hit/crit
 * damage expansion (criticals double the DICE, never the flat modifier), a
 * Versatile grip choice, and the deterministic masteries (Graze's on-miss
 * modifier damage, Topple's opt-in save → Prone). Misses self-resolve — an
 * all-miss attack leaves the damage inputs with zero requests. Every other
 * mastery stays a table fact: its effect lives on the un-modeled enemy's turn
 * (Vex/Sap/Slow) or in the turn economy (Nick/Cleave) or in space (Push).
 */
export function transcribeWeaponAttack(
  profile: Readonly<WeaponAttackProfile>
): WeaponAttackTranscription {
  const actionId = `weapon:${profile.actionId}`;
  const clauses: TranscriptionClause[] = [];
  const inputs: Record<string, unknown>[] = [];
  const steps: Record<string, unknown>[] = [];
  const unsupported = (clauseId: string, detail: string): void => {
    clauses.push(clause(clauseId, "unsupported", detail));
  };
  const p = (id: string): string => id;

  inputs.push({
    eligibility: "creature",
    inputId: "targets",
    kind: "entities",
    maximum: fixed(1),
    minimum: fixed(0),
    multiplicity: "slots",
    when: null,
  });
  clauses.push(clause("targeting", "automated"));

  // Versatile grip: the player picks the grip before rolling; each grip owns
  // its dice family below. Non-versatile weapons skip the question entirely.
  const grips: readonly {
    readonly formula: string;
    readonly gate: Readonly<Record<string, unknown>> | null;
    readonly suffix: string;
  }[] =
    profile.versatileDamage !== undefined
      ? [
          {
            formula: profile.damage,
            gate: {
              choiceId: "one-handed",
              inputId: "grip",
              kind: "answer-choice",
            },
            suffix: "",
          },
          {
            formula: profile.versatileDamage,
            gate: {
              choiceId: "two-handed",
              inputId: "grip",
              kind: "answer-choice",
            },
            suffix: "-two-handed",
          },
        ]
      : [{ formula: profile.damage, gate: null, suffix: "" }];
  if (profile.versatileDamage !== undefined) {
    inputs.push({
      inputId: "grip",
      kind: "choice",
      options: ["one-handed", "two-handed"],
      when: null,
    });
    clauses.push(clause("versatile-grip", "automated", "player-chooses-grip"));
  }

  inputs.push(
    attackInput(p, {
      bonus: fixed(profile.attackBonus),
      criticalThreshold: profile.critThreshold ?? 20,
      sourceId: "weapon-attack-bonus",
      testId: "weapon-attack",
    })
  );
  clauses.push(clause("attack-roll", "physical-input"));
  clauses.push(clause("attack-adjudication", "automated", "hit-vs-bound-armor-class"));
  clauses.push(clause("attack-range", "spatial", "table-verifies-range"));
  if (profile.critThreshold !== undefined && profile.critThreshold < 20) {
    clauses.push(clause("crit-range", "automated", "expanded-threshold"));
  }

  for (const grip of grips) {
    const dice = parseDice(grip.formula);
    if (dice === null) {
      unsupported(`damage${grip.suffix}`, `formula:${grip.formula}`);
      continue;
    }
    const families = [
      {
        count: fixed(dice.count),
        inputId: `damage-roll${grip.suffix}`,
        outcomeIds: ["hit"],
      },
      {
        count: { factors: [fixed(2), fixed(dice.count)], kind: "multiply" as const },
        inputId: `damage-roll${grip.suffix}-crit`,
        outcomeIds: ["critical-hit"],
      },
    ] as const;
    for (const family of families) {
      inputs.push(
        diceInput(
          family.inputId,
          dice,
          family.count,
          { inputId: "attack", kind: "d20-outcomes", outcomeIds: family.outcomeIds },
          grip.gate
        )
      );
      steps.push({
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
            damageType: profile.damageType,
            partId: `${family.inputId}-full`,
          },
        ],
        stepId: `${family.inputId}-apply`,
        target: attackOutcomeSelector([...family.outcomeIds], p),
        traits: ["weapon"],
        when: grip.gate,
      });
    }
  }
  clauses.push(clause("damage-roll", "physical-input"));
  clauses.push(clause("damage-crit-dice", "automated", "doubled"));
  clauses.push(clause("damage-application", "automated"));

  // Masteries. Graze and Topple are the two whose whole effect the kernel can
  // carry (modifier damage on a miss; an opt-in save into the Prone condition
  // whose end stays table-owned). The rest are honest table facts.
  const mastery = profile.mastery?.toLowerCase();
  if (mastery === "graze") {
    if (profile.grazeDamage !== undefined && profile.grazeDamage > 0) {
      steps.push({
        delivery: "attack",
        kind: "damage",
        parts: [
          {
            amount: { expression: fixed(profile.grazeDamage), kind: "integer" },
            damageType: profile.damageType,
            partId: "graze-damage",
          },
        ],
        stepId: "graze-apply",
        target: attackOutcomeSelector(["miss"], p),
        traits: ["weapon"],
        when: null,
      });
      clauses.push(clause("mastery-graze", "automated", "modifier-damage-on-miss"));
    } else {
      clauses.push(clause("mastery-graze", "narrative", "zero-modifier-no-damage"));
    }
  } else if (mastery === "topple") {
    if (profile.toppleDc !== undefined) {
      const opted: Readonly<Record<string, unknown>> = {
        equals: true,
        inputId: "use-topple",
        kind: "answer-boolean",
      };
      inputs.push({
        inputId: "use-topple",
        kind: "boolean",
        when: attackLanded(p),
      });
      inputs.push(
        savingThrowInput("CON", allOf(attackLanded(p), opted), "topple-save", "targets", {
          difficultyClass: fixed(profile.toppleDc),
          testId: "weapon-mastery-save",
        })
      );
      steps.push({
        conditionId: "prone",
        kind: "condition",
        lifetime: { kind: "manual" },
        operation: "apply",
        stepId: "topple-prone",
        target: {
          cardinality: "per-request",
          inputId: "topple-save",
          kind: "d20-outcome",
          outcomeIds: ["failure"],
          quantifier: "any",
        },
        // The landed-attack gate comes FIRST: on an all-miss attack the opt-in
        // boolean is omitted, and `all` must short-circuit to false before the
        // unanswerable `answer-boolean` could leave the step unresolved.
        when: allOf(attackLanded(p), opted),
      });
      clauses.push(clause("mastery-topple-choice", "automated", "opt-in-on-hit"));
      clauses.push(clause("mastery-topple-save", "physical-input"));
      clauses.push(clause("mastery-topple-prone", "automated"));
      clauses.push(clause("mastery-topple-lifetime", "table", "table-owned-end"));
    } else {
      clauses.push(clause("mastery-topple", "table", "unresolved-save-dc"));
    }
  } else if (mastery !== undefined) {
    clauses.push(clause(`mastery-${mastery}`, "table", "table-applies-mastery"));
  }

  const blocked = clauses.some((entry) => entry.status === "unsupported");
  if (blocked || steps.length === 0) {
    return {
      actionId,
      clauses:
        steps.length === 0 && !blocked
          ? [...clauses, clause("resolution", "narrative", "no-mechanical-steps")]
          : clauses,
      program: null,
    };
  }
  const program = conformMechanicsProgram({
    id: actionId,
    phases: [{ inputs, phaseId: "resolve", steps, trigger: { kind: "invocation" } }],
    registers: [],
    version: 1,
  });
  if (!program) {
    return {
      actionId,
      clauses: clauses.map((entry) =>
        entry.status === "automated"
          ? clause(entry.clauseId, "unsupported", "program-conformance")
          : entry
      ),
      program: null,
    };
  }
  return { actionId, clauses, program };
}
