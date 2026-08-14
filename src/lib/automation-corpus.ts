/**
 * Exact automation-corpus adapter.
 *
 * Data modules stay the source of the subjects. This module owns the closed
 * field vocabulary and turns every mechanic-bearing leaf into one compiler
 * claim. Localized rule prose is an additional manual claim even when the same
 * entity also carries grants or an effect program: structured presence is not
 * evidence that the source prose was completely compiled.
 *
 * The adapter imports no data catalogues. Tests inject the eager roots and load
 * the bestiary through its lazy entry, so this guard cannot pull monsters into
 * a production eager chunk.
 */

import {
  compileAutomationCoverage,
  type AutomationClause,
  type AutomationCoverageReceipt,
  type AutomationHandler,
  type ManualAutomationBoundary,
} from "@/lib/automation-compiler";

export const AUTOMATION_CORPUS_SCHEMAS = [
  "spell",
  "class",
  "subclass",
  "class-feature",
  "feat",
  "race",
  "race-trait",
  "background",
  "equipment",
  "magic-item",
  "invocation",
  "metamagic",
  "maneuver",
  "condition",
  "beast",
  "monster",
  "monster-entry",
  "cover-rule",
  "narrative-rule",
  "travel-rule",
  "catalogue-rule",
] as const;

export type AutomationCorpusSchema = (typeof AUTOMATION_CORPUS_SCHEMAS)[number];

export interface AutomationCorpusPresenter {
  /** Stable catalogue address without the terminal field path. */
  keyPrefix: string;
  /** Resolved catalogue records in the fixed [English, Italian] order. */
  localized: readonly [english: unknown, italian: unknown];
}

export interface AutomationCorpusManualPresenter {
  key: string;
  resolvedLocales: ReadonlyArray<"en" | "it">;
}

export interface AutomationCorpusEntity {
  entityKey: string;
  schema: AutomationCorpusSchema;
  data: Readonly<Record<string, unknown>>;
  /** The entity's composed EN/IT catalogue record, when it has one. */
  presenters?: ReadonlyArray<AutomationCorpusPresenter>;
  /** Evidence for manual data leaves whose prose lives at another key. */
  manualPresenters?: Readonly<Record<string, AutomationCorpusManualPresenter>>;
}

export interface AutomationCorpusEntityResult {
  entityKey: string;
  schema: AutomationCorpusSchema;
  receipt?: AutomationCoverageReceipt;
  errors: string[];
}

export interface AutomationCorpusSummary {
  entities: number;
  mechanicalEntities: number;
  nonMechanicalEntities: number;
  compiledPaths: number;
  manualPaths: number;
  entitiesBySchema: Record<AutomationCorpusSchema, number>;
  compiledPathsBySchema: Record<AutomationCorpusSchema, number>;
  manualPathsBySchema: Record<AutomationCorpusSchema, number>;
  manualPathsByBoundary: Record<ManualAutomationBoundary, number>;
}

export interface AutomationCorpusAudit {
  ok: boolean;
  receipts: AutomationCoverageReceipt[];
  errors: string[];
  summary: AutomationCorpusSummary;
}

type FieldRule =
  | { kind: "ignore" }
  | {
      kind: "compiled";
      handler: AutomationHandler;
      program?: true;
      allowBackReferences?: true;
    }
  | { kind: "manual-inline"; boundary: ManualAutomationBoundary }
  | { kind: "manual-reference"; boundary: ManualAutomationBoundary }
  | { kind: "object"; fields: Readonly<Record<string, FieldRule>> }
  | { kind: "array"; item: FieldRule };

const IGNORE: FieldRule = { kind: "ignore" };
const compiled = (handler: AutomationHandler): FieldRule => ({
  kind: "compiled",
  handler,
});
const object = (fields: Readonly<Record<string, FieldRule>>): FieldRule => ({
  kind: "object",
  fields,
});
const array = (item: FieldRule): FieldRule => ({ kind: "array", item });

const TRACKED_MECHANICS = object({
  tracker: compiled("tracker"),
  extraTrackers: compiled("tracker"),
  actions: compiled("action"),
});

