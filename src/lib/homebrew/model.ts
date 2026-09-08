import { initializeClassData, isClassFamily } from "./classes";
import { originFields, initializeOriginData, isOriginFamily } from "./origins";
import { advancedFields, advancedCollections } from "./advanced";
import { blankDefinition, type LibraryDefinition } from "../library/model";
export const ORIGIN_FAMILIES = ["species", "feat", "background"] as const;
export const BASE_FAMILIES = ["weapon", "equipment", "spell", "feature"] as const;
export type BaseFamily = (typeof BASE_FAMILIES)[number];
export const AUTHORING_FAMILIES = [
  ...BASE_FAMILIES,
  "monster",
  "campaign-rule",
  ...ORIGIN_FAMILIES,
  "class",
  "subclass",
] as const;
export type AuthoringFamily = (typeof AUTHORING_FAMILIES)[number];
export interface FieldDescriptor {
  key: string;
  type: "text" | "number" | "boolean" | "select" | "formula";
  options?: readonly string[];
  min?: number;
  max?: number;
  group: string;
  multiline?: boolean;
}
const text = (key: string, group: string, multiline = false): FieldDescriptor => ({
  key,
  type: "text",
  group,
  multiline,
});
const number = (key: string, group: string, min = 0, max = 100000): FieldDescriptor => ({
  key,
  type: "number",
  group,
  min,
  max,
});
const bool = (key: string, group: string): FieldDescriptor => ({
  key,
  type: "boolean",
  group,
});
const select = (
  key: string,
  group: string,
  options: readonly string[]
): FieldDescriptor => ({ key, type: "select", group, options });
const formula = (key: string, group: string): FieldDescriptor => ({
  key,
  type: "formula",
  group,
});
export const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;
export const ABILITIES = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const;
export const CONDITIONS = [
  "blinded",
  "charmed",
  "deafened",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
  "exhaustion",
] as const;
const activation = select("activation", "activation", [
  "passive",
  "action",
  "bonus-action",
  "reaction",
  "time",
]);
const recovery = [
  select("recoveryBoundary", "resources", ["none", "short-rest", "long-rest", "dawn"]),
  select("recoveryKind", "resources", ["none", "full", "formula"]),
  formula("recoveryFormula", "resources"),
];
const common = [
  number("authoringVersion", "provenance", 1, 1),
  select("edition", "provenance", ["2024"]),
  text("source", "provenance"),
  text("sourceVersion", "provenance"),
  text("mechanicId", "provenance"),
  text("tableNote", "notes", true),
];
const physical = [number("weight", "physical"), number("cost", "physical")];
const fields: Record<BaseFamily, readonly FieldDescriptor[]> = {
  weapon: [
    ...common,
    select("category", "weapon", ["simple", "martial"]),
    select("mode", "weapon", ["melee", "ranged"]),
    formula("damageFormula", "damage"),
    select("damageType", "damage", DAMAGE_TYPES),
    formula("versatileFormula", "damage"),
    number("reach", "range", 0, 1000),
    number("rangeNormal", "range", 0, 10000),
    number("rangeLong", "range", 0, 10000),
    ...physical,
    select("mastery", "weapon", [
      "none",
      "cleave",
      "graze",
      "nick",
      "push",
      "sap",
      "slow",
      "topple",
      "vex",
    ]),
    ...[
      "Ammunition",
      "Finesse",
      "Heavy",
      "Light",
      "Loading",
      "Reach",
      "Thrown",
      "TwoHanded",
      "Versatile",
    ].map((k) => bool("property" + k, "properties")),
    number("attackBonus", "damage", -20, 20),
    number("damageBonus", "damage", -20, 20),
  ],
  equipment: [
    ...common,
    select("category", "equipment", ["gear", "armor", "shield", "tool", "consumable"]),
    ...physical,
    select("rarity", "equipment", [
      "common",
      "uncommon",
      "rare",
      "very-rare",
      "legendary",
      "artifact",
    ]),
    bool("attunement", "equipment"),
    number("armorBase", "armor", 0, 30),
    select("armorDex", "armor", ["none", "full", "capped"]),
    number("armorDexCap", "armor", 0, 10),
    number("shieldBonus", "armor", 0, 10),
    bool("consumable", "resources"),
    number("maxCharges", "resources", 0, 1000),
    ...recovery,
  ],
  spell: [
    ...common,
    number("level", "spell", 0, 9),
    select("school", "spell", [
      "abjuration",
      "conjuration",
      "divination",
      "enchantment",
      "evocation",
      "illusion",
      "necromancy",
      "transmutation",
    ]),
    { ...activation, options: ["action", "bonus-action", "reaction", "time"] },
    text("activationTime", "activation"),
    text("reactionCondition", "activation"),
    select("rangeKind", "targeting", ["self", "touch", "distance", "sight", "unlimited"]),
    number("rangeDistance", "targeting", 0, 100000),
    select("areaShape", "targeting", [
      "none",
      "cone",
      "cube",
      "cylinder",
      "emanation",
      "line",
      "sphere",
    ]),
    number("areaSize", "targeting", 0, 10000),
    select("durationKind", "duration", [
      "instant",
      "round",
      "minute",
      "hour",
      "until-dispelled",
    ]),
    number("durationAmount", "duration", 0, 100000),
    bool("concentration", "duration"),
    bool("ritual", "spell"),
    bool("verbal", "components"),
    bool("somatic", "components"),
    bool("material", "components"),
    text("materialDescription", "components", true),
    number("materialCost", "components"),
    bool("materialConsumed", "components"),
    select("resolution", "resolution", ["none", "attack", "save"]),
    select("saveAbility", "resolution", ["none", ...ABILITIES]),
    select("dcPolicy", "resolution", ["caster", "fixed"]),
    number("fixedDc", "resolution", 0, 40),
    formula("upcastFormula", "scaling"),
    select("scalingDependency", "scaling", ["none", "slot-level", "character-level"]),
  ],
  feature: [
    ...common,
    number("acquisitionLevel", "feature", 1, 20),
    { ...activation, options: ["passive", "action", "bonus-action", "reaction"] },
    text("reactionCondition", "activation"),
    select("ability", "feature", ["none", ...ABILITIES]),
    number("maxUses", "resources", 0, 1000),
    ...recovery,
    select("frequency", "resources", [
      "unlimited",
      "once-per-turn",
      "once-per-round",
      "once-per-combat",
    ]),
    select("prerequisite", "feature", ["none", "level", "ability", "spellcasting"]),
    number("prerequisiteLevel", "feature", 0, 20),
    select("prerequisiteAbility", "feature", ["none", ...ABILITIES]),
    number("prerequisiteScore", "feature", 0, 30),
    number("resourceCost", "resources", 0, 1000),
  ],
};
export function baseFields(family: BaseFamily): readonly FieldDescriptor[] {
  return fields[family];
}
const effects = [
  select("kind", "effect", ["damage", "healing", "temporary-hp", "condition"]),
  formula("formula", "effect"),
  select("damageType", "effect", ["", ...DAMAGE_TYPES]),
  select("condition", "effect", ["", ...CONDITIONS]),
  select("target", "effect", ["self", "one", "area"]),
  select("gate", "effect", ["always", "hit", "failed-save", "successful-save"]),
  select("durationKind", "effect", [
    "instant",
    "round",
    "minute",
    "hour",
    "until-removed",
  ]),
  number("durationAmount", "effect", 0, 100000),
  select("stacking", "effect", ["replace", "independent"]),
  text("sourceId", "effect"),
];
export function effectFields(): readonly FieldDescriptor[] {
  return effects;
}
export interface TypedEffect {
  kind: "damage" | "healing" | "temporary-hp" | "condition";
  formula: string;
  damageType: string;
  condition: string;
  target: "self" | "one" | "area";
  gate: "always" | "hit" | "failed-save" | "successful-save";
  durationKind: "instant" | "round" | "minute" | "hour" | "until-removed";
  durationAmount: number;
  stacking: "replace" | "independent";
  sourceId: string;
}
export function blankEffect(): TypedEffect {
  return {
    kind: "damage",
    formula: "1d6",
    damageType: "force",
    condition: "",
    target: "one",
    gate: "always",
    durationKind: "instant",
    durationAmount: 0,
    stacking: "replace",
    sourceId: "",
  };
}
export interface CommonData {
  authoringVersion: 1;
  edition: "2024";
  source: string;
  sourceVersion: string;
  mechanicId: string;
  tableNote: string;
  unsupported: string[];
  effects: TypedEffect[];
}
export interface WeaponData extends CommonData {
  category: "simple" | "martial";
  mode: "melee" | "ranged";
  damageFormula: string;
  damageType: (typeof DAMAGE_TYPES)[number];
  versatileFormula: string;
  reach: number;
  rangeNormal: number;
  rangeLong: number;
  weight: number;
  cost: number;
  mastery: string;
  propertyAmmunition: boolean;
  propertyFinesse: boolean;
  propertyHeavy: boolean;
  propertyLight: boolean;
  propertyLoading: boolean;
  propertyReach: boolean;
  propertyThrown: boolean;
  propertyTwoHanded: boolean;
  propertyVersatile: boolean;
  attackBonus: number;
  damageBonus: number;
}
interface Recovery {
  recoveryBoundary: "none" | "short-rest" | "long-rest" | "dawn";
  recoveryKind: "none" | "full" | "formula";
  recoveryFormula: string;
}
export interface EquipmentData extends CommonData, Recovery {
  category: "gear" | "armor" | "shield" | "tool" | "consumable";
  weight: number;
  cost: number;
  rarity: string;
  attunement: boolean;
  armorBase: number;
  armorDex: "none" | "full" | "capped";
  armorDexCap: number;
  shieldBonus: number;
  consumable: boolean;
  maxCharges: number;
}
export interface SpellData extends CommonData {
  level: number;
  school: string;
  activation: "action" | "bonus-action" | "reaction" | "time";
  activationTime: string;
  reactionCondition: string;
  rangeKind: "self" | "touch" | "distance" | "sight" | "unlimited";
  rangeDistance: number;
  areaShape: string;
  areaSize: number;
  durationKind: string;
  durationAmount: number;
  concentration: boolean;
  ritual: boolean;
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  materialDescription: string;
  materialCost: number;
  materialConsumed: boolean;
  resolution: "none" | "attack" | "save";
  saveAbility: string;
  dcPolicy: "caster" | "fixed";
  fixedDc: number;
  upcastFormula: string;
  scalingDependency: "none" | "slot-level" | "character-level";
}
export interface FeatureData extends CommonData, Recovery {
  acquisitionLevel: number;
  activation: "passive" | "action" | "bonus-action" | "reaction";
  reactionCondition: string;
  ability: string;
  maxUses: number;
  frequency: string;
  prerequisite: "none" | "level" | "ability" | "spellcasting";
  prerequisiteLevel: number;
  prerequisiteAbility: string;
  prerequisiteScore: number;
  resourceCost: number;
}
export type BaseContent =
  | { family: "weapon"; data: WeaponData }
  | { family: "equipment"; data: EquipmentData }
  | { family: "spell"; data: SpellData }
  | { family: "feature"; data: FeatureData };
