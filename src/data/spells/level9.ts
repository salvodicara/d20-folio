import type { CombatEffectPhase, CombatEffectPredicate, SrdSpellData } from "../types";
import type { DamageType } from "@/types/damage";
import { timedSpellDuration } from "./duration";

const PRISMATIC_WALL_DAMAGE_LAYERS = [
  ["red", "fire"],
  ["orange", "acid"],
  ["yellow", "lightning"],
  ["green", "poison"],
  ["blue", "cold"],
] as const satisfies ReadonlyArray<readonly [string, DamageType]>;

const PRISMATIC_WALL_LAYER_ORDER = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "indigo",
  "violet",
] as const;

function prismaticWallCrossDamagePhase(
  color: string,
  damageType: DamageType
): CombatEffectPhase {
  return {
    id: `cross-${color}`,
    trigger: { kind: "manual", eventId: `cross-active-${color}-layer` },
    targeting: { affinity: "any", maxTargets: 1 },
    steps: [
      {
        id: `${color}-layer-damage`,
        kind: "damage",
        scope: "target",
        subject: "target",
        amount: { kind: "input", inputId: `${color}-damage-roll` },
        damageType: { kind: "fixed", damageType },
        damageSource: "spell",
        gate: {
          gateId: `${color}-cross-save`,
          pass: "failure",
          otherwise: "half",
        },
        when: { kind: "layer", layerId: color, state: "active" },
        packetId: `${color}-layer`,
      },
    ],
  };
}

function prismaticWallDestroyPredicate(
  color: (typeof PRISMATIC_WALL_LAYER_ORDER)[number],
  qualification?: CombatEffectPredicate
): CombatEffectPredicate {
  const index = PRISMATIC_WALL_LAYER_ORDER.indexOf(color);
  return {
    kind: "all",
    predicates: [
      ...PRISMATIC_WALL_LAYER_ORDER.slice(0, index).map((layerId) => ({
        kind: "layer" as const,
        layerId,
        state: "destroyed" as const,
      })),
      { kind: "layer", layerId: color, state: "active" },
      ...(qualification ? [qualification] : []),
    ],
  };
}