const FEATURE_MECHANICS = object({
  tracker: compiled("tracker"),
  extraTrackers: compiled("tracker"),
  actions: compiled("action"),
  rider: compiled("action"),
  onCast: compiled("action"),
});

const SPELL_FIELDS: Readonly<Record<string, FieldRule>> = {
  id: IGNORE,
  source: IGNORE,
  effectProgram: { kind: "compiled", handler: "effect-program", program: true },
  // The canonical-runtime authored program (supersedes effectProgram at the
  // legacy-executor deletion) and the beam-count cantrip scaling flag.
  mechanicsProgram: { kind: "compiled", handler: "mechanics-program", program: true },
  cantripInstances: compiled("action"),
  level: compiled("spell-choice"),
  school: compiled("spell-choice"),
  classes: compiled("spell-choice"),
  castingTime: compiled("cast-profile"),
  reactionTrigger: compiled("cast-profile"),
  ritual: compiled("cast-profile"),
  components: compiled("cast-profile"),
  concentration: compiled("cast-profile"),
  instantaneous: compiled("cast-profile"),
  conditionRemoval: compiled("action"),
  conditionApplication: compiled("action"),
  targeting: compiled("action"),
  healingMode: compiled("action"),
  healingPool: compiled("action"),
  tempHpPool: compiled("action"),
  selfHealingFromDamage: compiled("action"),
  damageType: compiled("action"),
  damageDice: compiled("action"),
  damageAddsCastMod: compiled("action"),
  damageDicePerUpcast: compiled("action"),
  bonusDamageAgainst: compiled("action"),
  secondaryDamage: compiled("action"),
  instances: compiled("action"),
  instancesPerUpcast: compiled("action"),
  area: compiled("action"),
  damageOnSave: compiled("action"),
  damageOnMiss: compiled("action"),
  damageResolution: compiled("action"),
  primaryTargetOnly: compiled("action"),
  recurrence: compiled("action"),
  resolveOnCast: compiled("action"),
  followUp: compiled("action"),
  endsOnSuccessfulSave: compiled("action"),
  healDice: compiled("action"),
  healAddsCastMod: compiled("action"),
  healDicePerUpcast: compiled("action"),
  tempHpRoll: compiled("action"),
  effectTag: compiled("action"),
  damageTypes: compiled("action"),
  damageChoice: compiled("action"),
  saveAbility: compiled("action"),
  attackType: compiled("action"),
  weaponAttackCantrip: compiled("action"),
  grants: compiled("grant"),
  companion: {
    kind: "compiled",
    handler: "stat-block",
    allowBackReferences: true,
  },
};

const SUBCLASS_RULE = object({
  id: IGNORE,
  featureIds: compiled("system:class-progression"),
  expandedSpells: compiled("system:expanded-spells"),
  spellcasting: compiled("system:spellcasting"),
});

const CLASS_FIELDS: Readonly<Record<string, FieldRule>> = {
  id: IGNORE,
  hitDie: compiled("system:class-progression"),
  primaryAbility: compiled("system:class-progression"),
  primaryAbilityMode: compiled("system:class-progression"),
  multiclass: compiled("system:class-progression"),
  savingThrows: compiled("system:class-progression"),
  armorProficiencies: compiled("system:class-progression"),
  weaponProficiencies: compiled("system:class-progression"),
  skillChoices: compiled("system:class-progression"),
  startingEquipment: compiled("equipment"),
  grants: compiled("grant"),
  spellcasting: compiled("system:spellcasting"),
  levels: compiled("system:class-progression"),
  subclassLevel: compiled("system:class-progression"),
  subclasses: array(IGNORE),
  canSwapSpell: compiled("system:spell-preparation"),
  subclassSpellLevels: compiled("system:expanded-spells"),
};

const CLASS_FEATURE_FIELDS: Readonly<Record<string, FieldRule>> = {
  id: IGNORE,
  class: compiled("system:class-progression"),
  subclass: compiled("system:class-progression"),
  level: compiled("system:class-progression"),
  mechanics: FEATURE_MECHANICS,
  grants: compiled("grant"),
  companion: {
    kind: "compiled",
    handler: "stat-block",
    allowBackReferences: true,
  },
  source: IGNORE,
};

