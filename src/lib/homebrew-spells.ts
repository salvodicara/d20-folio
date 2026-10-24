/**
 * homebrew-spells — the ONE validator between a homebrew spell's authored mechanics
 * and the engine.
 *
 * A homebrew spell (`CustomSpell.mechanics`) declares its mechanics in the catalogue
 * spell's own shape (`HomebrewSpellMechanics`, derived from `SrdSpellData`), so every
 * structured fact a catalogue spell can carry a player's spell can carry too. The
 * stored object stays exactly as written (the character and library codecs carry it
 * verbatim), and the engine reads it only through `homebrewSpellData`: each field is
 * conformed against its exact schema below, and a field the schema rejects is left
 * out of play — never repaired, never erased from storage. Grants are conformed one
 * by one, like a homebrew feature's (`homebrewFeatureGrants`). An unknown field (a
 * newer client's) is preserved and inert.
 *
 * The result is a catalogue-shaped `SrdSpellData`, so a homebrew spell flows through
 * the SAME path as a catalogue spell: `translateSpell` → Activity, the combat action
 * resolver, the cast-level scaling, the grant sources its while-active states light,
 * and the Concentration it holds (its duration on the clock and the states it ends).
 */
import { getSpellById } from "@/data/spells";
import type { HomebrewSpellMechanics, SrdSpellData, SpellDuration } from "@/data/types";
import {
  ALL_ACTION_TYPES,
  ALL_CREATURE_TYPES,
  ALL_REACTION_TRIGGERS,
} from "@/data/types";
import {
  arraySchema,
  booleanSchema,
  conformExact,
  customSchema,
  literalSchema,
  numberSchema,
  objectSchema,
  recordSchema,
  stringSchema,
  unionSchema,
  type ExactSchema,
  type ExactSchemaContext,
} from "@/lib/exact-schema";
import { conformGrant, type Grant } from "@/lib/grants";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import { classifySpellCastingTime } from "@/lib/cast-options";
import { CUSTOM_CONCENTRATION_PREFIX } from "@/lib/concentration";
import { ABILITY_CODES } from "@/types/ability";
import { CONDITION_ID_SCHEMA } from "@/types/condition";
import { DAMAGE_TYPE_SCHEMA } from "@/types/damage";
import type { CustomSpell, SrdSpellRef } from "@/types/character";

// ─── The exact shape of every structured catalogue-spell field ───────────────

const literals = (values: ReadonlyArray<string>): ExactSchema =>
  unionSchema(values.map((value) => literalSchema(value)));

const ABILITY = literals(ABILITY_CODES);
const CREATURE_TYPES = arraySchema(literals(ALL_CREATURE_TYPES));
const DAMAGE_TYPES = arraySchema(DAMAGE_TYPE_SCHEMA);
const GATE = literals(["attack", "save", "automatic"]);
const HALF = literalSchema("half");
const TRUE = literalSchema(true);
const PHASE = literals(["turn-start", "turn-end"]);

const SPELL_DURATION = unionSchema([
  objectSchema({
    kind: literals([
      "instantaneous",
      "until-dispelled",
      "until-dispelled-or-triggered",
      "special",
    ]),
  }),
  objectSchema({
    kind: literals(["rounds", "minutes", "hours", "days"]),
    amount: numberSchema,
  }),
]);

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

const CONDITION_APPLICATION = objectSchema(
  {
    options: arraySchema(CONDITION_ID_SCHEMA),
    on: literals(["hit", "failed-save", "automatic", "passed-check"]),
  },
  {
    max: numberSchema,
    lifetime: CONDITION_LIFETIME,
    lifetimes: recordSchema("string", CONDITION_LIFETIME),
  }
);

/** A plain JSON object whose inner shape is the catalogue's own nested dialect
 *  (an action, a stat block): checked to be an object here, read by the same
 *  translator the catalogue's goes through. */
const OBJECT = customSchema<"object", Readonly<Record<string, unknown>>>("object");
const GRANT = customSchema<"grant", Grant>("grant");
const MECHANICS_PROGRAM = customSchema<
  "mechanics-program",
  Readonly<Record<string, unknown>>
>("mechanics-program");
/** A follow-up action: a plain object naming a known action economy. */
const ACTION_DEF = customSchema<"action-def", Readonly<Record<string, unknown>>>(
  "action-def"
);

function plainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

const CONTEXT: ExactSchemaContext<
  {
    object: Readonly<Record<string, unknown>>;
    grant: Grant;
    "mechanics-program": Readonly<Record<string, unknown>>;
    "action-def": Readonly<Record<string, unknown>>;
  },
  Record<never, never>
