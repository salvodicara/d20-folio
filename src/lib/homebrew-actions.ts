/**
 * homebrew-actions — the ONE validator between a homebrew feature action's authored
 * fields and the engine.
 *
 * A homebrew feature action (`CustomFeature.actions[]`, an `ActionData`) declares its
 * mechanics in the catalogue action's own shape (`SrdActionDef`), so every effect a
 * catalogue feature action can have — damage on a save, a condition, a mark, a push —
 * a player's action can have too. The stored action stays exactly as written (the
 * character and library codecs carry it verbatim), and the engine reads it only
 * through `homebrewActionDef`: each field is conformed against its exact schema
 * below, and a field the schema rejects is left out of play — never repaired, never
 * erased from storage. An unknown field (a newer client's) is preserved and inert.
 *
 * The result is a catalogue `SrdActionDef`, so a homebrew action flows through the
 * SAME path as a catalogue feature action: `translateAction` → Activity, and the
 * resolver's card facts.
 */
import { conformScalar, type Scalar } from "@/lib/scalar";
import { CATALOGUE_EFFECTS_SCHEMA } from "@/lib/catalogue-effects";
import type { EffectRiders, SrdActionDef } from "@/data/types";
import {
  ALL_ACTION_TYPES,
  ALL_CLASS_IDS,
  ALL_CREATURE_TYPES,
  ALL_REACTION_TRIGGERS,
} from "@/data/types";
import {
  arraySchema,
  booleanSchema,
  literalSchema,
  numberSchema,
  objectSchema,
  recordSchema,
  stringSchema,
  unionSchema,
  type ExactSchema,
  type ExactSchemaContext,
} from "@/lib/exact-schema";
import {
  ABILITY,
  conformFields,
  DAMAGE_TYPES,
  literals,
  memoByObject,
  plainObject,
  TRUE,
} from "@/lib/homebrew-conform";
import { ABILITY_CODES } from "@/types/ability";
import { CONDITION_ID_SCHEMA } from "@/types/condition";
import { DAMAGE_TYPE_SCHEMA } from "@/types/damage";
import type { ActionData } from "@/types/character";

const DICE_COUNT = literals(["PB", ...ABILITY_CODES]);
const HEAL_TERM = unionSchema([
  objectSchema({ kind: literalSchema("class-level"), classId: literals(ALL_CLASS_IDS) }),
  objectSchema({ kind: literalSchema("ability-mod"), ability: ABILITY }),
  objectSchema({ kind: literalSchema("flat"), value: numberSchema }),
]);
const OUTCOME_TARGET = objectSchema({ combatantId: stringSchema });

const PHASE = literals(["turn-start", "turn-end"]);

const CONDITION_LIFETIME = unionSchema([
  objectSchema({ kind: literalSchema("source") }),
  objectSchema({ kind: literalSchema("manual") }),
  objectSchema(
    { kind: literalSchema("timed"), minutes: numberSchema, maxRounds: numberSchema },
    {
      byCastLevel: arraySchema(
        objectSchema(
          { minLevel: numberSchema },
          { minutes: numberSchema, maxRounds: numberSchema, indefinite: TRUE }
        )
      ),
    }
  ),
  objectSchema(
    { kind: literalSchema("turn-boundary"), phase: PHASE, turns: numberSchema },
    { anchor: literals(["actor", "target"]) }
  ),
]);

/** An early end of a condition (`ConditionEnd`, data/types). */
const CONDITION_END = unionSchema([
  objectSchema(
    { on: literalSchema("target-damaged") },
    { by: literalSchema("actor-side") }
  ),
  objectSchema(
    {
      on: literalSchema("repeat-save"),
      ability: ABILITY,
      at: literals([
        "target-turn-end",
        "target-turn-start",
        "target-damaged",
        "target-action",
      ]),
    },
    {
      advantage: literalSchema(true),
      when: literalSchema("out-of-actor-sight"),
      track: objectSchema(
        { successes: numberSchema, failures: numberSchema },
        { settlesInto: CONDITION_ID_SCHEMA }
      ),
      onFailedRepeatSave: CATALOGUE_EFFECTS_SCHEMA,
    }
  ),
  objectSchema({ on: literalSchema("actor-incapacitated") }),
]);

/** A condition an action or spell applies, with its lifetime (shared with homebrew spells). */
export const CONDITION_APPLICATION_SCHEMA: ExactSchema = objectSchema(
  {
    options: arraySchema(CONDITION_ID_SCHEMA),
    on: literals(["hit", "failed-save", "automatic", "passed-check"]),
  },
  {
    max: numberSchema,
    lifetime: CONDITION_LIFETIME,
    lifetimes: recordSchema("string", CONDITION_LIFETIME),
    ends: arraySchema(CONDITION_END),
  }
);