/** Explicit initialization only. Callers must not replace an existing payload implicitly. */
export function initializeDefinition(family: AuthoringFamily): LibraryDefinition {
  const d = blankDefinition(family);
  for (const f of authoringFields(family))
    d.payload.data[f.key] =
      f.type === "boolean"
        ? false
        : f.type === "number"
          ? (f.min ?? 0)
          : f.type === "select"
            ? (f.options?.[0] ?? "")
            : "";
  Object.assign(d.payload.data, {
    authoringVersion: 1,
    edition: "2024",
    source: "homebrew",
    sourceVersion: "1",
    mechanicId: "custom",
    effects: [],
    unsupported: [],
  });
  if (family === "weapon")
    Object.assign(d.payload.data, {
      damageFormula: "1d6",
      damageType: "slashing",
      reach: 1.5,
      attackBonus: 0,
      damageBonus: 0,
    });
  if (family === "spell") Object.assign(d.payload.data, { verbal: true, somatic: true });
  for (const c of advancedCollections(family)) d.payload.data[c.key] = [];
  if (family === "monster")
    Object.assign(d.payload.data, {
      armorClass: 10,
      maxHp: 1,
      hpFormula: "1",
      initiative: 0,
      ...Object.fromEntries(
        ABILITIES.flatMap((a) => [
          [a, 10],
          [a + "Save", 0],
        ])
      ),
    });
  if (family === "campaign-rule") d.payload.data.priority = 0;
  if (isOriginFamily(family)) Object.assign(d.payload.data, initializeOriginData(family));
  if (isClassFamily(family)) Object.assign(d.payload.data, initializeClassData(family));
  return d;
}

export function authoringFields(family: AuthoringFamily): readonly FieldDescriptor[] {
  return BASE_FAMILIES.includes(family as BaseFamily)
    ? baseFields(family as BaseFamily)
    : [...common, ...advancedFields(family), ...originFields(family)];
}

/** Resource identities also address the separate prepared-state map. */
export const validResourceId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
