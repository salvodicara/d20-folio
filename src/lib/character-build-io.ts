import {
  CHARACTER_BUILD_SCHEMA,
  type CharacterBuildSchemaCustomTypes,
} from "@/lib/character-build-schema";
import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import { conformGrant } from "@/lib/grants";
import { conformResourceSpec, conformResourceTerm } from "@/lib/resources";
import type {
  CharacterBuild,
  CharacterBuildParseResult,
  CharacterBuildSeed,
  CharacterCustomFeatureDefinition,
  CharacterFeatureAction,
  CharacterFeatureChoice,
  CharacterSpellChoice,
  CharacterTag,
} from "@/types/character-build";

const MAX_ID_LENGTH = 256;
const MAX_NAME_LENGTH = 256;
const MAX_TEXT_LENGTH = 16_384;
const MAX_ABSOLUTE_INTEGER = 1_000_000;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function conformId(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !UNSAFE_KEYS.has(value)
    ? value
    : null;
}

function conformName(value: unknown): string | null {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_NAME_LENGTH
    ? value
    : null;
}

function conformText(value: unknown): string | null {
  return typeof value === "string" && value.length <= MAX_TEXT_LENGTH ? value : null;
}

function conformInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    Math.abs(value) <= MAX_ABSOLUTE_INTEGER
    ? value
    : null;
}

function conformIntegerRange(
  value: unknown,
  minimum: number,
  maximum: number
): number | null {
  const integer = conformInteger(value);
  return integer !== null && integer >= minimum && integer <= maximum ? integer : null;
}

const CHARACTER_BUILD_CONTEXT: ExactSchemaContext<
  CharacterBuildSchemaCustomTypes,
  Record<never, never>
> = {
  customs: {
    "ability-score": (value) => conformIntegerRange(value, 1, 30),
    "class-level": (value) => conformIntegerRange(value, 1, 20),
    grant: conformGrant,
    id: conformId,
    integer: conformInteger,
    name: conformName,
    "nonnegative-integer": (value) => conformIntegerRange(value, 0, 1_000_000),
    "resource-spec": conformResourceSpec,
    "resource-term": conformResourceTerm,
    "spell-level": (value) => conformIntegerRange(value, 0, 9),
    text: conformText,
  },
  refs: {},
};

const conformCharacterBuildStructure = exactConformer(
  CHARACTER_BUILD_SCHEMA,
  CHARACTER_BUILD_CONTEXT
);