> = {
  customs: {
    object: (value) => (plainObject(value) ? value : null),
    grant: (value) => conformGrant(value),
    "mechanics-program": (value) => conformMechanicsProgram(value),
    "action-def": (value) =>
      plainObject(value) &&
      (ALL_ACTION_TYPES as ReadonlyArray<unknown>).includes(value.type)
        ? value
        : null,
  },
  refs: {},
};

/**
 * Every structured catalogue-spell field → its exact schema. Typed over every key
 * of `HomebrewSpellMechanics` (itself derived from `SrdSpellData`), so a new
 * catalogue field fails the type check until it is classified here. The catalogue
 * corpus conforms to these schemas (`homebrew-spell-mechanics.test.ts`), so the two
 * cannot drift. `grants` is listed for completeness; it is conformed per element.
 */
export const HOMEBREW_SPELL_FIELD_SCHEMAS: {
  readonly [Key in keyof Required<HomebrewSpellMechanics>]: ExactSchema;
} = {
  conditionRemoval: objectSchema(
    { options: arraySchema(CONDITION_ID_SCHEMA) },
    { max: numberSchema }
  ),
  conditionApplication: CONDITION_APPLICATION,
  targeting: objectSchema(
    { affinity: literals(["ally", "enemy", "self", "any"]) },
    {
      excludeSelf: booleanSchema,
      creatureTypes: CREATURE_TYPES,
      maxTargets: numberSchema,
      maxTargetsPerUpcast: numberSchema,
      sharedAmount: booleanSchema,
    }
  ),
  healingMode: literals(["full", "consumable"]),
  consumableItem: objectSchema({
    itemId: stringSchema,
    count: numberSchema,
    lifetimeHours: numberSchema,
  }),
  healingPool: numberSchema,
  tempHpPool: numberSchema,
  selfHealingFromDamage: objectSchema({ fraction: numberSchema }),
  stabilizes: TRUE,
  revives: objectSchema({
    hitPoints: unionSchema([numberSchema, literalSchema("all")]),
  }),
  hitPointThreshold: objectSchema(
    { max: numberSchema, atOrBelow: literals(["dies", "condition"]) },
    { otherwise: literalSchema("speed-zero") }
  ),
  mechanicsProgram: MECHANICS_PROGRAM,
  reactionTrigger: literals(ALL_REACTION_TRIGGERS),
  ritual: booleanSchema,
  duration: SPELL_DURATION,
  instantaneous: booleanSchema,
  damageType: DAMAGE_TYPE_SCHEMA,
  damageDice: stringSchema,
  damageAddsCastMod: booleanSchema,
  damageDicePerUpcast: stringSchema,
  bonusDamageAgainst: objectSchema({
    creatureTypes: CREATURE_TYPES,
    dice: stringSchema,
    damageType: DAMAGE_TYPE_SCHEMA,
  }),
  secondaryDamage: objectSchema(
    { dice: stringSchema, damageType: DAMAGE_TYPE_SCHEMA },
    {
      dicePerUpcast: stringSchema,
      resolution: GATE,
      area: booleanSchema,
      damageOnSave: HALF,
      damageOnMiss: HALF,
    }
  ),
  instances: numberSchema,
  instancesPerUpcast: numberSchema,
  cantripInstances: TRUE,
  area: booleanSchema,
  damageOnSave: HALF,
  damageOnMiss: HALF,
  damageResolution: GATE,
  primaryTargetOnly: booleanSchema,
  recurrence: literals([
    "on-enter-or-end-turn",
    "on-enter-or-start-turn",
    "start-and-end-turn",
    "start-of-turn",
    "bonus-action-move",
    "bonus-action-retrigger",
    "action-retrigger",
  ]),
  resolveOnCast: literalSchema(false),
  followUp: ACTION_DEF,
  endsOnSuccessfulSave: booleanSchema,
  healDice: stringSchema,
  healAddsCastMod: booleanSchema,
  healDicePerUpcast: stringSchema,
  tempHpRoll: objectSchema(
    { bonus: numberSchema },
    { dice: stringSchema, bonusPerUpcast: numberSchema }
  ),
  effectTag: literals(["advantage", "control", "heal", "buff", "debuff", "utility"]),
  damageTypes: DAMAGE_TYPES,
  damageChoice: DAMAGE_TYPES,
  saveAbility: ABILITY,
  attackType: literals(["melee", "ranged"]),
  weaponAttackCantrip: objectSchema({
    useSpellcastingAbility: booleanSchema,
    damageTypeChoice: DAMAGE_TYPE_SCHEMA,
    extraDamageByLevel: recordSchema("number", stringSchema),
    extraDamageType: DAMAGE_TYPE_SCHEMA,
  }),
  grants: arraySchema(GRANT),
  companion: OBJECT,
  summonedMonsters: OBJECT,
  bestiaryPick: OBJECT,
  components: objectSchema({}, { costGp: numberSchema, consumed: booleanSchema }),
};