const FEAT_FIELDS: Readonly<Record<string, FieldRule>> = {
  id: IGNORE,
  category: compiled("system:feat-choice"),
  repeatable: compiled("system:feat-choice"),
  prereq: compiled("system:feat-choice"),
  mechanics: TRACKED_MECHANICS,
  classScope: compiled("system:fighting-style-choice"),
  grants: compiled("grant"),
  source: IGNORE,
};

const RACE_FIELDS: Readonly<Record<string, FieldRule>> = {
  id: IGNORE,
  size: compiled("grant"),
  speed: compiled("grant"),
  traits: array(IGNORE),
  source: IGNORE,
};

const BACKGROUND_FIELDS: Readonly<Record<string, FieldRule>> = {
  id: IGNORE,
  skillProficiencies: compiled("grant"),
  toolProficiency: compiled("grant"),
  feat: compiled("system:feat-choice"),
  featOptions: compiled("system:feat-choice"),
  asiOptions: compiled("system:ability-score-improvement"),
  abilityOptions: compiled("system:ability-score-improvement"),
  startingEquipment: compiled("equipment"),
  grants: compiled("grant"),
  source: IGNORE,
};

const EQUIPMENT_FIELDS: Readonly<Record<string, FieldRule>> = {
  id: IGNORE,
  category: compiled("equipment"),
  cost: compiled("equipment"),
  weight: compiled("equipment"),
  bundleSize: compiled("equipment"),
  damage: compiled("equipment"),
  properties: compiled("equipment"),
  mastery: compiled("equipment"),
  weaponCategory: compiled("equipment"),
  weaponType: compiled("equipment"),
  ammunitionId: compiled("equipment"),
  ac: compiled("equipment"),
  armorCategory: compiled("equipment"),
  stealthDisadvantage: compiled("equipment"),
  strengthReq: compiled("equipment"),
  isConsumable: compiled("item-activation"),
  mechanics: TRACKED_MECHANICS,
  potionFormula: compiled("item-activation"),
  source: IGNORE,
};

const MAGIC_ITEM_FIELDS: Readonly<Record<string, FieldRule>> = {
  id: IGNORE,
  rarity: compiled("equipment"),
  type: compiled("equipment"),
  attunement: compiled("item-activation"),
  price: compiled("equipment"),
  potionFormula: compiled("item-activation"),
  weight: compiled("equipment"),
  properties: compiled("item-activation"),
  grants: compiled("grant"),
  resources: compiled("resource"),
  durationRounds: compiled("item-activation"),
  source: IGNORE,
};

const INVOCATION_FIELDS: Readonly<Record<string, FieldRule>> = {
  id: IGNORE,
  prerequisite: compiled("system:class-progression"),
  grants: compiled("grant"),
  mechanics: object({ actions: compiled("action") }),
};

const METAMAGIC_FIELDS: Readonly<Record<string, FieldRule>> = {
  id: IGNORE,
  cost: compiled("system:metamagic-choice"),
  stacksWithPrimary: compiled("system:metamagic-choice"),
  appliesWhen: compiled("system:metamagic-choice"),
  grants: compiled("grant"),
};

const MANEUVER_FIELDS: Readonly<Record<string, FieldRule>> = {
  id: IGNORE,
  save: compiled("action"),
  slot: compiled("action"),
};

const BEAST_FIELDS: Readonly<Record<string, FieldRule>> = {
  id: IGNORE,
  cr: compiled("stat-block"),
  size: compiled("stat-block"),
  ac: compiled("stat-block"),
  hp: compiled("stat-block"),
  speeds: compiled("stat-block"),
  abilityScores: compiled("stat-block"),
  attacks: compiled("stat-block"),
  senses: compiled("stat-block"),
  traits: array({ kind: "manual-reference", boundary: "open-adjudication" }),
};

