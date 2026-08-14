/**
 * Exact structural grammar for the stable, user-authored character definition.
 *
 * Persistence versioning belongs to the outer character codec. This value holds
 * only authored build facts: no derived values, session state, material state,
 * or compatibility bags. Cross-field rules and set canonicalization live in the
 * IO boundary; every field and public structural type comes from this schema.
 */

import type { CombatEffectProgram } from "@/data/types";
import type { ResourceSpec, ResourceTerm } from "@/types/resource";
import {
  arraySchema,
  booleanSchema,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  objectSchema,
  recordSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import type { Grant } from "@/lib/grants";

const ID_SCHEMA = customSchema<"id", string>("id");
const NAME_SCHEMA = customSchema<"name", string>("name");
const TEXT_SCHEMA = customSchema<"text", string>("text");
const INTEGER_SCHEMA = customSchema<"integer", number>("integer");
const NONNEGATIVE_INTEGER_SCHEMA = customSchema<"nonnegative-integer", number>(
  "nonnegative-integer"
);
const CLASS_LEVEL_SCHEMA = customSchema<"class-level", number>("class-level");
const ABILITY_SCORE_SCHEMA = customSchema<"ability-score", number>("ability-score");
const SPELL_LEVEL_SCHEMA = customSchema<"spell-level", number>("spell-level");

const NULL_SCHEMA = literalSchema(null);
const NULLABLE_ID_SCHEMA = unionSchema([ID_SCHEMA, NULL_SCHEMA]);
const NULLABLE_TEXT_SCHEMA = unionSchema([TEXT_SCHEMA, NULL_SCHEMA]);
const NULLABLE_INTEGER_SCHEMA = unionSchema([INTEGER_SCHEMA, NULL_SCHEMA]);
const NULLABLE_NONNEGATIVE_INTEGER_SCHEMA = unionSchema([
  NONNEGATIVE_INTEGER_SCHEMA,
  NULL_SCHEMA,
]);

const ABILITY_SCHEMA = unionSchema([
  literalSchema("STR"),
  literalSchema("DEX"),
  literalSchema("CON"),
  literalSchema("INT"),
  literalSchema("WIS"),
  literalSchema("CHA"),
]);
const NULLABLE_ABILITY_SCHEMA = unionSchema([ABILITY_SCHEMA, NULL_SCHEMA]);
const SPELL_SCHOOL_SCHEMA = unionSchema([
  literalSchema("abjuration"),
  literalSchema("conjuration"),
  literalSchema("divination"),
  literalSchema("enchantment"),
  literalSchema("evocation"),
  literalSchema("illusion"),
  literalSchema("necromancy"),
  literalSchema("transmutation"),
]);
const ACTION_TYPE_SCHEMA = unionSchema([
  literalSchema("action"),
  literalSchema("bonus"),
  literalSchema("reaction"),
  literalSchema("free"),
]);

const STRING_SET_SCHEMA = arraySchema(ID_SCHEMA);
const TEXT_SET_SCHEMA = arraySchema(NAME_SCHEMA);

const IDENTITY_SCHEMA = objectSchema({
  alignmentId: TEXT_SCHEMA,
  backgroundFeatOverrideId: NULLABLE_ID_SCHEMA,
  backgroundId: ID_SCHEMA,
  name: NAME_SCHEMA,
  playerName: TEXT_SCHEMA,
  quote: TEXT_SCHEMA,
  speciesId: ID_SCHEMA,
});

const CLASS_CHOICES_SCHEMA = objectSchema({
  fightingStyleIds: STRING_SET_SCHEMA,
  invocationIds: STRING_SET_SCHEMA,
  maneuverIds: STRING_SET_SCHEMA,
  metamagicIds: STRING_SET_SCHEMA,
  weaponMasteryIds: STRING_SET_SCHEMA,
});

const CLASS_SCHEMA = objectSchema({
  choices: CLASS_CHOICES_SCHEMA,
  classId: ID_SCHEMA,
  level: CLASS_LEVEL_SCHEMA,
  subclassId: NULLABLE_ID_SCHEMA,
});

const ABILITY_SCORES_SCHEMA = objectSchema({
  CHA: ABILITY_SCORE_SCHEMA,
  CON: ABILITY_SCORE_SCHEMA,
  DEX: ABILITY_SCORE_SCHEMA,
  INT: ABILITY_SCORE_SCHEMA,
  STR: ABILITY_SCORE_SCHEMA,
  WIS: ABILITY_SCORE_SCHEMA,
});

const ORIGIN_SCHEMA = objectSchema({
  speciesFeatId: NULLABLE_ID_SCHEMA,
  speciesSpellAbility: NULLABLE_ABILITY_SCHEMA,
});

const PROFICIENCIES_SCHEMA = objectSchema({
  customLanguages: TEXT_SET_SCHEMA,
  customTools: TEXT_SET_SCHEMA,
  languageIds: STRING_SET_SCHEMA,
  skills: recordSchema(
    "string",
    unionSchema([literalSchema("proficient"), literalSchema("expertise")])
  ),
  toolChoices: recordSchema("string", arraySchema(ID_SCHEMA, 1)),
  toolIds: STRING_SET_SCHEMA,
});

const TAG_SCHEMA = objectSchema({
  color: NAME_SCHEMA,
  label: NAME_SCHEMA,
});

const SPELL_SOURCE_SCHEMA = discriminatedUnionSchema("kind", {
  class: objectSchema({
    classId: ID_SCHEMA,
    kind: literalSchema("class"),
  }),
  feature: objectSchema({
    featureId: ID_SCHEMA,
    kind: literalSchema("feature"),
  }),
  manual: objectSchema({ kind: literalSchema("manual") }),
});

const SPELL_COMPONENTS_SCHEMA = objectSchema({
  material: booleanSchema,
  materialDescription: NULLABLE_TEXT_SCHEMA,
  somatic: booleanSchema,
  verbal: booleanSchema,
});

const SPELL_DEFINITION_SCHEMA = discriminatedUnionSchema("kind", {
  catalogue: objectSchema({
    kind: literalSchema("catalogue"),
    spellId: ID_SCHEMA,
  }),
  custom: objectSchema({
    castingTime: TEXT_SCHEMA,
    components: SPELL_COMPONENTS_SCHEMA,
    concentration: booleanSchema,
    description: TEXT_SCHEMA,
    duration: TEXT_SCHEMA,
    higherLevels: NULLABLE_TEXT_SCHEMA,
    kind: literalSchema("custom"),
    level: SPELL_LEVEL_SCHEMA,
    name: NAME_SCHEMA,
    program: unionSchema([
      customSchema<"combat-effect-program", CombatEffectProgram>("combat-effect-program"),
      NULL_SCHEMA,
    ]),
    range: TEXT_SCHEMA,
    school: SPELL_SCHOOL_SCHEMA,
  }),
});

const SPELL_CHOICE_SCHEMA = objectSchema({
  definition: SPELL_DEFINITION_SCHEMA,
  notes: TEXT_SCHEMA,
  source: SPELL_SOURCE_SCHEMA,
  spellAbilityOverride: NULLABLE_ABILITY_SCHEMA,
  tags: arraySchema(TAG_SCHEMA),
});

const FEATURE_SOURCE_SCHEMA = discriminatedUnionSchema("kind", {
  background: objectSchema({
    backgroundId: ID_SCHEMA,
    kind: literalSchema("background"),
  }),
  class: objectSchema({
    classId: ID_SCHEMA,
    kind: literalSchema("class"),
  }),
  feat: objectSchema({
    featId: ID_SCHEMA,
    kind: literalSchema("feat"),
  }),
  manual: objectSchema({ kind: literalSchema("manual") }),
  species: objectSchema({
    kind: literalSchema("species"),
    speciesId: ID_SCHEMA,
  }),
});

const CONTENT_BLOCK_SCHEMA = discriminatedUnionSchema("type", {
  list: objectSchema({
    items: arraySchema(TEXT_SCHEMA),
    title: NULLABLE_TEXT_SCHEMA,
    type: literalSchema("list"),
  }),
  table: objectSchema({
    table: objectSchema({
      headers: arraySchema(TEXT_SCHEMA),
      rows: arraySchema(arraySchema(TEXT_SCHEMA)),
    }),
    title: NULLABLE_TEXT_SCHEMA,
    type: literalSchema("table"),
  }),
  text: objectSchema({
    text: TEXT_SCHEMA,
    title: NULLABLE_TEXT_SCHEMA,
    type: literalSchema("text"),
  }),
});

const FEATURE_RESOURCE_SCHEMA = objectSchema({
  label: NAME_SCHEMA,
  spec: customSchema<"resource-spec", ResourceSpec>("resource-spec"),
});
const FEATURE_RESOURCES_SCHEMA = recordSchema("string", FEATURE_RESOURCE_SCHEMA);

const FEATURE_ACTION_COST_SCHEMA = unionSchema([
  customSchema<"resource-term", ResourceTerm>("resource-term"),
  NULL_SCHEMA,
]);

const FEATURE_ACTION_SCHEMA = objectSchema({
  description: TEXT_SCHEMA,
  id: ID_SCHEMA,
  label: NAME_SCHEMA,
  program: unionSchema([
    customSchema<"combat-effect-program", CombatEffectProgram>("combat-effect-program"),
    NULL_SCHEMA,
  ]),
  cost: FEATURE_ACTION_COST_SCHEMA,
  slot: ACTION_TYPE_SCHEMA,
});

const CUSTOM_FEATURE_DEFINITION_SCHEMA = objectSchema({
  actions: arraySchema(FEATURE_ACTION_SCHEMA),
  contentBlocks: arraySchema(CONTENT_BLOCK_SCHEMA),
  emoji: TEXT_SCHEMA,
  grants: arraySchema(customSchema<"grant", Readonly<Grant>>("grant")),
  kind: literalSchema("custom"),
  resources: FEATURE_RESOURCES_SCHEMA,
  sourceLabel: TEXT_SCHEMA,
  subtitle: NULLABLE_TEXT_SCHEMA,
  title: NAME_SCHEMA,
});

const FEATURE_DEFINITION_SCHEMA = discriminatedUnionSchema("kind", {
  catalogue: objectSchema({
    featureId: ID_SCHEMA,
    kind: literalSchema("catalogue"),
  }),
  custom: CUSTOM_FEATURE_DEFINITION_SCHEMA,
});

const FEATURE_CHOICE_SCHEMA = objectSchema({
  definition: FEATURE_DEFINITION_SCHEMA,
  notes: TEXT_SCHEMA,
  source: FEATURE_SOURCE_SCHEMA,
  tags: arraySchema(TAG_SCHEMA),
});

const SPELLCASTING_OVERRIDE_SCHEMA = objectSchema({
  ability: NULLABLE_ABILITY_SCHEMA,
  attackBonus: NULLABLE_INTEGER_SCHEMA,
  preparedMaximum: NULLABLE_NONNEGATIVE_INTEGER_SCHEMA,
  saveDifficultyClass: NULLABLE_NONNEGATIVE_INTEGER_SCHEMA,
});

const PARTIAL_ABILITY_INTEGER_MAP_SCHEMA = objectSchema(
  {},
  {
    CHA: INTEGER_SCHEMA,
    CON: INTEGER_SCHEMA,
    DEX: INTEGER_SCHEMA,
    INT: INTEGER_SCHEMA,
    STR: INTEGER_SCHEMA,
    WIS: INTEGER_SCHEMA,
  }
);
const PARTIAL_ABILITY_BOOLEAN_MAP_SCHEMA = objectSchema(
  {},
  {
    CHA: booleanSchema,
    CON: booleanSchema,
    DEX: booleanSchema,
    INT: booleanSchema,
    STR: booleanSchema,
    WIS: booleanSchema,
  }
);

const OVERRIDES_SCHEMA = objectSchema({
  armorClass: NULLABLE_NONNEGATIVE_INTEGER_SCHEMA,
  /** Absent key inherits the computed fact; false explicitly suppresses it. */
  armorProficiencies: recordSchema("string", booleanSchema),
  conditionImmunities: recordSchema("string", booleanSchema),
  damageImmunities: recordSchema("string", booleanSchema),
  damageResistances: recordSchema("string", booleanSchema),
  damageVulnerabilities: recordSchema("string", booleanSchema),
  hitPointMaximumAdjustment: NULLABLE_INTEGER_SCHEMA,
  initiativeBonus: NULLABLE_INTEGER_SCHEMA,
  initiativeRoll: unionSchema([
    literalSchema("normal"),
    literalSchema("advantage"),
    literalSchema("disadvantage"),
    NULL_SCHEMA,
  ]),
  passiveScores: recordSchema("string", NONNEGATIVE_INTEGER_SCHEMA),
  proficiencyBonus: NULLABLE_NONNEGATIVE_INTEGER_SCHEMA,
  savingThrowBonuses: PARTIAL_ABILITY_INTEGER_MAP_SCHEMA,
  savingThrowProficiencies: PARTIAL_ABILITY_BOOLEAN_MAP_SCHEMA,
  /** Absent key inherits the computed sense; zero explicitly suppresses it. */
  sensesFt: recordSchema("string", NONNEGATIVE_INTEGER_SCHEMA),
  skillBonuses: recordSchema("string", INTEGER_SCHEMA),
  /** Absent key inherits the computed speed; zero explicitly suppresses it. */
  speedsFt: recordSchema("string", NONNEGATIVE_INTEGER_SCHEMA),
  spellcastingByClass: recordSchema("string", SPELLCASTING_OVERRIDE_SCHEMA),
  walkingSpeedFt: NULLABLE_NONNEGATIVE_INTEGER_SCHEMA,
  weaponProficiencies: recordSchema("string", booleanSchema),
});

const LORE_SCHEMA = objectSchema({
  age: TEXT_SCHEMA,
  backstory: TEXT_SCHEMA,
  bonds: TEXT_SCHEMA,
  eyes: TEXT_SCHEMA,
  flaws: TEXT_SCHEMA,
  hair: TEXT_SCHEMA,
  height: TEXT_SCHEMA,
  ideals: TEXT_SCHEMA,
  skin: TEXT_SCHEMA,
  traits: TEXT_SCHEMA,
  weight: TEXT_SCHEMA,
});

const COMBAT_ALGORITHM_SCHEMA = arraySchema(
  objectSchema({
    emoji: TEXT_SCHEMA,
    steps: arraySchema(
      objectSchema({
        bullets: arraySchema(TEXT_SCHEMA),
        indent: booleanSchema,
        question: NULLABLE_TEXT_SCHEMA,
      })
    ),
    title: NAME_SCHEMA,
  })
);

/**
 * Account-authored condition facts keyed by stable condition id. `grants` are
 * lifted only while an occurrence is active; an empty list plus a null program
 * is the explicit narrative-only definition.
 */
const CUSTOM_CONDITION_SCHEMA = objectSchema({
  description: TEXT_SCHEMA,
  grants: arraySchema(customSchema<"grant", Readonly<Grant>>("grant")),
  label: NAME_SCHEMA,
  program: unionSchema([
    customSchema<"combat-effect-program", CombatEffectProgram>("combat-effect-program"),
    NULL_SCHEMA,
  ]),
});

export const CHARACTER_BUILD_SCHEMA = objectSchema({
  abilityScores: ABILITY_SCORES_SCHEMA,
  classes: arraySchema(CLASS_SCHEMA),
  combatAlgorithm: COMBAT_ALGORITHM_SCHEMA,
  customConditions: recordSchema("string", CUSTOM_CONDITION_SCHEMA),
  /** Stable choice-instance id -> feature; catalogue ids may repeat across keys. */
  features: recordSchema("string", FEATURE_CHOICE_SCHEMA),
  identity: IDENTITY_SCHEMA,
  lore: LORE_SCHEMA,
  origin: ORIGIN_SCHEMA,
  overrides: OVERRIDES_SCHEMA,
  proficiencies: PROFICIENCIES_SCHEMA,
  /** Stable choice-instance id -> spell; catalogue ids may repeat across keys. */
  spells: recordSchema("string", SPELL_CHOICE_SCHEMA),
});

export type CharacterBuildSchemaCustomTypes = {
  readonly "ability-score": number;
  readonly "class-level": number;
  readonly "combat-effect-program": CombatEffectProgram;
  readonly grant: Readonly<Grant>;
  readonly id: string;
  readonly integer: number;
  readonly name: string;
  readonly "nonnegative-integer": number;
  readonly "resource-spec": ResourceSpec;
  readonly "resource-term": ResourceTerm;
  readonly "spell-level": number;
  readonly text: string;
};

/** Public build shape inferred wholly from the exact runtime grammar above. */
export type CharacterBuildSchemaShape = InferExactSchema<typeof CHARACTER_BUILD_SCHEMA>;
