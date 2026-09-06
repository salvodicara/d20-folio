import {
  characterPath,
  frozen,
  object,
  parseCharacter,
  type CharacterRef,
  type FolioCharacter,
  type Json,
  type JsonObject,
} from "./model";
/** Explicit grammar: unknown members never enter an authorized sheet. This is not text scanning. */
type Shape = "scalar" | { [key: string]: Shape } | readonly [Shape];
const scalar: Shape = "scalar";
const values = (keys: string): Record<string, Shape> =>
  Object.fromEntries(keys.split(" ").map((k) => [k, scalar]));
const ability = values("STR DEX CON INT WIS CHA");
const dictionary = (shape: Shape): Shape => ({ $dictionary: shape });
const scalarMap = dictionary(scalar);
const entry: Shape = {
  tags: [values("label color")],
  ...values(
    "srdId instanceId custom name title emoji subtitle source level school castingTime range duration concentration description higherLevels prepared alwaysPrepared spellAbilityOverride wizardSpellMastery wizardSignatureSpell speciesSpellAbility quantity equipped tracked isConsumable isPotion potionFormula isPool unit acBonus attuned damageDie damageType attackStat attackBonusOverride damageOverride enchantItemId properties armorCategory recovery"
  ),
  components: values("v s m material"),
  ac: values("base dexBonus maxDex"),
  charges: values("current max recovery recoveryFormula"),
  freeCastSource: values("sourceId rest usesPerRest"),
  contentBlocks: [
    {
      ...values("type title text"),
      items: [scalar],
      table: { headers: [scalar], rows: [[scalar]] },
    },
  ],
  trackers: [
    {
      ...values(
        "id label total recovery die isPool unit shortRestRecovery refreshOnActivationOf"
      ),
      recordedRolls: values("min max"),
      altRecoveryCost: values("amount fromTracker"),
    },
  ],
  actions: [
    values(
      "id type label description trackerCost costTracker requiresActionThisTurn requiresOutcomeThisTurn requiresActionCategoryThisTurn maxUsesPerTurn"
    ),
  ],
};
const buildShape: Shape = {
  ...values(
    "name race background alignment abilityBudget proficiencyBonusOverride humanOriginFeat bgFeat speciesSpellAbility speed hitDieType"
  ),
  abilities: ability,
  classes: [
    {
      ...values("classId subclassId level"),
      fightingStyles: [scalar],
      weaponMasteries: [scalar],
      metamagicChoices: [scalar],
      invocationChoices: [scalar],
      maneuverChoices: [scalar],
    },
  ],
  languageIds: [scalar],
  customLanguages: [scalar],
  toolProficiencyIds: [scalar],
  customToolProficiencies: [scalar],
  toolChoices: dictionary([scalar]),
  savingThrows: [scalar],
  spellSlots: [values("level total pactMagic")],
  spellcasting: {
    ...values(
      "ability preparedCaster preparedMax preparedMaxOverride saveDCOverride attackBonusOverride"
    ),
    slotMaxOverrides: scalarMap,
  },
  skills: values(
    "acrobatics animal-handling arcana athletics deception history insight intimidation investigation medicine nature perception performance persuasion religion sleight-of-hand stealth survival"
  ),
  spells: [entry],
  weapons: [entry],
  equipment: [entry],
  features: [entry],
  customs: {
    spells: [entry],
    weapons: [entry],
    equipment: [entry],
    features: [entry],
    conditions: [scalar],
  },
  asi: { background: ability },
  originFeats: values("species background"),
  overrides: {
    ...values(
      "ac hpMax speed initiativeBonus initiativeAdvantage proficiencyBonus hitDiceTotal passivePerception passiveInsight passiveInvestigation"
    ),
    saves: ability,
    skillBonuses: scalarMap,
    senseRanges: scalarMap,
    speeds: scalarMap,
    damageResistances: scalarMap,
    damageImmunities: scalarMap,
    damageVulnerabilities: scalarMap,
    conditionImmunities: scalarMap,
    armorProficiencies: scalarMap,
    weaponProficiencies: scalarMap,
  },
  combatAlgorithm: [
    {
      ...values("emoji title"),
      steps: [{ ...values("question indent"), bullets: [scalar] }],
    },
  ],
};
const stateShape: Shape = {
  ...values(
    "exhaustion concentration concentrationCastLevel inspiration deathSucc deathFail initiative hiddenDc bardicInspirationDie usedHitDice"
  ),
  hp: values("current temp"),
  currency: values("pp gp ep sp cp"),
  conditions: [scalar],
  concentrationConditions: [scalar],
  usedSlots: scalarMap,
  activeFeatures: [scalar],
  activeSpellCastLevels: scalarMap,
  grantBundleChoices: scalarMap,
  companionHp: dictionary(values("current")),
  companionVariant: scalarMap,
  familiar: values("monsterId creatureType dismissed"),
  sessionDefenses: dictionary([scalar]),
  effectTimers: dictionary(values("roundsLeft")),
  effectBoundaries: dictionary(values("round phase")),
  manifestedWeaponOverrides: dictionary(values("attackBonusOverride damageOverride")),
  pactWeaponRiderTypes: scalarMap,
};
function project(value: unknown, shape: Shape): Json {
  if (shape === "scalar") {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    )
      return value;
    throw new Error("malformed-sheet-value");
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) throw new Error("malformed-sheet-array");
    return value.map((v) => project(v, (shape as readonly [Shape])[0]));
  }
  const source = object(value);
  const output: JsonObject = {};
  const fields = shape as Record<string, Shape>;
  if (fields.$dictionary) {
    for (const [key, child] of Object.entries(source))
      output[key] = project(child, fields.$dictionary);
    return output;
  }
  for (const [key, child] of Object.entries(fields)) {
    if (Object.hasOwn(source, key)) output[key] = project(source[key], child);
  }
  return output;
}
export interface MigrationArchive {
  schema: 1;
  original: string;
  sourceSchema: 3;
}
export interface MigrationPlan {
  character: Readonly<FolioCharacter>;
  archive: MigrationArchive;
  privateNotes: string;
  destination: string;
}
export function dryRunMigration(original: string, ref: CharacterRef): MigrationPlan {
  if (new TextEncoder().encode(original).length > 750_000)
    throw new Error("migration-too-large");
  const source = object(JSON.parse(original));
  if (source.schema !== 3) throw new Error("unsupported-source-schema");
  const build = object(source.build);
  const classes = build.classes;
  if (typeof build.name !== "string" || !Array.isArray(classes) || classes.length === 0)
    throw new Error("invalid-source-identity");
  let level = 0;
  for (const value of classes) {
    const c = object(value);
    if (
      typeof c.classId !== "string" ||
      !Number.isInteger(c.level) ||
      Number(c.level) < 1
    )
      throw new Error("invalid-source-class");
    level += Number(c.level);
  }
  const state = project(source.state ?? {}, stateShape) as JsonObject;
  // A tracker has the documented scalar-or-counter union, never an opaque map.
  const rawState = object(source.state ?? {});
  if (rawState.trackers !== undefined) {
    state.trackers = {};
    for (const [key, value] of Object.entries(object(rawState.trackers))) {
      state.trackers[key] =
        typeof value === "number"
          ? project(value, scalar)
          : project(value, { used: scalar, rolls: [scalar] });
    }
  }
  const character = parseCharacter({
    schema: 1,
    ...ref,
    name: build.name,
    speciesId: typeof build.race === "string" ? build.race : "",
    classId: String(object(classes[0]).classId),
    level,
    revision: 0,
    currentAssignment: null,
    portraitPath: null,
    sheet: { build: project(build, buildShape), state },
  });
  return frozen({
    character,
    archive: { schema: 1, original, sourceSchema: 3 },
    privateNotes:
      typeof object(build.lore ?? {}).backstory === "string"
        ? String(object(build.lore).backstory)
        : "",
    destination: characterPath(ref),
  });
}
export function recoverMigration(value: unknown): string {
  const archive = object(value);
  if (
    archive.schema !== 1 ||
    archive.sourceSchema !== 3 ||
    typeof archive.original !== "string"
  )
    throw new Error("invalid-archive");
  return archive.original;
}