const MONSTER_FIELDS: Readonly<Record<string, FieldRule>> = {
  id: IGNORE,
  cr: compiled("stat-block"),
  sizes: compiled("stat-block"),
  type: compiled("stat-block"),
  typeTags: compiled("stat-block"),
  swarmOf: compiled("stat-block"),
  alignment: compiled("stat-block"),
  ac: compiled("stat-block"),
  initiative: compiled("stat-block"),
  hp: compiled("stat-block"),
  speeds: compiled("stat-block"),
  hover: compiled("stat-block"),
  speedNote: compiled("stat-block"),
  abilityScores: compiled("stat-block"),
  saveProficiencies: compiled("stat-block"),
  saveOverrides: compiled("stat-block"),
  skills: compiled("stat-block"),
  damageVulnerabilities: compiled("stat-block"),
  damageResistances: compiled("stat-block"),
  damageImmunities: compiled("stat-block"),
  conditionImmunities: compiled("stat-block"),
  qualifiedDefenses: compiled("stat-block"),
  senses: compiled("stat-block"),
  passivePerceptionOverride: compiled("stat-block"),
  languages: compiled("stat-block"),
  gear: compiled("stat-block"),
  xp: compiled("stat-block"),
  xpInLair: compiled("stat-block"),
  traits: array(IGNORE),
  actions: array(IGNORE),
  bonusActions: array(IGNORE),
  reactions: array(IGNORE),
  legendary: compiled("stat-block"),
  legendaryActions: array(IGNORE),
  source: IGNORE,
};

const SCHEMAS: Readonly<Record<AutomationCorpusSchema, FieldRule>> = {
  spell: object(SPELL_FIELDS),
  class: object(CLASS_FIELDS),
  subclass: SUBCLASS_RULE,
  "class-feature": object(CLASS_FEATURE_FIELDS),
  feat: object(FEAT_FIELDS),
  race: object(RACE_FIELDS),
  "race-trait": object({
    id: IGNORE,
    mechanics: TRACKED_MECHANICS,
    grants: compiled("grant"),
  }),
  background: object(BACKGROUND_FIELDS),
  equipment: object(EQUIPMENT_FIELDS),
  "magic-item": object(MAGIC_ITEM_FIELDS),
  invocation: object(INVOCATION_FIELDS),
  metamagic: object(METAMAGIC_FIELDS),
  maneuver: object(MANEUVER_FIELDS),
  condition: object({ id: IGNORE }),
  beast: object(BEAST_FIELDS),
  monster: object(MONSTER_FIELDS),
  "monster-entry": object({
    id: IGNORE,
    kind: compiled("stat-block"),
    recharge: compiled("stat-block"),
    uses: compiled("stat-block"),
    attack: compiled("stat-block"),
    toHit: compiled("stat-block"),
    reachFt: compiled("stat-block"),
    rangeFt: compiled("stat-block"),
    damage: compiled("stat-block"),
    save: compiled("stat-block"),
    dc: compiled("stat-block"),
    onSuccess: compiled("stat-block"),
    ability: compiled("stat-block"),
    atWill: compiled("stat-block"),
    perDay: compiled("stat-block"),
  }),
  "cover-rule": object({
    id: IGNORE,
    name: IGNORE,
    acBonus: compiled("rule-reference"),
    dexSaveBonus: compiled("rule-reference"),
    summary: { kind: "manual-inline", boundary: "open-adjudication" },
  }),
  "narrative-rule": object({
    id: IGNORE,
    name: IGNORE,
    summary: { kind: "manual-inline", boundary: "open-adjudication" },
  }),
  "travel-rule": object({
    id: IGNORE,
    name: IGNORE,
    perMinuteFt: compiled("rule-reference"),
    perHourMiles: compiled("rule-reference"),
    perDayMiles: compiled("rule-reference"),
    effect: { kind: "manual-inline", boundary: "open-adjudication" },
  }),
  "catalogue-rule": object({ id: IGNORE }),
};

const PRESENTER_METADATA_FIELDS = new Set([
  "name",
  "label",
  "effectWord",
  "kind",
  "variantLabel",
]);

const PRESENTER_MANUAL_FIELDS: Readonly<Record<string, ManualAutomationBoundary>> = {
  description: "open-adjudication",
  effects: "open-adjudication",
  prerequisite: "open-adjudication",
  summary: "open-adjudication",
  trigger: "open-adjudication",
  attunementReq: "open-adjudication",
  effect: "open-adjudication",
  note: "open-adjudication",
  rider: "open-adjudication",
  higherLevels: "open-adjudication",
  material: "open-adjudication",
  text: "open-adjudication",
  duration: "external-time",
  range: "spatial",
};