const COST_SPEC = unionSchema([
  objectSchema({ kind: literalSchema("spell-slot"), minLevel: numberSchema }),
  objectSchema(
    { kind: literalSchema("tracker"), trackerId: stringSchema },
    { amount: numberSchema, pool: booleanSchema }
  ),
  objectSchema({ kind: literalSchema("free-cast"), sourceId: stringSchema }),
  objectSchema({ kind: literalSchema("mastery") }),
  objectSchema({ kind: literalSchema("signature"), trackerId: stringSchema }),
  objectSchema({ kind: literalSchema("ritual") }),
  objectSchema({ kind: literalSchema("equipment"), key: stringSchema }),
  objectSchema({ kind: literalSchema("none") }),
]);

/**
 * The generic riders (push, Speed loss, Hit Point maximum drain, swallow) an action
 * or a monster attack/save declares — one schema per field, shared by every
 * homebrew validator that carries them.
 */
export const EFFECT_RIDER_SCHEMAS: {
  readonly [Key in keyof Required<EffectRiders>]: ExactSchema;
} = {
  forcedMovement: objectSchema({
    direction: literals(["push", "pull"]),
    feet: numberSchema,
  }),
  speedReduction: objectSchema(
    { feet: numberSchema },
    {
      until: objectSchema({
        phase: literals(["turn-start", "turn-end"]),
        anchor: literals(["actor", "target"]),
      }),
    }
  ),
  hpMaxReduction: objectSchema(
    {},
    { dice: stringSchema, damageType: DAMAGE_TYPE_SCHEMA }
  ),
  swallows: objectSchema(
    {},
    { damage: objectSchema({ dice: stringSchema, damageType: DAMAGE_TYPE_SCHEMA }) }
  ),
};

/** The action fields a homebrew action keeps at its own top level, not as mechanics. */
export type HomebrewActionTopLevelKey = "id" | "type";

/**
 * Every structured catalogue-action field → its exact schema. Typed over every key
 * of `SrdActionDef` but the top-level ones, so a new catalogue field fails the type
 * check until it is classified here. The catalogue corpus conforms to these schemas
 * (`homebrew-action-mechanics.test.ts`), so the two cannot drift.
 */
export const HOMEBREW_ACTION_FIELD_SCHEMAS: {
  readonly [Key in Exclude<
    keyof Required<SrdActionDef>,
    HomebrewActionTopLevelKey
  >]: ExactSchema;
} = {
  economyCategory: literals(["attack", "dash", "disengage", "hide", "utilize"]),
  skillCheck: objectSchema({ dc: numberSchema, skill: stringSchema }),
  effects: CATALOGUE_EFFECTS_SCHEMA,
  grantsNextAttackAdvantage: TRUE,
  locksMovement: TRUE,
  requiresActionThisTurn: stringSchema,
  requiresOutcomeThisTurn: unionSchema([
    objectSchema(
      {
        kind: literalSchema("attack"),
        result: literals(["hit", "miss", "critical-hit", "success"]),
      },
      { actionId: stringSchema, target: OUTCOME_TARGET }
    ),
    objectSchema(
      { kind: literalSchema("save"), result: literals(["success", "failure"]) },
      { actionId: stringSchema, ability: ABILITY, target: OUTCOME_TARGET }
    ),
    objectSchema(
      {
        kind: literalSchema("damage-reduction"),
        result: literals(["negated", "remaining"]),
      },
      { actionId: stringSchema, target: OUTCOME_TARGET }
    ),
  ]),
  requiresActionCategoryThisTurn: literals([
    "attack",
    "dash",
    "disengage",
    "hide",
    "utilize",
  ]),
  maxUsesPerTurn: numberSchema,
  maintainsActiveKey: stringSchema,
  attackSequence: objectSchema(
    { attackId: literalSchema("unarmed-strike"), instances: numberSchema },
    { instancesByLevel: recordSchema("number", numberSchema) }
  ),
  attackType: literals(["melee", "ranged"]),
  trigger: literals(ALL_REACTION_TRIGGERS),
  damageReduction: objectSchema(
    { damageTypesByLevel: recordSchema("number", DAMAGE_TYPES) },
    {
      dice: stringSchema,
      addAbility: ABILITY,
      addLevel: booleanSchema,
      levelMultiplier: numberSchema,
    }
  ),
  heal: objectSchema(
    {},
    {
      dice: stringSchema,
      diceCount: DICE_COUNT,
      dieFace: stringSchema,
      plus: HEAL_TERM,
    }
  ),
  trackerTopUp: objectSchema({
    trackerId: stringSchema,
    upTo: unionSchema([numberSchema, literalSchema("full")]),
  }),
  grantDie: objectSchema({
    kind: literalSchema("bardic-inspiration"),
    die: stringSchema,
  }),
  grantHeroicInspiration: TRUE,
  stabilize: TRUE,
  poolSpendEffect: literalSchema("healing"),
  trackerCost: numberSchema,
  costTracker: stringSchema,
  costTrackerOverride: stringSchema,
  alternateCost: COST_SPEC,
  saveAbility: ABILITY,
  saveDcAbility: ABILITY,
  conditionApplication: CONDITION_APPLICATION_SCHEMA,
  conditionRemoval: objectSchema(
    { options: arraySchema(CONDITION_ID_SCHEMA) },
    { max: numberSchema, fromLevel: numberSchema }
  ),
  targeting: objectSchema(
    { affinity: literals(["ally", "enemy", "self", "any"]) },
    {
      excludeSelf: booleanSchema,
      creatureTypes: arraySchema(literals(ALL_CREATURE_TYPES)),
      maxTargets: unionSchema([numberSchema, DICE_COUNT]),
      maxTargetsPerUpcast: numberSchema,
      sharedAmount: booleanSchema,
      includesDead: literalSchema(true),
    }
  ),
  area: booleanSchema,
  targetMark: objectSchema(
    { scope: literals(["marked", "cursed", "vowed"]) },
    { maxRounds: numberSchema }
  ),
  attack: objectSchema(
    {},
    {
      dice: stringSchema,
      dicePerUpcast: stringSchema,
      diceByLevel: recordSchema("number", stringSchema),
      damageOnSave: literalSchema("half"),
      resolution: literals(["attack", "save", "automatic"]),
      damageType: DAMAGE_TYPE_SCHEMA,
      damageTypeChoices: DAMAGE_TYPES,
      damageTypeChoicesByLevel: recordSchema("number", DAMAGE_TYPES),
      damageTypeFromBundle: stringSchema,
      diceCount: DICE_COUNT,
      dieFace: stringSchema,
      addMod: ABILITY,
      addLevel: booleanSchema,
      mode: literalSchema("heal-or-damage"),
    }
  ),
  requiresBundleOption: objectSchema({ bundleKey: stringSchema, optionId: stringSchema }),
  checkBonus: objectSchema({ dice: stringSchema }, { refundOnFail: booleanSchema }),
  cureConditions: arraySchema(
    objectSchema(
      { condition: CONDITION_ID_SCHEMA, costHp: numberSchema },
      { fromLevel: numberSchema }
    )
  ),
  tempHpRoll: objectSchema(
    { rolls: numberSchema, die: stringSchema },
    { plus: HEAL_TERM, multiplier: numberSchema, fromLevel: numberSchema }
  ),
  revives: objectSchema(
    { hitPoints: unionSchema([numberSchema, literalSchema("all")]) },
    { withinMinutes: numberSchema }
  ),
  hitPointThreshold: objectSchema(
    { max: numberSchema, atOrBelow: literals(["dies", "condition"]) },
    { otherwise: literalSchema("speed-zero") }
  ),
  ...EFFECT_RIDER_SCHEMAS,
};