function canonicalKey(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalSet(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(canonicalKey);
}

function canonicalTags(tags: readonly CharacterTag[]): readonly CharacterTag[] {
  const unique = new Map<string, CharacterTag>();
  for (const tag of tags) unique.set(JSON.stringify([tag.label, tag.color]), tag);
  return [...unique.entries()]
    .sort(([left], [right]) => canonicalKey(left, right))
    .map(([, tag]) => tag);
}

function validRecordIds(value: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(value).every((key) => conformId(key) !== null);
}

function validActionIds(actions: readonly CharacterFeatureAction[]): boolean {
  return new Set(actions.map((action) => action.id)).size === actions.length;
}

function validResourceDefinitions(
  resources: CharacterCustomFeatureDefinition["resources"]
): boolean {
  return (
    validRecordIds(resources) &&
    Object.entries(resources).every(
      ([resourceId, resource]) => resource.spec.id === resourceId
    )
  );
}

function canonicalFeatureChoice(
  choice: CharacterFeatureChoice
): CharacterFeatureChoice | null {
  if (choice.definition.kind === "custom") {
    if (
      !validResourceDefinitions(choice.definition.resources) ||
      !validActionIds(choice.definition.actions)
    ) {
      return null;
    }
  } else if (
    choice.source.kind !== "manual" &&
    choice.notes.length === 0 &&
    choice.tags.length === 0
  ) {
    // Automatic catalogue facts derive from the selected class/species/etc.
    // Store a catalogue row only when the player has authored annotations.
    return null;
  }

  return { ...choice, tags: canonicalTags(choice.tags) };
}

function canonicalSpellChoice(choice: CharacterSpellChoice): CharacterSpellChoice | null {
  if (
    choice.definition.kind === "custom" &&
    !choice.definition.components.material &&
    choice.definition.components.materialDescription !== null
  ) {
    return null;
  }
  return { ...choice, tags: canonicalTags(choice.tags) };
}

function canonicalBuild(value: CharacterBuild): CharacterBuild | null {
  if (value.classes.length === 0) return null;
  const classIds = value.classes.map((entry) => entry.classId);
  const totalLevel = value.classes.reduce((sum, entry) => sum + entry.level, 0);
  if (new Set(classIds).size !== classIds.length || totalLevel > 20) return null;

  const classes = value.classes.map((entry) => ({
    ...entry,
    choices: {
      fightingStyleIds: canonicalSet(entry.choices.fightingStyleIds),
      invocationIds: canonicalSet(entry.choices.invocationIds),
      maneuverIds: canonicalSet(entry.choices.maneuverIds),
      metamagicIds: canonicalSet(entry.choices.metamagicIds),
      weaponMasteryIds: canonicalSet(entry.choices.weaponMasteryIds),
    },
  }));

  if (
    !validRecordIds(value.proficiencies.skills) ||
    !validRecordIds(value.proficiencies.toolChoices) ||
    !validRecordIds(value.spells) ||
    !validRecordIds(value.features) ||
    !validRecordIds(value.customConditions)
  ) {
    return null;
  }

  const toolChoices: Record<string, readonly [string, ...string[]]> = {};
  for (const [key, choices] of Object.entries(value.proficiencies.toolChoices)) {
    const canonical = canonicalSet(choices);
    const first = canonical[0];
    if (first === undefined) return null;
    toolChoices[key] = [first, ...canonical.slice(1)];
  }

  const proficiencies = {
    ...value.proficiencies,
    customLanguages: canonicalSet(value.proficiencies.customLanguages),
    customTools: canonicalSet(value.proficiencies.customTools),
    languageIds: canonicalSet(value.proficiencies.languageIds),
    toolChoices,
    toolIds: canonicalSet(value.proficiencies.toolIds),
  };

  const spells: Record<string, CharacterSpellChoice> = {};
  for (const [key, choice] of Object.entries(value.spells)) {
    const canonical = canonicalSpellChoice(choice);
    if (canonical === null) return null;
    spells[key] = canonical;
  }

  const features: Record<string, CharacterFeatureChoice> = {};
  for (const [key, choice] of Object.entries(value.features)) {
    const canonical = canonicalFeatureChoice(choice);
    if (canonical === null) return null;
    features[key] = canonical;
  }

  const overrideRecords: readonly Readonly<Record<string, unknown>>[] = [
    value.overrides.armorProficiencies,
    value.overrides.conditionImmunities,
    value.overrides.damageImmunities,
    value.overrides.damageResistances,
    value.overrides.damageVulnerabilities,
    value.overrides.passiveScores,
    value.overrides.sensesFt,
    value.overrides.skillBonuses,
    value.overrides.speedsFt,
    value.overrides.spellcastingByClass,
    value.overrides.weaponProficiencies,
  ];
  if (
    overrideRecords.some((entry) => !validRecordIds(entry)) ||
    Object.values(value.overrides.spellcastingByClass).some(
      (entry) =>
        entry.ability === null &&
        entry.attackBonus === null &&
        entry.preparedMaximum === null &&
        entry.saveDifficultyClass === null
    )
  ) {
    return null;
  }

  for (const feature of Object.values(features)) {
    const blocks =
      feature.definition.kind === "custom" ? feature.definition.contentBlocks : undefined;
    for (const block of blocks ?? []) {
      if (
        block.type === "table" &&
        block.table.rows.some((row) => row.length !== block.table.headers.length)
      ) {
        return null;
      }
    }
  }

  return {
    ...value,
    classes,
    features,
    proficiencies,
    spells,
  };
}

/** Parse, semantically check, canonicalize, clone, and freeze one character build. */
export function parseCharacterBuild(value: unknown): CharacterBuildParseResult {
  const structural = conformCharacterBuildStructure(value);
  if (structural === null) return { ok: false };
  const canonical = canonicalBuild(structural);
  if (canonical === null) return { ok: false };
  const conformed = conformCharacterBuildStructure(canonical);
  return conformed === null ? { ok: false } : { ok: true, value: conformed };
}

const EMPTY_LORE: CharacterBuild["lore"] = {
  age: "",
  backstory: "",
  bonds: "",
  eyes: "",
  flaws: "",
  hair: "",
  height: "",
  ideals: "",
  skin: "",
  traits: "",
  weight: "",
};

const EMPTY_OVERRIDES: CharacterBuild["overrides"] = {
  armorClass: null,
  armorProficiencies: {},
  conditionImmunities: {},
  damageImmunities: {},
  damageResistances: {},
  damageVulnerabilities: {},
  hitPointMaximumAdjustment: null,
  initiativeBonus: null,
  initiativeRoll: null,
  passiveScores: {},
  proficiencyBonus: null,
  savingThrowBonuses: {},
  savingThrowProficiencies: {},
  sensesFt: {},
  skillBonuses: {},
  speedsFt: {},
  spellcastingByClass: {},
  walkingSpeedFt: null,
  weaponProficiencies: {},
};

/** Construct the smallest valid build without inventing a D&D rule default. */
export function createCharacterBuild(seed: CharacterBuildSeed): CharacterBuild {
  const parsed = parseCharacterBuild({
    abilityScores: seed.abilityScores,
    classes: seed.classes,
    combatAlgorithm: [],
    customConditions: {},
    features: {},
    identity: seed.identity,
    lore: EMPTY_LORE,
    origin: { speciesFeatId: null, speciesSpellAbility: null },
    overrides: EMPTY_OVERRIDES,
    proficiencies: {
      customLanguages: [],
      customTools: [],
      languageIds: [],
      skills: {},
      toolChoices: {},
      toolIds: [],
    },
    spells: {},
  });
  if (!parsed.ok) throw new TypeError("Invalid character build seed");
  return parsed.value;
}

/** Validate and emit canonical JSON bytes through the one boundary above. */
export function serializeCharacterBuild(value: unknown): string {
  const parsed = parseCharacterBuild(value);
  if (!parsed.ok) throw new TypeError("Invalid character build");
  return JSON.stringify(parsed.value);
}