interface BuildState {
  mechanicalPaths: string[];
  clauses: AutomationClause[];
  errors: string[];
}

interface PresenterLeaf {
  path: string;
  field: string;
  value: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function childPath(parent: string, key: string): string {
  return parent.length === 0 ? key : `${parent}.${key}`;
}

function indexPath(parent: string, index: number): string {
  return `${parent}[${index}]`;
}

function leafPaths(
  value: unknown,
  path: string,
  errors: string[],
  allowBackReferences: boolean,
  ancestors: Set<object> = new Set<object>()
): string[] {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return [path];
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      if (allowBackReferences) return [path];
      errors.push(`cyclic mechanic value at ${path}`);
      return [];
    }
    ancestors.add(value);
    if (value.length === 0) {
      ancestors.delete(value);
      return [path];
    }
    const paths: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        errors.push(`sparse array at ${path}`);
        continue;
      }
      paths.push(
        ...leafPaths(
          value[index],
          indexPath(path, index),
          errors,
          allowBackReferences,
          ancestors
        )
      );
    }
    ancestors.delete(value);
    return paths;
  }
  if (!isRecord(value)) {
    errors.push(`non-plain mechanic value at ${path}`);
    return [];
  }
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    errors.push(`non-plain mechanic object at ${path}`);
    return [];
  }
  if (ancestors.has(value)) {
    if (allowBackReferences) return [path];
    errors.push(`cyclic mechanic value at ${path}`);
    return [];
  }
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    errors.push(`symbol field at ${path}`);
  }
  const keys = Object.keys(descriptors);
  if (keys.length === 0) {
    ancestors.delete(value);
    return [path];
  }
  const paths: string[] = [];
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      errors.push(`accessor field at ${childPath(path, key)}`);
      continue;
    }
    paths.push(
      ...leafPaths(
        descriptor.value,
        childPath(path, key),
        errors,
        allowBackReferences,
        ancestors
      )
    );
  }
  ancestors.delete(value);
  return paths;
}

function addCompiled(
  state: BuildState,
  path: string,
  value: unknown,
  rule: Extract<FieldRule, { kind: "compiled" }>
): void {
  const paths = leafPaths(value, path, state.errors, rule.allowBackReferences === true);
  if (paths.length === 0) return;
  state.mechanicalPaths.push(...paths);
  state.clauses.push({
    disposition: "compiled",
    key: `compiled:${path}`,
    handler: rule.handler,
    consumedPaths: paths,
    branches: paths,
    ...(rule.program ? { program: value } : {}),
  });
}

function inlinePresenter(
  value: unknown,
  path: string,
  boundary: ManualAutomationBoundary,
  state: BuildState,
  entityKey: string
): void {
  if (value === null) return;
  if (!isRecord(value)) {
    state.errors.push(`manual inline field ${path} is not bilingual`);
    return;
  }
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "en,it") {
    state.errors.push(`manual inline field ${path} has unknown locale fields`);
  }
  const locales: Array<"en" | "it"> = [];
  for (const [key, text] of Object.entries(value)) {
    if (
      (key === "en" || key === "it") &&
      typeof text === "string" &&
      text.trim().length > 0
    ) {
      locales.push(key);
    }
  }
  state.mechanicalPaths.push(path);
  state.clauses.push({
    disposition: "manual",
    key: `manual:${path}`,
    boundary,
    consumedPaths: [path],
    presenter: { key: `${entityKey}.${path}`, resolvedLocales: locales },
  });
}