// ─── Reading a stored homebrew spell ─────────────────────────────────────────

const mechanicsCache = new WeakMap<object, HomebrewSpellMechanics>();

/**
 * The playable mechanics of a stored homebrew spell: every known field its schema
 * accepts, grants conformed one by one. Undefined when the spell declares none (an
 * older, text-only homebrew spell).
 */
export function homebrewSpellMechanics(
  spell: Pick<CustomSpell, "mechanics">
): HomebrewSpellMechanics | undefined {
  const authored: unknown = spell.mechanics;
  if (!plainObject(authored)) return undefined;
  const hit = mechanicsCache.get(authored);
  if (hit) return hit;
  const accepted: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(HOMEBREW_SPELL_FIELD_SCHEMAS)) {
    if (!Object.hasOwn(authored, key)) continue;
    const raw = authored[key];
    if (key === "grants") {
      if (!Array.isArray(raw)) continue;
      accepted.grants = raw.flatMap((grant: unknown) => {
        const conformed = conformGrant(grant);
        return conformed ? [conformed] : [];
      });
      continue;
    }
    const value: unknown = conformExact(schema, raw, CONTEXT);
    if (value !== null) accepted[key] = value;
  }
  const mechanics = Object.freeze(accepted) as HomebrewSpellMechanics;
  mechanicsCache.set(authored, mechanics);
  return mechanics;
}

/** The engine id of a homebrew spell: its activity, grant source and action key. */
export function homebrewSpellId(spell: Pick<CustomSpell, "instanceId">): string {
  return `custom-spell-${spell.instanceId}`;
}

/** The casting time in the catalogue's vocabulary ("action" / "bonus" / "reaction"),
 *  or the authored time for a longer cast. */
function catalogueCastingTime(castingTime: string): string {
  const timing = classifySpellCastingTime(castingTime);
  return timing === "extended" ? castingTime : timing;
}

const SPECIAL: SpellDuration = { kind: "special" };
const dataCache = new WeakMap<object, SrdSpellData>();

/**
 * A homebrew spell as catalogue spell data — the one shape the spell engine reads.
 * Undefined for a text-only homebrew spell (no `mechanics`), which keeps its
 * text-only play. The top-level homebrew facts (level, school, casting time,
 * Concentration, V/S/M) are its own; everything else is its accepted mechanics.
 */
export function homebrewSpellData(spell: CustomSpell): SrdSpellData | undefined {
  const hit = dataCache.get(spell);
  if (hit) return hit;
  const mechanics = homebrewSpellMechanics(spell);
  if (!mechanics) return undefined;
  const { components: cost, ...rest } = mechanics;
  const duration = rest.duration ?? SPECIAL;
  const data: SrdSpellData = {
    ...rest,
    id: homebrewSpellId(spell),
    level: spell.level,
    school: spell.school,
    classes: [],
    castingTime: catalogueCastingTime(spell.castingTime),
    ritual: rest.ritual ?? false,
    components: {
      v: spell.components.v,
      s: spell.components.s,
      m: spell.components.m,
      ...(spell.components.m && cost?.costGp !== undefined
        ? { costGp: cost.costGp }
        : {}),
      ...(spell.components.m && cost?.consumed ? { consumed: true } : {}),
    },
    concentration: spell.concentration,
    duration,
    ...((rest.instantaneous ?? duration.kind === "instantaneous")
      ? { instantaneous: true }
      : {}),
    // A homebrew spell belongs to no book; it is the player's own.
    source: "Wiki",
  };
  dataCache.set(spell, data);
  return data;
}

/**
 * The spell data behind a held Concentration: the catalogue spell for an id, or the
 * character's structured homebrew spell for a `custom:` ref (the homebrew ref names
 * the spell, as it always has). Undefined when nothing is held or the spell carries
 * no structured mechanics.
 */
export function concentrationSpellData(
  ref: string,
  spells: ReadonlyArray<SrdSpellRef | CustomSpell> = []
): SrdSpellData | undefined {
  if (ref === "") return undefined;
  if (!ref.startsWith(CUSTOM_CONCENTRATION_PREFIX)) return getSpellById(ref);
  const name = ref.slice(CUSTOM_CONCENTRATION_PREFIX.length);
  for (const spell of spells) {
    if (!("custom" in spell) || spell.name !== name) continue;
    const data = homebrewSpellData(spell);
    if (data) return data;
  }
  return undefined;
}