export const SRD_SPELLS_LEVEL9: SrdSpellData[] = [
  {
    id: "astral-projection",
    level: 9,
    school: "necromancy",
    classes: ["cleric", "warlock", "wizard"],
    castingTime: "1 hour",
    ritual: false,
    components: {
      v: true,
      s: true,
      m: true,
      costGp: 1000,
      consumed: true,
    },
    concentration: false,
    source: "SRD",
  },
  {
    id: "foresight",
    level: 9,
    school: "divination",
    classes: ["bard", "druid", "warlock", "wizard"],
    castingTime: "1 minute",
    ritual: false,
    components: {
      v: true,
      s: true,
      m: true,
    },
    concentration: false,
    targeting: { affinity: "ally", maxTargets: 1 },
    grants: [
      // PROSE-SWEPT 2026-06-10 — Advantage on D20 Tests for the duration
      // (attackers' Disadvantage is an enemy-roll effect — descriptive).
      {
        type: "while-active",
        activeKey: "spell-foresight",
        duration: timedSpellDuration(480),
        recipient: "selected",
        grants: [
          { type: "advantage-on", rollType: "check", vs: "foresight" },
          { type: "advantage-on", rollType: "save", vs: "foresight" },
          { type: "advantage-on", rollType: "attack", vs: "foresight", scope: "all" },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "gate",
    level: 9,
    school: "conjuration",
    classes: ["cleric", "sorcerer", "warlock", "wizard"],
    castingTime: "action",
    ritual: false,
    components: {
      v: true,
      s: true,
      m: true,
      costGp: 5000,
    },
    concentration: true,
    source: "SRD",
  },
  {
    id: "imprisonment",
    level: 9,
    school: "abjuration",
    classes: ["warlock", "wizard"],
    castingTime: "1 minute",
    ritual: false,
    components: {
      v: true,
      s: true,
      m: true,
      costGp: 500,
    },
    concentration: false,
    saveAbility: "WIS",
    source: "SRD",
  },
  {
    id: "mass-heal",
    level: 9,
    school: "abjuration",
    classes: ["cleric"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: true, m: false },
    concentration: false,
    instantaneous: true,
    healDice: "700",
    effectTag: "heal",
    conditionRemoval: { options: ["blinded", "deafened"] },
    targeting: { affinity: "ally" },
    healingPool: 700,
    source: "SRD",
  },
  {
    id: "meteor-swarm",
    level: 9,
    school: "evocation",
    classes: ["sorcerer", "wizard"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: true, m: false },
    concentration: false,
    instantaneous: true,
    // 2024 (spell:meteor-swarm): 20d6 Fire + 20d6 Bludgeoning on a DEX save (40d6
    // total). No upcast scaling (a 9th-level spell).
    damageType: "fire",
    damageDice: "20d6",
    secondaryDamage: { dice: "20d6", damageType: "bludgeoning" },
    saveAbility: "DEX",
    area: true,
    damageOnSave: "half",
    source: "SRD",
  },
  {
    id: "power-word-kill",
    level: 9,
    school: "enchantment",
    classes: ["bard", "sorcerer", "warlock", "wizard"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: false, m: false },
    concentration: false,
    instantaneous: true,
    source: "SRD",
  },
  {
    id: "prismatic-wall",
    // The canonical-runtime authored program (supersedes `effectProgram`): the
    // cast raises the ten-minute wall; seven layer registers hold each sheet's
    // state (0 active, 1 destroyed). Table-declared pulses adjudicate the wall:
    // "proximity" (CON save or blinded for a minute), "cross-<color>" per
    // layer (DEX save; red-blue deal 12d6 of their element half-on-save,
    // indigo restrains, violet blinds), "violet-fate" (the next-turn WIS save
    // — sight returns, failure is a plane transfer), and "destroy-<color>"
    // events that mark a layer destroyed in strict front-to-back order. The
    // destroy qualifications (damage thresholds, daylight, dispel) and the
    // indigo petrification save-series stay table-adjudicated — the latter
    // needs per-target counters the program vocabulary does not have.
    mechanicsProgram: {
      id: "spell:prismatic-wall",
      phases: [
        {
          inputs: [
            {
              inputId: "slot",
              kind: "resource",
              term: {
                amount: { kind: "fixed", value: 1 },
                selector: {
                  kind: "spell-slot",
                  level: { kind: "minimum", value: 9 },
                  owner: "caster",
                  pool: "either",
                },
              },
              when: null,
            },
          ],
          phaseId: "resolve",
          steps: [
            {
              fact: { key: "prismatic-wall", kind: "active-key" },
              kind: "standing",
              lifetime: { kind: "duration", seconds: { kind: "fixed", value: 600 } },
              operation: "start",
              stepId: "raise-wall",
              target: { kind: "role", role: "caster" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "proximity-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 1 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              expansion: {
                bind: "actor",
                inputId: "proximity-targets",
                kind: "entities",
              },
              inputId: "proximity-saves",
              kind: "d20",
              payments: [],
              request: {
                ability: "CON",
                actor: "target",
                difficultyClass: { bindingId: "spell-save-dc", kind: "binding" },
                enteredModifiers: [],
                kind: "saving-throw",
                modifiers: [],
                resolution: { kind: "rolled" },
                rollRules: {
                  advantageSourceIds: [],
                  disadvantageSourceIds: [],
                  extraD20SourceIds: [],
                  faceFloors: [],
                  replacements: [],
                  substitutions: [],
                  totalFloors: [],
                },
                target: "caster",
                testId: "spell-save",
              },
              when: null,
            },
          ],
          phaseId: "proximity",
          steps: [
            {
              conditionId: "blinded",
              kind: "condition",
              lifetime: { kind: "duration", seconds: { kind: "fixed", value: 60 } },
              operation: "apply",
              stepId: "proximity-blinded",
              target: {
                cardinality: "per-request",
                inputId: "proximity-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              when: null,
            },
          ],
          trigger: { eventId: "proximity", kind: "root-pulse" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "cross-red-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 1 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              expansion: {
                bind: "actor",
                inputId: "cross-red-targets",
                kind: "entities",
              },
              inputId: "cross-red-saves",
              kind: "d20",
              payments: [],
              request: {
                ability: "DEX",
                actor: "target",
                difficultyClass: { bindingId: "spell-save-dc", kind: "binding" },
                enteredModifiers: [],
                kind: "saving-throw",
                modifiers: [],
                resolution: { kind: "rolled" },
                rollRules: {
                  advantageSourceIds: [],
                  disadvantageSourceIds: [],
                  extraD20SourceIds: [],
                  faceFloors: [],
                  replacements: [],
                  substitutions: [],
                  totalFloors: [],
                },
                target: "caster",
                testId: "spell-save",
              },
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "caster", kind: "single" },
              formula: {
                terms: [
                  {
                    count: { kind: "fixed", value: 12 },
                    kind: "dice",
                    operation: "add",
                    sides: 6,
                    termId: "cross-red-roll-die",
                  },
                ],
              },
              inputId: "cross-red-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "cross-red",
          steps: [
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "cross-red-roll",
                    kind: "dice-input",
                    transform: { bindingId: "input-total", kind: "binding" },
                  },
                  damageType: "fire",
                  partId: "red-full",
                },
              ],
              stepId: "cross-red-damage",
              target: {
                cardinality: "per-request",
                inputId: "cross-red-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: {
                comparison: "eq",
                kind: "register",
                registerId: "layer-red",
                value: { kind: "fixed", value: 0 },
              },
            },
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "cross-red-roll",
                    kind: "dice-input",
                    transform: {
                      dividend: { bindingId: "input-total", kind: "binding" },
                      divisor: { kind: "fixed", value: 2 },
                      kind: "divide",
                      rounding: "floor",
                    },
                  },
                  damageType: "fire",
                  partId: "red-half",
                },
              ],
              stepId: "cross-red-half",
              target: {
                cardinality: "per-request",
                inputId: "cross-red-saves",
                kind: "d20-outcome",
                outcomeIds: ["success"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: {
                comparison: "eq",
                kind: "register",
                registerId: "layer-red",
                value: { kind: "fixed", value: 0 },
              },
            },
          ],
          trigger: { eventId: "cross-red", kind: "root-pulse" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "cross-orange-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 1 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              expansion: {
                bind: "actor",
                inputId: "cross-orange-targets",
                kind: "entities",
              },
              inputId: "cross-orange-saves",
              kind: "d20",
              payments: [],
              request: {
                ability: "DEX",
                actor: "target",
                difficultyClass: { bindingId: "spell-save-dc", kind: "binding" },
                enteredModifiers: [],
                kind: "saving-throw",
                modifiers: [],
                resolution: { kind: "rolled" },
                rollRules: {
                  advantageSourceIds: [],
                  disadvantageSourceIds: [],
                  extraD20SourceIds: [],
                  faceFloors: [],
                  replacements: [],
                  substitutions: [],
                  totalFloors: [],
                },
                target: "caster",
                testId: "spell-save",
              },
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "caster", kind: "single" },
              formula: {
                terms: [
                  {
                    count: { kind: "fixed", value: 12 },
                    kind: "dice",
                    operation: "add",
                    sides: 6,
                    termId: "cross-orange-roll-die",
                  },
                ],
              },
              inputId: "cross-orange-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "cross-orange",
          steps: [
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "cross-orange-roll",
                    kind: "dice-input",
                    transform: { bindingId: "input-total", kind: "binding" },
                  },
                  damageType: "acid",
                  partId: "orange-full",
                },
              ],
              stepId: "cross-orange-damage",
              target: {
                cardinality: "per-request",
                inputId: "cross-orange-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: {
                comparison: "eq",
                kind: "register",
                registerId: "layer-orange",
                value: { kind: "fixed", value: 0 },
              },
            },
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "cross-orange-roll",
                    kind: "dice-input",
                    transform: {
                      dividend: { bindingId: "input-total", kind: "binding" },
                      divisor: { kind: "fixed", value: 2 },
                      kind: "divide",
                      rounding: "floor",
                    },
                  },
                  damageType: "acid",
                  partId: "orange-half",
                },
              ],
              stepId: "cross-orange-half",
              target: {
                cardinality: "per-request",
                inputId: "cross-orange-saves",
                kind: "d20-outcome",
                outcomeIds: ["success"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: {
                comparison: "eq",
                kind: "register",
                registerId: "layer-orange",
                value: { kind: "fixed", value: 0 },
              },
            },
          ],
          trigger: { eventId: "cross-orange", kind: "root-pulse" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "cross-yellow-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 1 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              expansion: {
                bind: "actor",
                inputId: "cross-yellow-targets",
                kind: "entities",
              },
              inputId: "cross-yellow-saves",
              kind: "d20",
              payments: [],
              request: {
                ability: "DEX",
                actor: "target",
                difficultyClass: { bindingId: "spell-save-dc", kind: "binding" },
                enteredModifiers: [],
                kind: "saving-throw",
                modifiers: [],
                resolution: { kind: "rolled" },
                rollRules: {
                  advantageSourceIds: [],
                  disadvantageSourceIds: [],
                  extraD20SourceIds: [],
                  faceFloors: [],
                  replacements: [],
                  substitutions: [],
                  totalFloors: [],
                },
                target: "caster",
                testId: "spell-save",
              },
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "caster", kind: "single" },
              formula: {
                terms: [
                  {
                    count: { kind: "fixed", value: 12 },
                    kind: "dice",
                    operation: "add",
                    sides: 6,
                    termId: "cross-yellow-roll-die",
                  },
                ],
              },
              inputId: "cross-yellow-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "cross-yellow",
          steps: [
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "cross-yellow-roll",
                    kind: "dice-input",
                    transform: { bindingId: "input-total", kind: "binding" },
                  },
                  damageType: "lightning",
                  partId: "yellow-full",
                },
              ],
              stepId: "cross-yellow-damage",
              target: {
                cardinality: "per-request",
                inputId: "cross-yellow-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: {
                comparison: "eq",
                kind: "register",
                registerId: "layer-yellow",
                value: { kind: "fixed", value: 0 },
              },
            },
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "cross-yellow-roll",
                    kind: "dice-input",
                    transform: {
                      dividend: { bindingId: "input-total", kind: "binding" },
                      divisor: { kind: "fixed", value: 2 },
                      kind: "divide",
                      rounding: "floor",
                    },
                  },
                  damageType: "lightning",
                  partId: "yellow-half",
                },
              ],
              stepId: "cross-yellow-half",
              target: {
                cardinality: "per-request",
                inputId: "cross-yellow-saves",
                kind: "d20-outcome",
                outcomeIds: ["success"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: {
                comparison: "eq",
                kind: "register",
                registerId: "layer-yellow",
                value: { kind: "fixed", value: 0 },
              },
            },
          ],
          trigger: { eventId: "cross-yellow", kind: "root-pulse" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "cross-green-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 1 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              expansion: {
                bind: "actor",
                inputId: "cross-green-targets",
                kind: "entities",
              },
              inputId: "cross-green-saves",
              kind: "d20",
              payments: [],
              request: {
                ability: "DEX",
                actor: "target",
                difficultyClass: { bindingId: "spell-save-dc", kind: "binding" },
                enteredModifiers: [],
                kind: "saving-throw",
                modifiers: [],
                resolution: { kind: "rolled" },
                rollRules: {
                  advantageSourceIds: [],
                  disadvantageSourceIds: [],
                  extraD20SourceIds: [],
                  faceFloors: [],
                  replacements: [],
                  substitutions: [],
                  totalFloors: [],
                },
                target: "caster",
                testId: "spell-save",
              },
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "caster", kind: "single" },
              formula: {
                terms: [
                  {
                    count: { kind: "fixed", value: 12 },
                    kind: "dice",
                    operation: "add",
                    sides: 6,
                    termId: "cross-green-roll-die",
                  },
                ],
              },
              inputId: "cross-green-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "cross-green",
          steps: [
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "cross-green-roll",
                    kind: "dice-input",
                    transform: { bindingId: "input-total", kind: "binding" },
                  },
                  damageType: "poison",
                  partId: "green-full",
                },
              ],
              stepId: "cross-green-damage",
              target: {
                cardinality: "per-request",
                inputId: "cross-green-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: {
                comparison: "eq",
                kind: "register",
                registerId: "layer-green",
                value: { kind: "fixed", value: 0 },
              },
            },
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "cross-green-roll",
                    kind: "dice-input",
                    transform: {
                      dividend: { bindingId: "input-total", kind: "binding" },
                      divisor: { kind: "fixed", value: 2 },
                      kind: "divide",
                      rounding: "floor",
                    },
                  },
                  damageType: "poison",
                  partId: "green-half",
                },
              ],
              stepId: "cross-green-half",
              target: {
                cardinality: "per-request",
                inputId: "cross-green-saves",
                kind: "d20-outcome",
                outcomeIds: ["success"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: {
                comparison: "eq",
                kind: "register",
                registerId: "layer-green",
                value: { kind: "fixed", value: 0 },
              },
            },
          ],
          trigger: { eventId: "cross-green", kind: "root-pulse" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "cross-blue-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 1 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              expansion: {
                bind: "actor",
                inputId: "cross-blue-targets",
                kind: "entities",
              },
              inputId: "cross-blue-saves",
              kind: "d20",
              payments: [],
              request: {
                ability: "DEX",
                actor: "target",
                difficultyClass: { bindingId: "spell-save-dc", kind: "binding" },
                enteredModifiers: [],
                kind: "saving-throw",
                modifiers: [],
                resolution: { kind: "rolled" },
                rollRules: {
                  advantageSourceIds: [],
                  disadvantageSourceIds: [],
                  extraD20SourceIds: [],
                  faceFloors: [],
                  replacements: [],
                  substitutions: [],
                  totalFloors: [],
                },
                target: "caster",
                testId: "spell-save",
              },
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "caster", kind: "single" },
              formula: {
                terms: [
                  {
                    count: { kind: "fixed", value: 12 },
                    kind: "dice",
                    operation: "add",
                    sides: 6,
                    termId: "cross-blue-roll-die",
                  },
                ],
              },
              inputId: "cross-blue-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "cross-blue",
          steps: [
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "cross-blue-roll",
                    kind: "dice-input",
                    transform: { bindingId: "input-total", kind: "binding" },
                  },
                  damageType: "cold",
                  partId: "blue-full",
                },
              ],
              stepId: "cross-blue-damage",
              target: {
                cardinality: "per-request",
                inputId: "cross-blue-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: {
                comparison: "eq",
                kind: "register",
                registerId: "layer-blue",
                value: { kind: "fixed", value: 0 },
              },
            },
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "cross-blue-roll",
                    kind: "dice-input",
                    transform: {
                      dividend: { bindingId: "input-total", kind: "binding" },
                      divisor: { kind: "fixed", value: 2 },
                      kind: "divide",
                      rounding: "floor",
                    },
                  },
                  damageType: "cold",
                  partId: "blue-half",
                },
              ],
              stepId: "cross-blue-half",
              target: {
                cardinality: "per-request",
                inputId: "cross-blue-saves",
                kind: "d20-outcome",
                outcomeIds: ["success"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: {
                comparison: "eq",
                kind: "register",
                registerId: "layer-blue",
                value: { kind: "fixed", value: 0 },
              },
            },
          ],
          trigger: { eventId: "cross-blue", kind: "root-pulse" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "cross-indigo-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 1 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              expansion: {
                bind: "actor",
                inputId: "cross-indigo-targets",
                kind: "entities",
              },
              inputId: "cross-indigo-saves",
              kind: "d20",
              payments: [],
              request: {
                ability: "DEX",
                actor: "target",
                difficultyClass: { bindingId: "spell-save-dc", kind: "binding" },
                enteredModifiers: [],
                kind: "saving-throw",
                modifiers: [],
                resolution: { kind: "rolled" },
                rollRules: {
                  advantageSourceIds: [],
                  disadvantageSourceIds: [],
                  extraD20SourceIds: [],
                  faceFloors: [],
                  replacements: [],
                  substitutions: [],
                  totalFloors: [],
                },
                target: "caster",
                testId: "spell-save",
              },
              when: null,
            },
          ],
          phaseId: "cross-indigo",
          steps: [
            {
              conditionId: "restrained",
              kind: "condition",
              lifetime: { kind: "manual" },
              operation: "apply",
              stepId: "indigo-restrained",
              target: {
                cardinality: "per-request",
                inputId: "cross-indigo-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              when: {
                comparison: "eq",
                kind: "register",
                registerId: "layer-indigo",
                value: { kind: "fixed", value: 0 },
              },
            },
          ],
          trigger: { eventId: "cross-indigo", kind: "root-pulse" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "cross-violet-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 1 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              expansion: {
                bind: "actor",
                inputId: "cross-violet-targets",
                kind: "entities",
              },
              inputId: "cross-violet-saves",
              kind: "d20",
              payments: [],
              request: {
                ability: "DEX",
                actor: "target",
                difficultyClass: { bindingId: "spell-save-dc", kind: "binding" },
                enteredModifiers: [],
                kind: "saving-throw",
                modifiers: [],
                resolution: { kind: "rolled" },
                rollRules: {
                  advantageSourceIds: [],
                  disadvantageSourceIds: [],
                  extraD20SourceIds: [],
                  faceFloors: [],
                  replacements: [],
                  substitutions: [],
                  totalFloors: [],
                },
                target: "caster",
                testId: "spell-save",
              },
              when: null,
            },
          ],
          phaseId: "cross-violet",
          steps: [
            {
              conditionId: "blinded",
              kind: "condition",
              lifetime: { kind: "manual" },
              operation: "apply",
              stepId: "violet-blinded",
              target: {
                cardinality: "per-request",
                inputId: "cross-violet-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              when: {
                comparison: "eq",
                kind: "register",
                registerId: "layer-violet",
                value: { kind: "fixed", value: 0 },
              },
            },
          ],
          trigger: { eventId: "cross-violet", kind: "root-pulse" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "fate-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 1 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              expansion: { bind: "actor", inputId: "fate-targets", kind: "entities" },
              inputId: "fate-saves",
              kind: "d20",
              payments: [],
              request: {
                ability: "WIS",
                actor: "target",
                difficultyClass: { bindingId: "spell-save-dc", kind: "binding" },
                enteredModifiers: [],
                kind: "saving-throw",
                modifiers: [],
                resolution: { kind: "rolled" },
                rollRules: {
                  advantageSourceIds: [],
                  disadvantageSourceIds: [],
                  extraD20SourceIds: [],
                  faceFloors: [],
                  replacements: [],
                  substitutions: [],
                  totalFloors: [],
                },
                target: "caster",
                testId: "spell-save",
              },
              when: null,
            },
          ],
          phaseId: "violet-fate",
          steps: [
            {
              conditionId: "blinded",
              kind: "condition",
              lifetime: null,
              operation: "remove",
              stepId: "fate-sight",
              target: { inputId: "fate-targets", kind: "input" },
              when: null,
            },
            {
              instructionId: "prismatic-wall-violet-transfer",
              kind: "manual-relocation",
              mode: "plane-transfer",
              stepId: "fate-banishment",
              target: {
                cardinality: "per-request",
                inputId: "fate-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              when: null,
            },
          ],
          trigger: { eventId: "violet-fate", kind: "root-pulse" },
        },
        {
          inputs: [],
          phaseId: "destroy-red",
          steps: [
            {
              kind: "register",
              operation: { kind: "set-integer", value: { kind: "fixed", value: 1 } },
              registerId: "layer-red",
              stepId: "destroy-red-layer",
              when: {
                comparison: "eq",
                kind: "register",
                registerId: "layer-red",
                value: { kind: "fixed", value: 0 },
              },
            },
          ],
          trigger: { eventId: "destroy-red", kind: "root-pulse" },
        },
        {
          inputs: [],
          phaseId: "destroy-orange",
          steps: [
            {
              kind: "register",
              operation: { kind: "set-integer", value: { kind: "fixed", value: 1 } },
              registerId: "layer-orange",
              stepId: "destroy-orange-layer",
              when: {
                kind: "all",
                predicates: [
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-red",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-orange",
                    value: { kind: "fixed", value: 0 },
                  },
                ],
              },
            },
          ],
          trigger: { eventId: "destroy-orange", kind: "root-pulse" },
        },
        {
          inputs: [],
          phaseId: "destroy-yellow",
          steps: [
            {
              kind: "register",
              operation: { kind: "set-integer", value: { kind: "fixed", value: 1 } },
              registerId: "layer-yellow",
              stepId: "destroy-yellow-layer",
              when: {
                kind: "all",
                predicates: [
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-red",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-orange",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-yellow",
                    value: { kind: "fixed", value: 0 },
                  },
                ],
              },
            },
          ],
          trigger: { eventId: "destroy-yellow", kind: "root-pulse" },
        },
        {
          inputs: [],
          phaseId: "destroy-green",
          steps: [
            {
              kind: "register",
              operation: { kind: "set-integer", value: { kind: "fixed", value: 1 } },
              registerId: "layer-green",
              stepId: "destroy-green-layer",
              when: {
                kind: "all",
                predicates: [
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-red",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-orange",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-yellow",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-green",
                    value: { kind: "fixed", value: 0 },
                  },
                ],
              },
            },
          ],
          trigger: { eventId: "destroy-green", kind: "root-pulse" },
        },
        {
          inputs: [],
          phaseId: "destroy-blue",
          steps: [
            {
              kind: "register",
              operation: { kind: "set-integer", value: { kind: "fixed", value: 1 } },
              registerId: "layer-blue",
              stepId: "destroy-blue-layer",
              when: {
                kind: "all",
                predicates: [
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-red",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-orange",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-yellow",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-green",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-blue",
                    value: { kind: "fixed", value: 0 },
                  },
                ],
              },
            },
          ],
          trigger: { eventId: "destroy-blue", kind: "root-pulse" },
        },
        {
          inputs: [],
          phaseId: "destroy-indigo",
          steps: [
            {
              kind: "register",
              operation: { kind: "set-integer", value: { kind: "fixed", value: 1 } },
              registerId: "layer-indigo",
              stepId: "destroy-indigo-layer",
              when: {
                kind: "all",
                predicates: [
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-red",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-orange",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-yellow",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-green",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-blue",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-indigo",
                    value: { kind: "fixed", value: 0 },
                  },
                ],
              },
            },
          ],
          trigger: { eventId: "destroy-indigo", kind: "root-pulse" },
        },
        {
          inputs: [],
          phaseId: "destroy-violet",
          steps: [
            {
              kind: "register",
              operation: { kind: "set-integer", value: { kind: "fixed", value: 1 } },
              registerId: "layer-violet",
              stepId: "destroy-violet-layer",
              when: {
                kind: "all",
                predicates: [
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-red",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-orange",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-yellow",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-green",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-blue",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-indigo",
                    value: { kind: "fixed", value: 1 },
                  },
                  {
                    comparison: "eq",
                    kind: "register",
                    registerId: "layer-violet",
                    value: { kind: "fixed", value: 0 },
                  },
                ],
              },
            },
          ],
          trigger: { eventId: "destroy-violet", kind: "root-pulse" },
        },
      ],
      registers: [
        { initial: 0, registerId: "layer-blue" },
        { initial: 0, registerId: "layer-green" },
        { initial: 0, registerId: "layer-indigo" },
        { initial: 0, registerId: "layer-orange" },
        { initial: 0, registerId: "layer-red" },
        { initial: 0, registerId: "layer-violet" },
        { initial: 0, registerId: "layer-yellow" },
      ],
      version: 1,
    },
    effectProgram: {
      version: 1,
      id: "spell.prismatic-wall",
      layers: PRISMATIC_WALL_LAYER_ORDER.map((id) => ({
        id,
        scope: "program" as const,
        initial: "active" as const,
      })),
      counters: [
        { id: "indigo-successes", initial: 0, scope: "target" },
        { id: "indigo-failures", initial: 0, scope: "target" },
      ],
      gates: [
        {
          id: "proximity-blindness-save",
          kind: "save",
          scope: "target",
          ability: "CON",
          dc: { kind: "binding", binding: "caster-spell-save-dc" },
        },
        ...PRISMATIC_WALL_LAYER_ORDER.map((color) => ({
          id: `${color}-cross-save`,
          kind: "save" as const,
          scope: "target" as const,
          ability: "DEX" as const,
          dc: {
            kind: "binding" as const,
            binding: "caster-spell-save-dc" as const,
          },
        })),
        {
          id: "indigo-constitution-save",
          kind: "save",
          scope: "target",
          ability: "CON",
          dc: { kind: "binding", binding: "caster-spell-save-dc" },
        },
        {
          id: "violet-wisdom-save",
          kind: "save",
          scope: "target",
          ability: "WIS",
          dc: { kind: "binding", binding: "caster-spell-save-dc" },
        },
      ],
      inputs: PRISMATIC_WALL_DAMAGE_LAYERS.map(([color]) => ({
        id: `${color}-damage-roll`,
        kind: "roll" as const,
        scope: "target" as const,
        roll: { count: 12, sides: 6 },
      })),
      phases: [
        {
          id: "raise-wall",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "start-wall",
              kind: "standing",
              scope: "program",
              subject: "source",
              operation: "start",
              effectId: "prismatic-wall",
              lifetime: { kind: "elapsed", amount: 10, unit: "minute" },
            },
          ],
        },
        {
          id: "proximity-blindness",
          trigger: {
            kind: "manual",
            eventId: "starts-turn-within-twenty-feet-of-prismatic-wall",
          },
          targeting: { affinity: "any", maxTargets: 1 },
          steps: [
            {
              id: "proximity-blinded",
              kind: "condition",
              scope: "target",
              subject: "target",
              operation: "apply",
              condition: "blinded",
              lifetime: { kind: "elapsed", amount: 1, unit: "minute" },
              when: {
                kind: "gate",
                gateId: "proximity-blindness-save",
                result: "failure",
              },
            },
          ],
        },
        ...PRISMATIC_WALL_DAMAGE_LAYERS.map(([color, damageType]) =>
          prismaticWallCrossDamagePhase(color, damageType)
        ),
        {
          id: "cross-indigo",
          trigger: { kind: "manual", eventId: "cross-active-indigo-layer" },
          targeting: { affinity: "any", maxTargets: 1 },
          steps: [
            {
              id: "indigo-restrained",
              kind: "condition",
              scope: "target",
              subject: "target",
              operation: "apply",
              condition: "restrained",
              lifetime: { kind: "manual" },
              when: {
                kind: "all",
                predicates: [
                  { kind: "layer", layerId: "indigo", state: "active" },
                  {
                    kind: "gate",
                    gateId: "indigo-cross-save",
                    result: "failure",
                  },
                ],
              },
            },
            {
              id: "start-indigo-series",
              kind: "standing",
              scope: "target",
              subject: "target",
              operation: "start",
              effectId: "prismatic-wall-indigo",
              lifetime: { kind: "manual" },
              when: {
                kind: "all",
                predicates: [
                  { kind: "layer", layerId: "indigo", state: "active" },
                  {
                    kind: "gate",
                    gateId: "indigo-cross-save",
                    result: "failure",
                  },
                ],
              },
            },
          ],
        },
        {
          id: "indigo-save-series",
          trigger: { kind: "turn-end", subject: "target", everyTurns: 1 },
          targeting: { affinity: "any", maxTargets: 1 },
          steps: [
            {
              id: "indigo-save-success",
              kind: "counter",
              scope: "target",
              counterId: "indigo-successes",
              operation: "add",
              amount: { kind: "fixed", value: 1 },
              when: {
                kind: "gate",
                gateId: "indigo-constitution-save",
                result: "success",
              },
            },
            {
              id: "indigo-save-failure",
              kind: "counter",
              scope: "target",
              counterId: "indigo-failures",
              operation: "add",
              amount: { kind: "fixed", value: 1 },
              when: {
                kind: "gate",
                gateId: "indigo-constitution-save",
                result: "failure",
              },
            },
            {
              id: "indigo-end-restrained",
              kind: "condition",
              scope: "target",
              subject: "target",
              operation: "remove",
              condition: "restrained",
              when: {
                kind: "any",
                predicates: [
                  {
                    kind: "counter",
                    counterId: "indigo-successes",
                    comparison: "gte",
                    value: 3,
                  },
                  {
                    kind: "counter",
                    counterId: "indigo-failures",
                    comparison: "gte",
                    value: 3,
                  },
                ],
              },
            },
            {
              id: "indigo-petrified",
              kind: "condition",
              scope: "target",
              subject: "target",
              operation: "apply",
              condition: "petrified",
              lifetime: { kind: "manual" },
              when: {
                kind: "counter",
                counterId: "indigo-failures",
                comparison: "gte",
                value: 3,
              },
            },
            {
              id: "indigo-end-standing",
              kind: "standing",
              scope: "target",
              subject: "target",
              operation: "end",
              effectId: "prismatic-wall-indigo",
              when: {
                kind: "any",
                predicates: [
                  {
                    kind: "counter",
                    counterId: "indigo-successes",
                    comparison: "gte",
                    value: 3,
                  },
                  {
                    kind: "counter",
                    counterId: "indigo-failures",
                    comparison: "gte",
                    value: 3,
                  },
                ],
              },
            },
          ],
          repeat: { id: "indigo-series-limit", maxOccurrences: 5 },
        },
        {
          id: "cross-violet",
          trigger: { kind: "manual", eventId: "cross-active-violet-layer" },
          targeting: { affinity: "any", maxTargets: 1 },
          steps: [
            {
              id: "violet-blinded",
              kind: "condition",
              scope: "target",
              subject: "target",
              operation: "apply",
              condition: "blinded",
              lifetime: { kind: "manual" },
              when: {
                kind: "all",
                predicates: [
                  { kind: "layer", layerId: "violet", state: "active" },
                  {
                    kind: "gate",
                    gateId: "violet-cross-save",
                    result: "failure",
                  },
                ],
              },
            },
            {
              id: "start-violet-save",
              kind: "standing",
              scope: "target",
              subject: "target",
              operation: "start",
              effectId: "prismatic-wall-violet",
              lifetime: { kind: "manual" },
              when: {
                kind: "all",
                predicates: [
                  { kind: "layer", layerId: "violet", state: "active" },
                  {
                    kind: "gate",
                    gateId: "violet-cross-save",
                    result: "failure",
                  },
                ],
              },
            },
          ],
        },
        {
          id: "violet-save",
          trigger: { kind: "turn-start", subject: "source", offsetTurns: 1 },
          targeting: { affinity: "any", maxTargets: 1 },
          steps: [
            {
              id: "violet-end-blinded",
              kind: "condition",
              scope: "target",
              subject: "target",
              operation: "remove",
              condition: "blinded",
            },
            {
              id: "violet-plane-transfer",
              kind: "relocation-event",
              scope: "target",
              subject: "target",
              mode: "plane-transfer",
              destination: { kind: "manual" },
              when: {
                kind: "gate",
                gateId: "violet-wisdom-save",
                result: "failure",
              },
            },
            {
              id: "violet-end-standing",
              kind: "standing",
              scope: "target",
              subject: "target",
              operation: "end",
              effectId: "prismatic-wall-violet",
            },
          ],
        },
        ...PRISMATIC_WALL_LAYER_ORDER.map((color) => {
          const qualification: CombatEffectPredicate | undefined =
            color === "red"
              ? {
                  kind: "all",
                  predicates: [
                    {
                      kind: "trigger-fact",
                      fact: "triggering-damage-type",
                      equals: "cold",
                    },
                    {
                      kind: "trigger-fact",
                      fact: "triggering-damage",
                      comparison: "gte",
                      value: 25,
                    },
                  ],
                }
              : color === "yellow"
                ? {
                    kind: "all",
                    predicates: [
                      {
                        kind: "trigger-fact",
                        fact: "triggering-damage-type",
                        equals: "force",
                      },
                      {
                        kind: "trigger-fact",
                        fact: "triggering-damage",
                        comparison: "gte",
                        value: 60,
                      },
                    ],
                  }
                : color === "blue"
                  ? {
                      kind: "all",
                      predicates: [
                        {
                          kind: "trigger-fact",
                          fact: "triggering-damage-type",
                          equals: "fire",
                        },
                        {
                          kind: "trigger-fact",
                          fact: "triggering-damage",
                          comparison: "gte",
                          value: 25,
                        },
                      ],
                    }
                  : undefined;
          return {
            id: `destroy-${color}`,
            trigger: {
              kind: "manual" as const,
              eventId:
                color === "orange"
                  ? "strong-wind-against-orange-layer"
                  : color === "green"
                    ? "passwall-or-equal-portal-against-green-layer"
                    : color === "indigo"
                      ? "daylight-bright-light-against-indigo-layer"
                      : color === "violet"
                        ? "dispel-magic-against-violet-layer"
                        : `qualifying-damage-against-${color}-layer`,
            },
            steps: [
              {
                id: `destroy-${color}-layer`,
                kind: "layer" as const,
                scope: "program" as const,
                layerId: color,
                operation: "destroy" as const,
                when: prismaticWallDestroyPredicate(color, qualification),
              },
            ],
          };
        }),
      ],
    },
    level: 9,
    school: "abjuration",
    classes: ["bard", "wizard"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: true, m: false },
    concentration: false,
    // Five damaging layers (red/orange/yellow/green/blue); indigo & violet are
    // condition layers. Passing through deals each layer's type — simultaneous.
    damageTypes: ["fire", "acid", "lightning", "poison", "cold"],
    damageDice: "12d6",
    saveAbility: "CON",
    source: "SRD",
  },
  {
    id: "shapechange",
    level: 9,
    school: "transmutation",
    classes: ["druid", "wizard"],
    castingTime: "action",
    ritual: false,
    components: {
      v: true,
      s: true,
      m: true,
      costGp: 1500,
    },
    concentration: true,
    source: "SRD",
  },
  {
    id: "time-stop",
    level: 9,
    school: "transmutation",
    classes: ["sorcerer", "wizard"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: false, m: false },
    concentration: false,
    instantaneous: true,
    source: "SRD",
  },
  {
    id: "true-resurrection",
    level: 9,
    school: "necromancy",
    classes: ["cleric", "druid"],
    castingTime: "1 hour",
    ritual: false,
    components: {
      v: true,
      s: true,
      m: true,
      costGp: 25000,
      consumed: true,
    },
    concentration: false,
    instantaneous: true,
    source: "SRD",
  },
  {
    id: "storm-of-vengeance",
    // The canonical-runtime authored program (supersedes `effectProgram`): the
    // cast is the arrival round — CON save or 2d6 thunder and deafened while
    // the storm lasts — under concentration; the later rounds are
    // table-declared pulses on the sourced legacy cadence: "acid-rain" (4d6
    // acid, round 2), "lightning-bolts" (up to six targets, DEX save, 10d6
    // half-on-save, round 3), "hailstones" (2d6 bludgeoning, round 4), and
    // "freezing-rain" (1d6 cold, rounds 5-10, once per round).
    mechanicsProgram: {
      id: "spell:storm-of-vengeance",
      phases: [
        {
          inputs: [
            {
              inputId: "slot",
              kind: "resource",
              term: {
                amount: { kind: "fixed", value: 1 },
                selector: {
                  kind: "spell-slot",
                  level: { kind: "minimum", value: 9 },
                  owner: "caster",
                  pool: "either",
                },
              },
              when: null,
            },
            {
              eligibility: "creature",
              inputId: "storm-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 20 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              expansion: { bind: "actor", inputId: "storm-targets", kind: "entities" },
              inputId: "storm-saves",
              kind: "d20",
              payments: [],
              request: {
                ability: "CON",
                actor: "target",
                difficultyClass: { bindingId: "spell-save-dc", kind: "binding" },
                enteredModifiers: [],
                kind: "saving-throw",
                modifiers: [],
                resolution: { kind: "rolled" },
                rollRules: {
                  advantageSourceIds: [],
                  disadvantageSourceIds: [],
                  extraD20SourceIds: [],
                  faceFloors: [],
                  replacements: [],
                  substitutions: [],
                  totalFloors: [],
                },
                target: "caster",
                testId: "spell-save",
              },
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "caster", kind: "single" },
              formula: {
                terms: [
                  {
                    count: { kind: "fixed", value: 2 },
                    kind: "dice",
                    operation: "add",
                    sides: 6,
                    termId: "storm-roll-die",
                  },
                ],
              },
              inputId: "storm-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "resolve",
          steps: [
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "storm-roll",
                    kind: "dice-input",
                    transform: { bindingId: "input-total", kind: "binding" },
                  },
                  damageType: "thunder",
                  partId: "storm-thunder",
                },
              ],
              stepId: "storm-damage",
              target: {
                cardinality: "per-request",
                inputId: "storm-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: null,
            },
            {
              conditionId: "deafened",
              kind: "condition",
              lifetime: { kind: "source-end" },
              operation: "apply",
              stepId: "storm-deafened",
              target: {
                cardinality: "per-request",
                inputId: "storm-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              when: null,
            },
            {
              kind: "concentration",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "hold-concentration",
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "acid-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 20 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "caster", kind: "single" },
              formula: {
                terms: [
                  {
                    count: { kind: "fixed", value: 4 },
                    kind: "dice",
                    operation: "add",
                    sides: 6,
                    termId: "acid-roll-die",
                  },
                ],
              },
              inputId: "acid-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "acid-rain",
          steps: [
            {
              delivery: "automatic",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "acid-roll",
                    kind: "dice-input",
                    transform: { bindingId: "input-total", kind: "binding" },
                  },
                  damageType: "acid",
                  partId: "acid-rain-acid",
                },
              ],
              stepId: "acid-rain-damage",
              target: { inputId: "acid-targets", kind: "input" },
              traits: ["spell"],
              when: null,
            },
          ],
          trigger: { eventId: "acid-rain", kind: "root-pulse" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "bolt-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 6 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              expansion: { bind: "actor", inputId: "bolt-targets", kind: "entities" },
              inputId: "bolt-saves",
              kind: "d20",
              payments: [],
              request: {
                ability: "DEX",
                actor: "target",
                difficultyClass: { bindingId: "spell-save-dc", kind: "binding" },
                enteredModifiers: [],
                kind: "saving-throw",
                modifiers: [],
                resolution: { kind: "rolled" },
                rollRules: {
                  advantageSourceIds: [],
                  disadvantageSourceIds: [],
                  extraD20SourceIds: [],
                  faceFloors: [],
                  replacements: [],
                  substitutions: [],
                  totalFloors: [],
                },
                target: "caster",
                testId: "spell-save",
              },
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "caster", kind: "single" },
              formula: {
                terms: [
                  {
                    count: { kind: "fixed", value: 10 },
                    kind: "dice",
                    operation: "add",
                    sides: 6,
                    termId: "bolt-roll-die",
                  },
                ],
              },
              inputId: "bolt-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "lightning",
          steps: [
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "bolt-roll",
                    kind: "dice-input",
                    transform: { bindingId: "input-total", kind: "binding" },
                  },
                  damageType: "lightning",
                  partId: "bolt-lightning",
                },
              ],
              stepId: "bolt-damage",
              target: {
                cardinality: "per-request",
                inputId: "bolt-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: null,
            },
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "bolt-roll",
                    kind: "dice-input",
                    transform: {
                      dividend: { bindingId: "input-total", kind: "binding" },
                      divisor: { kind: "fixed", value: 2 },
                      kind: "divide",
                      rounding: "floor",
                    },
                  },
                  damageType: "lightning",
                  partId: "bolt-lightning-half",
                },
              ],
              stepId: "bolt-damage-half",
              target: {
                cardinality: "per-request",
                inputId: "bolt-saves",
                kind: "d20-outcome",
                outcomeIds: ["success"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: null,
            },
          ],
          trigger: { eventId: "lightning-bolts", kind: "root-pulse" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "hail-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 20 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "caster", kind: "single" },
              formula: {
                terms: [
                  {
                    count: { kind: "fixed", value: 2 },
                    kind: "dice",
                    operation: "add",
                    sides: 6,
                    termId: "hail-roll-die",
                  },
                ],
              },
              inputId: "hail-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "hail",
          steps: [
            {
              delivery: "automatic",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "hail-roll",
                    kind: "dice-input",
                    transform: { bindingId: "input-total", kind: "binding" },
                  },
                  damageType: "bludgeoning",
                  partId: "hail-bludgeoning",
                },
              ],
              stepId: "hail-damage",
              target: { inputId: "hail-targets", kind: "input" },
              traits: ["spell"],
              when: null,
            },
          ],
          trigger: { eventId: "hailstones", kind: "root-pulse" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "rain-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 20 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "caster", kind: "single" },
              formula: {
                terms: [
                  {
                    count: { kind: "fixed", value: 1 },
                    kind: "dice",
                    operation: "add",
                    sides: 6,
                    termId: "rain-roll-die",
                  },
                ],
              },
              inputId: "rain-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "freezing-rain",
          steps: [
            {
              delivery: "automatic",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "rain-roll",
                    kind: "dice-input",
                    transform: { bindingId: "input-total", kind: "binding" },
                  },
                  damageType: "cold",
                  partId: "rain-cold",
                },
              ],
              stepId: "rain-damage",
              target: { inputId: "rain-targets", kind: "input" },
              traits: ["spell"],
              when: null,
            },
          ],
          trigger: { eventId: "freezing-rain", kind: "root-pulse" },
        },
        {
          inputs: [],
          phaseId: "release",
          steps: [{ kind: "end-program", stepId: "release-spell", when: null }],
          trigger: { kind: "source-end" },
        },
      ],
      registers: [],
      version: 1,
    },
    effectProgram: {
      version: 1,
      id: "spell.storm-of-vengeance",
      gates: [
        {
          id: "arrival-save",
          kind: "save",
          scope: "target",
          ability: "CON",
        },
        {
          id: "lightning-save",
          kind: "save",
          scope: "target",
          ability: "DEX",
        },
      ],
      inputs: [
        {
          id: "arrival-roll",
          kind: "roll",
          scope: "program",
          roll: { count: 2, sides: 6 },
        },
        {
          id: "acid-roll",
          kind: "roll",
          scope: "program",
          roll: { count: 4, sides: 6 },
        },
        {
          id: "lightning-roll",
          kind: "roll",
          scope: "program",
          roll: { count: 10, sides: 6 },
        },
        {
          id: "hail-roll",
          kind: "roll",
          scope: "program",
          roll: { count: 2, sides: 6 },
        },
        {
          id: "cold-roll",
          kind: "roll",
          scope: "program",
          roll: { count: 1, sides: 6 },
        },
      ],
      phases: [
        {
          id: "arrival",
          trigger: { kind: "resolve" },
          targeting: { affinity: "any" },
          steps: [
            {
              id: "arrival-damage",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "input", inputId: "arrival-roll" },
              damageType: { kind: "fixed", damageType: "thunder" },
              damageSource: "spell",
              gate: {
                gateId: "arrival-save",
                pass: "failure",
                otherwise: "skip",
              },
              when: {
                kind: "gate",
                gateId: "arrival-save",
                result: "failure",
              },
              packetId: "arrival",
            },
            {
              id: "arrival-deafened",
              kind: "condition",
              scope: "target",
              subject: "target",
              operation: "apply",
              condition: "deafened",
              lifetime: { kind: "source-end" },
              when: {
                kind: "gate",
                gateId: "arrival-save",
                result: "failure",
              },
            },
          ],
        },
        {
          id: "turn-two",
          trigger: {
            kind: "turn-start",
            subject: "source",
            offsetTurns: 1,
          },
          targeting: { affinity: "any" },
          steps: [
            {
              id: "acid-rain",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "input", inputId: "acid-roll" },
              damageType: { kind: "fixed", damageType: "acid" },
              damageSource: "spell",
              packetId: "acid-rain",
            },
          ],
        },
        {
          id: "turn-three",
          trigger: {
            kind: "turn-start",
            subject: "source",
            offsetTurns: 2,
          },
          targeting: { affinity: "any", maxTargets: 6 },
          steps: [
            {
              id: "lightning-bolts",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "input", inputId: "lightning-roll" },
              damageType: { kind: "fixed", damageType: "lightning" },
              damageSource: "spell",
              gate: {
                gateId: "lightning-save",
                pass: "failure",
                otherwise: "half",
              },
              packetId: "lightning-bolt",
            },
          ],
        },
        {
          id: "turn-four",
          trigger: {
            kind: "turn-start",
            subject: "source",
            offsetTurns: 3,
          },
          targeting: { affinity: "any" },
          steps: [
            {
              id: "hailstones",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "input", inputId: "hail-roll" },
              damageType: { kind: "fixed", damageType: "bludgeoning" },
              damageSource: "spell",
              packetId: "hailstones",
            },
          ],
        },
        {
          id: "late-storm-area",
          trigger: {
            kind: "turn-start",
            subject: "source",
            offsetTurns: 4,
          },
          steps: [
            {
              id: "start-late-storm-area",
              kind: "standing",
              scope: "program",
              subject: "source",
              operation: "start",
              effectId: "storm-of-vengeance-late-area",
              lifetime: { kind: "source-end" },
            },
          ],
        },
        {
          id: "turns-five-through-ten",
          trigger: {
            kind: "turn-start",
            subject: "source",
            offsetTurns: 4,
            everyTurns: 1,
          },
          targeting: { affinity: "any" },
          steps: [
            {
              id: "freezing-rain",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "input", inputId: "cold-roll" },
              damageType: { kind: "fixed", damageType: "cold" },
              damageSource: "spell",
              packetId: "freezing-rain",
            },
          ],
          repeat: { id: "late-storm-duration", maxOccurrences: 6 },
        },
      ],
    },
    level: 9,
    school: "conjuration",
    classes: ["druid"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: true, m: false },
    concentration: true,
    // The storm cycles through five elements over its rounds: Thunder (round 1),
    // Acid (2), Lightning (3), Bludgeoning (4), Cold (5-10) — all simultaneous.
    damageTypes: ["thunder", "acid", "lightning", "bludgeoning", "cold"],
    damageDice: "2d6",
    saveAbility: "CON",
    source: "SRD",
  },
  {
    id: "true-polymorph",
    level: 9,
    school: "transmutation",
    classes: ["bard", "warlock", "wizard"],
    castingTime: "action",
    ritual: false,
    components: {
      v: true,
      s: true,
      m: true,
    },
    concentration: true,
    saveAbility: "WIS",
    source: "SRD",
  },
  {
    id: "weird",
    // The canonical-runtime authored program (supersedes `effectProgram`): the
    // cast forces every caught creature's WIS save against 10d10 psychic (half
    // on a success) and leaves the failures frightened while concentration
    // holds; each frightened creature's turn-end is a table-declared "pulse" —
    // repeat WIS save, 5d10 psychic on a failure, and a success frees that
    // creature (the spell keeps running for the rest).
    mechanicsProgram: {
      id: "spell:weird",
      phases: [
        {
          inputs: [
            {
              inputId: "slot",
              kind: "resource",
              term: {
                amount: { kind: "fixed", value: 1 },
                selector: {
                  kind: "spell-slot",
                  level: { kind: "minimum", value: 9 },
                  owner: "caster",
                  pool: "either",
                },
              },
              when: null,
            },
            {
              eligibility: "creature",
              inputId: "terror-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 20 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              expansion: { bind: "actor", inputId: "terror-targets", kind: "entities" },
              inputId: "terror-saves",
              kind: "d20",
              payments: [],
              request: {
                ability: "WIS",
                actor: "target",
                difficultyClass: { bindingId: "spell-save-dc", kind: "binding" },
                enteredModifiers: [],
                kind: "saving-throw",
                modifiers: [],
                resolution: { kind: "rolled" },
                rollRules: {
                  advantageSourceIds: [],
                  disadvantageSourceIds: [],
                  extraD20SourceIds: [],
                  faceFloors: [],
                  replacements: [],
                  substitutions: [],
                  totalFloors: [],
                },
                target: "caster",
                testId: "spell-save",
              },
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "caster", kind: "single" },
              formula: {
                terms: [
                  {
                    count: { kind: "fixed", value: 10 },
                    kind: "dice",
                    operation: "add",
                    sides: 10,
                    termId: "terror-roll-die",
                  },
                ],
              },
              inputId: "terror-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "resolve",
          steps: [
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "terror-roll",
                    kind: "dice-input",
                    transform: { bindingId: "input-total", kind: "binding" },
                  },
                  damageType: "psychic",
                  partId: "terror-psychic",
                },
              ],
              stepId: "terror-damage",
              target: {
                cardinality: "per-request",
                inputId: "terror-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: null,
            },
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "terror-roll",
                    kind: "dice-input",
                    transform: {
                      dividend: { bindingId: "input-total", kind: "binding" },
                      divisor: { kind: "fixed", value: 2 },
                      kind: "divide",
                      rounding: "floor",
                    },
                  },
                  damageType: "psychic",
                  partId: "terror-psychic-half",
                },
              ],
              stepId: "terror-damage-half",
              target: {
                cardinality: "per-request",
                inputId: "terror-saves",
                kind: "d20-outcome",
                outcomeIds: ["success"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: null,
            },
            {
              conditionId: "frightened",
              kind: "condition",
              lifetime: { kind: "source-end" },
              operation: "apply",
              stepId: "terror-frightened",
              target: {
                cardinality: "per-request",
                inputId: "terror-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              when: null,
            },
            {
              kind: "concentration",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "hold-concentration",
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "pulse-targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 1 },
              minimum: { kind: "fixed", value: 0 },
              multiplicity: "slots",
              when: null,
            },
            {
              expansion: { bind: "actor", inputId: "pulse-targets", kind: "entities" },
              inputId: "pulse-saves",
              kind: "d20",
              payments: [],
              request: {
                ability: "WIS",
                actor: "target",
                difficultyClass: { bindingId: "spell-save-dc", kind: "binding" },
                enteredModifiers: [],
                kind: "saving-throw",
                modifiers: [],
                resolution: { kind: "rolled" },
                rollRules: {
                  advantageSourceIds: [],
                  disadvantageSourceIds: [],
                  extraD20SourceIds: [],
                  faceFloors: [],
                  replacements: [],
                  substitutions: [],
                  totalFloors: [],
                },
                target: "caster",
                testId: "spell-save",
              },
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "caster", kind: "single" },
              formula: {
                terms: [
                  {
                    count: { kind: "fixed", value: 5 },
                    kind: "dice",
                    operation: "add",
                    sides: 10,
                    termId: "pulse-roll-die",
                  },
                ],
              },
              inputId: "pulse-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: {
                inputId: "pulse-saves",
                kind: "answer-d20",
                outcomeId: "failure",
                quantifier: "any",
              },
            },
          ],
          phaseId: "pulse",
          steps: [
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "pulse-roll",
                    kind: "dice-input",
                    transform: { bindingId: "input-total", kind: "binding" },
                  },
                  damageType: "psychic",
                  partId: "pulse-psychic",
                },
              ],
              stepId: "pulse-damage",
              target: {
                cardinality: "per-request",
                inputId: "pulse-saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
              traits: ["spell"],
              when: null,
            },
            {
              conditionId: "frightened",
              kind: "condition",
              lifetime: null,
              operation: "remove",
              stepId: "pulse-calms",
              target: {
                cardinality: "per-request",
                inputId: "pulse-saves",
                kind: "d20-outcome",
                outcomeIds: ["success"],
                quantifier: "any",
              },
              when: null,
            },
          ],
          trigger: { eventId: "pulse", kind: "root-pulse" },
        },
        {
          inputs: [],
          phaseId: "release",
          steps: [{ kind: "end-program", stepId: "release-spell", when: null }],
          trigger: { kind: "source-end" },
        },
      ],
      registers: [],
      version: 1,
    },
    effectProgram: {
      version: 1,
      id: "spell.weird",
      gates: [
        {
          id: "initial-save",
          kind: "save",
          scope: "target",
          ability: "WIS",
        },
        {
          id: "repeat-save",
          kind: "save",
          scope: "target",
          ability: "WIS",
        },
      ],
      inputs: [
        {
          id: "initial-roll",
          kind: "roll",
          scope: "program",
          roll: { count: 10, sides: 10 },
        },
        {
          id: "repeat-roll",
          kind: "roll",
          scope: "target",
          roll: { count: 5, sides: 10 },
          when: {
            kind: "gate",
            gateId: "repeat-save",
            result: "failure",
          },
        },
      ],
      phases: [
        {
          id: "terror",
          trigger: { kind: "resolve" },
          targeting: { affinity: "enemy" },
          steps: [
            {
              id: "initial-damage",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "input", inputId: "initial-roll" },
              damageType: { kind: "fixed", damageType: "psychic" },
              damageSource: "spell",
              gate: {
                gateId: "initial-save",
                pass: "failure",
                otherwise: "half",
              },
              packetId: "terror",
            },
            {
              id: "apply-frightened",
              kind: "condition",
              scope: "target",
              subject: "target",
              operation: "apply",
              condition: "frightened",
              lifetime: { kind: "source-end" },
              when: {
                kind: "gate",
                gateId: "initial-save",
                result: "failure",
              },
            },
            {
              id: "start-personal-terror",
              kind: "standing",
              scope: "target",
              subject: "target",
              operation: "start",
              effectId: "weird-terror",
              lifetime: { kind: "source-end" },
              when: {
                kind: "gate",
                gateId: "initial-save",
                result: "failure",
              },
            },
          ],
        },
        {
          id: "terror-turn",
          trigger: { kind: "turn-end", subject: "target" },
          targeting: { affinity: "enemy", maxTargets: 1 },
          steps: [
            {
              id: "repeat-damage",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "input", inputId: "repeat-roll" },
              damageType: { kind: "fixed", damageType: "psychic" },
              damageSource: "spell",
              gate: {
                gateId: "repeat-save",
                pass: "failure",
                otherwise: "skip",
              },
              when: {
                kind: "gate",
                gateId: "repeat-save",
                result: "failure",
              },
              packetId: "terror",
            },
            {
              id: "success-clears-frightened",
              kind: "condition",
              scope: "target",
              subject: "target",
              operation: "remove",
              condition: "frightened",
              when: {
                kind: "gate",
                gateId: "repeat-save",
                result: "success",
              },
            },
            {
              id: "success-ends-personal-terror",
              kind: "standing",
              scope: "target",
              subject: "target",
              operation: "end",
              effectId: "weird-terror",
              when: {
                kind: "gate",
                gateId: "repeat-save",
                result: "success",
              },
            },
          ],
          repeat: { id: "terror-duration", maxOccurrences: 10 },
        },
      ],
    },
    level: 9,
    school: "illusion",
    classes: ["warlock", "wizard"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: true, m: false },
    concentration: true,
    damageType: "psychic",
    damageDice: "10d10",
    saveAbility: "WIS",
    conditionApplication: {
      options: ["frightened"],
      on: "failed-save",
      lifetime: { kind: "source" },
    },
    area: true,
    grants: [
      {
        type: "while-active",
        activeKey: "spell-weird",
        duration: timedSpellDuration(1),
        grants: [],
      },
    ],
    damageOnSave: "half",
    source: "SRD",
  },
  {
    id: "wish",
    level: 9,
    school: "conjuration",
    classes: ["sorcerer", "wizard"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: false, m: false },
    concentration: false,
    instantaneous: true,
    source: "SRD",
  },
  {
    id: "power-word-heal",
    level: 9,
    school: "enchantment",
    classes: ["bard", "cleric"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: false, m: false },
    concentration: false,
    instantaneous: true,
    effectTag: "heal",
    healingMode: "full",
    conditionRemoval: {
      options: ["charmed", "frightened", "paralyzed", "poisoned", "stunned"],
    },
    source: "SRD",
  },
];
