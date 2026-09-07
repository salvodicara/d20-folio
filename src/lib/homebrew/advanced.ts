import {
  ABILITIES,
  CONDITIONS,
  DAMAGE_TYPES,
  blankEffect,
  effectFields,
  type AuthoringFamily,
  type FieldDescriptor,
} from "./model";
import type { JsonValue } from "../library/model";
export type AdvancedRowKind =
  | "resource"
  | "program"
  | "step"
  | "policy"
  | "dependency"
  | "effect"
  | "defense"
  | "skill";
export interface AdvancedCollection {
  key: string;
  kind: AdvancedRowKind;
  max: number;
  fields: readonly FieldDescriptor[];
  collections?: readonly AdvancedCollection[];
}
const t = (key: string): FieldDescriptor => ({ key, type: "text", group: "advanced" });
const n = (key: string, min = 0, max = 100000): FieldDescriptor => ({
  key,
  type: "number",
  group: "advanced",
  min,
  max,
});
const s = (key: string, options: readonly string[]): FieldDescriptor => ({
  key,
  type: "select",
  group: "advanced",
  options,
});
const f = (key: string): FieldDescriptor => ({ key, type: "formula", group: "advanced" });
const b = (key: string): FieldDescriptor => ({ key, type: "boolean", group: "advanced" });
export function advancedFields(family: AuthoringFamily): readonly FieldDescriptor[] {
  if (family === "monster")
    return [
      s("size", ["medium", "tiny", "small", "large", "huge", "gargantuan"]),
      s("creatureType", [
        "aberration",
        "beast",
        "celestial",
        "construct",
        "dragon",
        "elemental",
        "fey",
        "fiend",
        "giant",
        "humanoid",
        "monstrosity",
        "ooze",
        "plant",
        "undead",
      ]),
      t("alignment"),
      n("armorClass", 0, 40),
      n("maxHp", 1),
      f("hpFormula"),
      s("challengeRating", [
        "0",
        "1/8",
        "1/4",
        "1/2",
        ...Array.from({ length: 30 }, (_, i) => String(i + 1)),
      ]),
      n("initiative", -30, 40),
      ...ABILITIES.flatMap((a) => [n(a, 1, 30), n(a + "Save", -30, 40)]),
      ...["walk", "fly", "swim", "climb", "burrow"].map((m) => n(m + "Speed", 0, 1000)),
      ...["darkvision", "blindsight", "tremorsense", "truesight"].map((m) =>
        n(m, 0, 1000)
      ),
      n("passivePerception", 0, 50),
      t("languages"),
    ];
  if (family === "campaign-rule")
    return [
      s("domain", ["combat", "exploration", "rest", "character"]),
      s("application", ["narrative", "typed"]),
      t("replacesMechanicId"),
      t("agreement"),
      n("priority", -1000, 1000),
    ];
  return [];
}
export function advancedRowFields(kind: AdvancedRowKind): readonly FieldDescriptor[] {
  switch (kind) {
    case "effect":
      return effectFields();
    case "resource":
      return [
        t("id"),
        t("name"),
        n("capacity", 1, 1000),
        s("recoveryBoundary", ["none", "short-rest", "long-rest", "dawn", "turn-start"]),
        s("recoveryKind", ["none", "full", "formula", "recharge"]),
        f("recoveryFormula"),
        n("rechargeThreshold", 0, 6),
      ];
    case "program":
      return [
        t("id"),
        t("name"),
        t("source"),
        s("kind", [
          "action",
          "trait",
          "bonus-action",
          "reaction",
          "legendary",
          "lair",
          "multiattack",
        ]),
        s("activation", [
          "action",
          "passive",
          "bonus-action",
          "reaction",
          "legendary",
          "lair",
        ]),
        s("trigger", [
          "none",
          "turn-start",
          "turn-end",
          "attack-hit",
          "attack-miss",
          "damage-taken",
          "creature-moves",
          "spell-cast",
          "save-failed",
        ]),
        t("triggerNote"),
        s("resolution", ["none", "attack", "save"]),
        n("attackBonus", -30, 40),
        s("saveAbility", ["none", ...ABILITIES]),
        n("saveDc", 0, 40),
        n("reach", 0, 1000),
        n("rangeNormal", 0, 10000),
        n("rangeLong", 0, 10000),
        s("areaShape", [
          "none",
          "cone",
          "cube",
          "cylinder",
          "emanation",
          "line",
          "sphere",
        ]),
        n("areaSize", 0, 10000),
        t("resourceId"),
        n("resourceCost", 0, 1000),
        s("frequency", [
          "unlimited",
          "once-per-turn",
          "once-per-round",
          "once-per-combat",
        ]),
        b("concentration"),
      ];
    case "step":
      return [s("kind", ["program"]), t("programId"), n("count", 1, 16)];
    case "policy":
      return [
        t("id"),
        s("fact", ["armor-class", "speed", "attack", "save", "dc", "resource-capacity"]),
        s("operation", ["add", "set"]),
        n("amount", -1000, 1000),
        s("target", ["self", "allies", "enemies", "all"]),
        t("resourceId"),
      ];
    case "dependency":
      return [t("mechanicId"), s("relation", ["required", "conflicting"])];
    case "defense":
      return [
        s("kind", ["resistance", "immunity", "vulnerability", "condition-immunity"]),
        s("damageType", ["", ...DAMAGE_TYPES]),
        s("condition", ["", ...CONDITIONS]),
      ];
    case "skill":
      return [
        s("skill", [
          "acrobatics",
          "animal-handling",
          "arcana",
          "athletics",
          "deception",
          "history",
          "insight",
          "intimidation",
          "investigation",
          "medicine",
          "nature",
          "perception",
          "performance",
          "persuasion",
          "religion",
          "sleight-of-hand",
          "stealth",
          "survival",
        ]),
        n("bonus", -30, 40),
      ];
  }
}
function collection(key: string, kind: AdvancedRowKind, max = 32): AdvancedCollection {
  return {
    key,
    kind,
    max,
    fields: advancedRowFields(kind),
    ...(kind === "program"
      ? {
          collections: [collection("effects", "effect"), collection("steps", "step", 16)],
        }
      : {}),
  };
}
export function advancedCollections(
  family: AuthoringFamily
): readonly AdvancedCollection[] {
  if (family !== "monster" && family !== "campaign-rule") return [];
  return [
    collection("resources", "resource"),
    collection("programs", "program"),
    ...(family === "monster"
      ? [collection("defenses", "defense"), collection("skills", "skill")]
      : [collection("policies", "policy"), collection("dependencies", "dependency")]),
  ];
}
export function blankAdvancedRow(kind: AdvancedRowKind): Record<string, JsonValue> {
  if (kind === "effect") return { ...blankEffect() };
  const row: Record<string, JsonValue> = {};
  for (const field of advancedRowFields(kind))
    row[field.key] =
      field.type === "number"
        ? (field.min ?? 0)
        : field.type === "boolean"
          ? false
          : field.type === "select"
            ? (field.options?.[0] ?? "")
            : "";
  if (kind === "program")
    Object.assign(row, { source: "homebrew", attackBonus: 0, effects: [], steps: [] });
  if (kind === "policy") row.amount = 0;
  return row;
}