function applyRule(
  rule: FieldRule,
  value: unknown,
  path: string,
  state: BuildState,
  input: AutomationCorpusEntity
): void {
  switch (rule.kind) {
    case "ignore":
      return;
    case "compiled":
      addCompiled(state, path, value, rule);
      return;
    case "manual-inline":
      inlinePresenter(value, path, rule.boundary, state, input.entityKey);
      return;
    case "manual-reference": {
      const paths = leafPaths(value, path, state.errors, false);
      for (const leaf of paths) {
        const presenter = input.manualPresenters?.[leaf];
        if (presenter === undefined) {
          state.errors.push(`manual data path ${leaf} has no presenter evidence`);
          continue;
        }
        state.mechanicalPaths.push(leaf);
        state.clauses.push({
          disposition: "manual",
          key: `manual:${leaf}`,
          boundary: rule.boundary,
          consumedPaths: [leaf],
          presenter,
        });
      }
      return;
    }
    case "array":
      if (!Array.isArray(value)) {
        state.errors.push(`expected array at ${path}`);
        return;
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          state.errors.push(`sparse array at ${path}`);
          continue;
        }
        applyRule(rule.item, value[index], indexPath(path, index), state, input);
      }
      return;
    case "object": {
      if (!isRecord(value)) {
        state.errors.push(`expected object at ${path || "<root>"}`);
        return;
      }
      for (const key of Object.keys(value)) {
        const child = rule.fields[key];
        const nextPath = childPath(path, key);
        if (child === undefined) {
          state.errors.push(`unknown field: ${nextPath}`);
          continue;
        }
        const childValue = value[key];
        if (childValue === undefined) {
          state.errors.push(`undefined field: ${nextPath}`);
          continue;
        }
        applyRule(child, childValue, nextPath, state, input);
      }
      return;
    }
  }
}

function presenterField(path: string): string {
  const withoutIndexes = path.replaceAll(/\[\d+\]/g, "");
  const segments = withoutIndexes.split(".");
  return segments.at(-1) ?? "";
}

function presenterLeaves(
  value: unknown,
  path: string,
  errors: string[]
): PresenterLeaf[] {
  if (typeof value === "string") {
    return [{ path, field: presenterField(path), value }];
  }
  if (Array.isArray(value)) {
    const leaves: PresenterLeaf[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        errors.push(`sparse presenter array at ${path}`);
        continue;
      }
      leaves.push(...presenterLeaves(value[index], indexPath(path, index), errors));
    }
    return leaves;
  }
  if (!isRecord(value)) {
    errors.push(`presenter leaf ${path || "<root>"} is not text`);
    return [];
  }
  const leaves: PresenterLeaf[] = [];
  for (const [key, child] of Object.entries(value)) {
    leaves.push(...presenterLeaves(child, childPath(path, key), errors));
  }
  return leaves;
}

function addCataloguePresenter(
  state: BuildState,
  presenter: AutomationCorpusPresenter
): void {
  const [english, italian] = presenter.localized;
  const enLeaves = presenterLeaves(english, "", state.errors);
  const itLeaves = presenterLeaves(italian, "", state.errors);
  const enByPath = new Map(enLeaves.map((leaf) => [leaf.path, leaf]));
  const itByPath = new Map(itLeaves.map((leaf) => [leaf.path, leaf]));
  const paths = new Set([...enByPath.keys(), ...itByPath.keys()]);

  for (const path of [...paths].sort()) {
    const en = enByPath.get(path);
    const it = itByPath.get(path);
    if (en === undefined || it === undefined) {
      state.errors.push(`presenter locale path mismatch: ${presenter.keyPrefix}.${path}`);
      continue;
    }
    if (en.value.trim().length === 0 || it.value.trim().length === 0) {
      state.errors.push(`empty presenter text: ${presenter.keyPrefix}.${path}`);
    }
    if (en.field !== it.field) {
      state.errors.push(`presenter field mismatch: ${presenter.keyPrefix}.${path}`);
      continue;
    }
    if (PRESENTER_METADATA_FIELDS.has(en.field)) continue;
    const boundary = PRESENTER_MANUAL_FIELDS[en.field];
    if (boundary === undefined) {
      state.errors.push(`unknown presenter field: ${presenter.keyPrefix}.${path}`);
      continue;
    }
    const mechanicalPath = `presenter.${presenter.keyPrefix}.${path}`;
    state.mechanicalPaths.push(mechanicalPath);
    state.clauses.push({
      disposition: "manual",
      key: `manual:${mechanicalPath}`,
      boundary,
      consumedPaths: [mechanicalPath],
      presenter: {
        key: `${presenter.keyPrefix}.${path}`,
        resolvedLocales: ["en", "it"],
      },
    });
  }
}

