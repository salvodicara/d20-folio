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
import { conformScalar, type Scalar } from "@/lib/scalar";
import { CATALOGUE_EFFECTS_SCHEMA } from "@/lib/catalogue-effects";
import { getSpellById } from "@/data/spells";
import type { HomebrewSpellMechanics, SrdSpellData, SpellDuration } from "@/data/types";
import {
  ALL_ACTION_TYPES,
  ALL_CREATURE_TYPES,
  ALL_REACTION_TRIGGERS,
  ALL_SUMMON_TURNS,
  CREATURE_SIZE_ORDER,
} from "@/data/types";
import {
  arraySchema,
  booleanSchema,
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
import { conformHomebrewGrant, type Grant } from "@/lib/grants";
import {
  ABILITY,
  conformFields,
  DAMAGE_TYPES,
  GRANT,
  literals,
  memoByObject,
  OBJECT,
  plainObject,
  TRUE,
} from "@/lib/homebrew-conform";
import { conformGrants } from "@/lib/homebrew-grants";
import { CONDITION_APPLICATION_SCHEMA, homebrewActionDef } from "@/lib/homebrew-actions";
import { classifySpellCastingTime } from "@/lib/cast-options";
import {
  CUSTOM_CONCENTRATION_PREFIX,
  holdsCustomSpellConcentration,
} from "@/lib/concentration";
import { CONDITION_ID_SCHEMA } from "@/types/condition";
import { DAMAGE_TYPE_SCHEMA } from "@/types/damage";
import type { ActionData, CustomSpell, SrdSpellRef } from "@/types/character";

// ─── The exact shape of every structured catalogue-spell field ───────────────

const CREATURE_TYPES = arraySchema(literals(ALL_CREATURE_TYPES));
const GATE = literals(["attack", "save", "automatic"]);
const HALF = literalSchema("half");

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

/** A follow-up action: a known action economy, each field held to the homebrew
 *  action's own schema (`homebrewActionDef`); a rejected field is out of play. */
const ACTION_DEF = customSchema<"action-def", Readonly<Record<string, unknown>>>(
  "action-def"
);

const CONTEXT: ExactSchemaContext<
  {
    object: Readonly<Record<string, unknown>>;
    grant: Grant;
    "action-def": Readonly<Record<string, unknown>>;
    scalar: Scalar;
  },
  Record<never, never>
> = {
  customs: {
    scalar: conformScalar,
    object: (value) => (plainObject(value) ? value : null),
    grant: (value) => conformHomebrewGrant(value),
    "action-def": (value) =>
      plainObject(value) &&
      (ALL_ACTION_TYPES as ReadonlyArray<unknown>).includes(value.type)
        ? (homebrewActionDef(value as unknown as ActionData) as unknown as Readonly<
            Record<string, unknown>
          >)
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
  conditionApplication: CONDITION_APPLICATION_SCHEMA,
  suppressesMagic: TRUE,
  formRule: objectSchema(
    {
      endsWithoutTempHp: booleanSchema,
      keepsMind: booleanSchema,
      pool: literals(["beasts", "bestiary"]),
      reshift: booleanSchema,
    },
    {
      crCap: numberSchema,
      gearMerges: TRUE,
      keeps: objectSchema({ abilities: arraySchema(ABILITY) }),
      excludedTypes: arraySchema(literals([...ALL_CREATURE_TYPES])),
      selfOnly: TRUE,
      permanentWhenHeld: TRUE,
      sizeMax: literals([...CREATURE_SIZE_ORDER]),
    }
  ),
  targeting: objectSchema(
    { affinity: literals(["ally", "enemy", "self", "any"]) },
    {
      excludeSelf: booleanSchema,
      creatureTypes: CREATURE_TYPES,
      maxTargets: numberSchema,
      maxTargetsPerUpcast: numberSchema,
      sharedAmount: booleanSchema,
      includesDead: literalSchema(true),
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
  revives: objectSchema(
    { hitPoints: unionSchema([numberSchema, literalSchema("all")]) },
    { withinMinutes: numberSchema, fromDust: TRUE }
  ),
  onReduceToZero: literals(["dies", "disintegrated"]),
  hitPointThreshold: objectSchema(
    { max: numberSchema, atOrBelow: literals(["dies", "condition"]) },
    { otherwise: literalSchema("speed-zero") }
  ),
  reactionTrigger: unionSchema([
    literals(ALL_REACTION_TRIGGERS),
    arraySchema(literals(ALL_REACTION_TRIGGERS)),
  ]),
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
  damageNotVsCreatureTypes: CREATURE_TYPES,
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
  zone: objectSchema(
    {
      anchor: literals(["caster", "point", "point-or-object"]),
      spellLevel: numberSchema,
      triggers: arraySchema(literals(["enter", "start-turn", "end-turn", "move-within"])),
    },
    {
      light: literals(["dim", "darkness", "magical-darkness", "bright"]),
      spares: literalSchema("chosen"),
    }
  ),
  budget: objectSchema({ max: numberSchema, counts: literalSchema("damage-dealt") }),
  onEnd: CATALOGUE_EFFECTS_SCHEMA,
  counter: objectSchema({ slot: literalSchema("kept") }),
  effects: CATALOGUE_EFFECTS_SCHEMA,
  perTargetChoice: arraySchema(
    objectSchema({ id: stringSchema, effects: CATALOGUE_EFFECTS_SCHEMA })
  ),
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
  saveIfUnwilling: literalSchema(true),
  appliesOnSuccess: literalSchema(true),
  failedD20Becomes: numberSchema,
  saveAbility: ABILITY,
  attackType: literals(["melee", "ranged"]),
  weaponAttackCantrip: objectSchema({
    useSpellcastingAbility: booleanSchema,
    damageTypeChoice: DAMAGE_TYPE_SCHEMA,
    extraDamageByLevel: recordSchema("number", stringSchema),
    extraDamageType: DAMAGE_TYPE_SCHEMA,
  }),
  grants: arraySchema(GRANT),
  targetStates: arraySchema(GRANT),
  companion: OBJECT,
  summonedMonsters: OBJECT,
  summonTurn: literals(ALL_SUMMON_TURNS),
  bestiaryPick: OBJECT,
  components: objectSchema({}, { costGp: numberSchema, consumed: booleanSchema }),
};

// ─── Reading a stored homebrew spell ─────────────────────────────────────────

/** Target states, conformed like grants and kept only when each is a `while-active`. */
function conformTargetStates(value: unknown): Grant[] | null {
  const grants = conformGrants(value);
  return grants ? grants.filter((g) => g.type === "while-active") : null;
}

const conformSpellMechanics = memoByObject(
  (authored: Readonly<Record<string, unknown>>) =>
    Object.freeze(
      conformFields(HOMEBREW_SPELL_FIELD_SCHEMAS, authored, CONTEXT, {
        grants: conformGrants,
        targetStates: conformTargetStates,
      })
    ) as HomebrewSpellMechanics
);

/**
 * The playable mechanics of a stored homebrew spell: every known field its schema
 * accepts, grants conformed one by one. Undefined when the spell declares none (an
 * older, text-only homebrew spell).
 */
export function homebrewSpellMechanics(
  spell: Pick<CustomSpell, "mechanics">
): HomebrewSpellMechanics | undefined {
  const authored: unknown = spell.mechanics;
  return plainObject(authored) ? conformSpellMechanics(authored) : undefined;
}

/** The engine id of a homebrew spell: its activity, grant source and action key. */
function homebrewSpellId(spell: Pick<CustomSpell, "instanceId">): string {
  return `custom-spell-${spell.instanceId}`;
}

/** The casting time in the catalogue's vocabulary ("action" / "bonus" / "reaction"),
 *  or the authored time for a longer cast. */
function catalogueCastingTime(castingTime: string): string {
  const timing = classifySpellCastingTime(castingTime);
  return timing === "extended" ? castingTime : timing;
}

const SPECIAL: SpellDuration = { kind: "special" };

/**
 * A homebrew spell as catalogue spell data — the one shape the spell engine reads.
 * Undefined for a text-only homebrew spell (no `mechanics`), which keeps its
 * text-only play. The top-level homebrew facts (level, school, casting time,
 * Concentration, V/S/M) are its own; everything else is its accepted mechanics.
 */
export const homebrewSpellData = memoByObject(
  (spell: CustomSpell): SrdSpellData | undefined => {
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
      source: "Homebrew",
    };
    return data;
  }
);

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
  for (const spell of spells) {
    // The id stamp by its instanceId, the legacy name stamp by its name.
    if (!("custom" in spell) || !holdsCustomSpellConcentration(ref, spell)) continue;
    const data = homebrewSpellData(spell);
    if (data) return data;
  }
  return undefined;
}