/** Authoring declarations only: the future shared engine owns execution and receipts. */
export interface AdvancedResource {
  id: string;
  name: string;
  capacity: number;
  recoveryBoundary: "none" | "short-rest" | "long-rest" | "dawn" | "turn-start";
  recoveryKind: "none" | "full" | "formula" | "recharge";
  recoveryFormula: string;
  rechargeThreshold: number;
}
export interface MultiattackStep {
  kind: "program";
  programId: string;
  count: number;
}
export interface ActionProgram {
  id: string;
  name: string;
  source: string;
  kind:
    | "action"
    | "trait"
    | "bonus-action"
    | "reaction"
    | "legendary"
    | "lair"
    | "multiattack";
  activation: "action" | "passive" | "bonus-action" | "reaction" | "legendary" | "lair";
  trigger:
    | "none"
    | "turn-start"
    | "turn-end"
    | "attack-hit"
    | "attack-miss"
    | "damage-taken"
    | "creature-moves"
    | "spell-cast"
    | "save-failed";
  triggerNote: string;
  resolution: "none" | "attack" | "save";
  attackBonus: number;
  saveAbility: "none" | (typeof ABILITIES)[number];
  saveDc: number;
  reach: number;
  rangeNormal: number;
  rangeLong: number;
  areaShape: "none" | "cone" | "cube" | "cylinder" | "emanation" | "line" | "sphere";
  areaSize: number;
  resourceId: string;
  resourceCost: number;
  frequency: "unlimited" | "once-per-turn" | "once-per-round" | "once-per-combat";
  concentration: boolean;
  effects: import("./model").TypedEffect[];
  steps: MultiattackStep[];
}
export interface RulePolicy {
  id: string;
  fact: "armor-class" | "speed" | "attack" | "save" | "dc" | "resource-capacity";
  operation: "add" | "set";
  amount: number;
  target: "self" | "allies" | "enemies" | "all";
  resourceId: string;
}
export interface RuleDependency {
  mechanicId: string;
  relation: "required" | "conflicting";
}