export function compileAutomationCorpusEntity(
  input: AutomationCorpusEntity
): AutomationCorpusEntityResult {
  const state: BuildState = { mechanicalPaths: [], clauses: [], errors: [] };
  applyRule(SCHEMAS[input.schema], input.data, "", state, input);
  for (const presenter of input.presenters ?? []) {
    addCataloguePresenter(state, presenter);
  }

  const compiled = compileAutomationCoverage({
    entityKey: input.entityKey,
    mechanicalPaths: state.mechanicalPaths,
    clauses: state.clauses,
    ...(state.mechanicalPaths.length === 0 ? { nonMechanical: true as const } : {}),
  });
  if (!compiled.ok) state.errors.push(...compiled.errors);
  return {
    entityKey: input.entityKey,
    schema: input.schema,
    ...(compiled.ok ? { receipt: compiled.receipt } : {}),
    errors: [...new Set(state.errors)].sort(),
  };
}

function emptySchemaCounts(): Record<AutomationCorpusSchema, number> {
  return Object.fromEntries(
    AUTOMATION_CORPUS_SCHEMAS.map((schema) => [schema, 0])
  ) as Record<AutomationCorpusSchema, number>;
}

function manualBoundary(
  handler: AutomationCoverageReceipt["clauses"][number]["handler"]
): ManualAutomationBoundary | null {
  switch (handler) {
    case "manual:spatial":
      return "spatial";
    case "manual:narrative":
      return "narrative";
    case "manual:external-time":
      return "external-time";
    case "manual:open-adjudication":
      return "open-adjudication";
    default:
      return null;
  }
}

export function compileAutomationCorpus(
  entities: ReadonlyArray<AutomationCorpusEntity>
): AutomationCorpusAudit {
  const receipts: AutomationCoverageReceipt[] = [];
  const errors: string[] = [];
  const entitiesBySchema = emptySchemaCounts();
  const compiledPathsBySchema = emptySchemaCounts();
  const manualPathsBySchema = emptySchemaCounts();
  const manualPathsByBoundary: Record<ManualAutomationBoundary, number> = {
    spatial: 0,
    narrative: 0,
    "external-time": 0,
    "open-adjudication": 0,
  };
  let mechanicalEntities = 0;
  let nonMechanicalEntities = 0;
  let compiledPaths = 0;
  let manualPaths = 0;
  const seen = new Set<string>();

  for (const entity of entities) {
    entitiesBySchema[entity.schema] += 1;
    if (seen.has(entity.entityKey)) {
      errors.push(`duplicate entity key: ${entity.entityKey}`);
      continue;
    }
    seen.add(entity.entityKey);
    const result = compileAutomationCorpusEntity(entity);
    errors.push(...result.errors.map((error) => `${entity.entityKey}: ${error}`));
    if (result.receipt === undefined) continue;
    receipts.push(result.receipt);
    if (result.receipt.classification === "mechanical") mechanicalEntities += 1;
    else nonMechanicalEntities += 1;
    for (const clause of result.receipt.clauses) {
      const boundary = manualBoundary(clause.handler);
      if (boundary === null) {
        const count = clause.consumedPaths.length;
        compiledPaths += count;
        compiledPathsBySchema[entity.schema] += count;
        continue;
      }
      const count = clause.consumedPaths.length;
      manualPaths += count;
      manualPathsBySchema[entity.schema] += count;
      manualPathsByBoundary[boundary] += count;
    }
  }

  const summary: AutomationCorpusSummary = {
    entities: entities.length,
    mechanicalEntities,
    nonMechanicalEntities,
    compiledPaths,
    manualPaths,
    entitiesBySchema,
    compiledPathsBySchema,
    manualPathsBySchema,
    manualPathsByBoundary,
  };
  return {
    ok: errors.length === 0 && receipts.length === entities.length,
    receipts,
    errors: [...new Set(errors)].sort(),
    summary,
  };
}

export function formatAutomationCorpusAudit(audit: AutomationCorpusAudit): string {
  return JSON.stringify({ summary: audit.summary, errors: audit.errors }, null, 2);
}