const CONTEXT: ExactSchemaContext<{ scalar: Scalar }, Record<never, never>> = {
  customs: { scalar: conformScalar },
  refs: {},
};

/** Every structured field of `authored` its schema accepts, in schema order. */
const acceptedFields = (authored: Readonly<Record<string, unknown>>) =>
  conformFields(HOMEBREW_ACTION_FIELD_SCHEMAS, authored, CONTEXT);

const isActionType = (value: unknown): value is SrdActionDef["type"] =>
  (ALL_ACTION_TYPES as ReadonlyArray<unknown>).includes(value);

/** A player's override of a catalogue feature action, as the resolver reads it. */
export type HomebrewActionOverride = Partial<SrdActionDef> &
  Partial<Pick<ActionData, "label" | "description">>;

const conformOverride = memoByObject(
  (raw: Readonly<Record<string, unknown>>) =>
    Object.freeze({
      ...(typeof raw.id === "string" ? { id: raw.id } : {}),
      ...(isActionType(raw.type) ? { type: raw.type } : {}),
      ...(typeof raw.label === "string" ? { label: raw.label } : {}),
      ...(typeof raw.description === "string" ? { description: raw.description } : {}),
      ...acceptedFields(raw),
    }) as HomebrewActionOverride
);

/**
 * A stored `actionOverrides` element (a player's change to a catalogue feature
 * action) as the fields the resolver may merge over the catalogue action: its label
 * and description when they are text, its id and type when valid, and every
 * structured field its schema accepts. Anything else is out of play, so the
 * catalogue's own value keeps playing; the stored override is never touched.
 */
export function homebrewActionOverride(raw: unknown): HomebrewActionOverride {
  return plainObject(raw) ? (conformOverride(raw) ?? {}) : {};
}

const conformActionDef = memoByObject((action: ActionData) => {
  const authored: unknown = action;
  return Object.freeze({
    ...(plainObject(authored) ? acceptedFields(authored) : {}),
    type: action.type,
    ...(typeof action.id === "string" ? { id: action.id } : {}),
  });
});

/**
 * A stored homebrew feature action as a catalogue action — the one shape the action
 * engine reads: its own type and id, and every known field its schema accepts. A
 * field the schema rejects is out of play; the stored action is never touched.
 */
export function homebrewActionDef(action: ActionData): SrdActionDef {
  return conformActionDef(action) as SrdActionDef;
}
