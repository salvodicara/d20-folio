import {
  ABILITIES,
  ORIGIN_FAMILIES,
  DAMAGE_TYPES,
  type AuthoringFamily,
  type FieldDescriptor,
} from "./model";
import { equal } from "../shared/model";
import {
  libraryPath,
  parseEntry,
  parseDefinition,
  type LibraryDefinition,
  type LibraryVersion,
  type LibraryRef,
  type Provenance,
  type JsonValue,
} from "../library/model";
import { conformDefinition, type AuthoringDiagnostic } from "./conformance";

export { ORIGIN_FAMILIES } from "./model";
export type OriginFamily = (typeof ORIGIN_FAMILIES)[number];
export type Ability = (typeof ABILITIES)[number];
export const ORIGIN_SKILLS = [
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
] as const;
export const MOVEMENT_MODES = ["walk", "fly", "swim", "climb", "burrow"] as const;
export const SENSES = ["darkvision", "blindsight", "tremorsense", "truesight"] as const;
export type ProficiencyCategory = "skill" | "tool" | "language" | "save";
export type OriginPrerequisite =
  | { kind: "all" | "any"; requirements: OriginPrerequisite[] }
  | { kind: "level"; minimum: number }
  | { kind: "ability"; ability: Ability; minimum: number }
  | { kind: "proficiency"; category: ProficiencyCategory; id: string }
  | { kind: "feat"; mechanicId: string; dependency?: string }
  | { kind: "spellcasting" };
export type OriginBenefit =
  | { kind: "spellcasting"; ability: Ability; policy: "ability" }
  | { kind: "ability"; ability: Ability; amount: number }
  | { kind: "size"; size: "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan" }
  | { kind: "movement"; mode: (typeof MOVEMENT_MODES)[number]; meters: number }
  | { kind: "sense"; sense: (typeof SENSES)[number]; meters: number }
  | { kind: "proficiency"; category: ProficiencyCategory; id: string }
  | { kind: "resistance"; damageType: (typeof DAMAGE_TYPES)[number] }
  | { kind: "reference"; dependency: string };
export interface OriginOption {
  id: string;
  name: string;
  benefits: OriginBenefit[];
}
export interface OriginChoice {
  id: string;
  name: string;
  count: number;
  options: OriginOption[];
  parent: { choiceId: string; optionId: string } | null;
}
export interface OriginDependency {
  source: LibraryRef;
  sourceVersion: number;
  provenance: Provenance | null;
  definition: LibraryDefinition;
}
export interface OriginDeclarations {
  prerequisites: OriginPrerequisite[];
  benefits: OriginBenefit[];
  choices: OriginChoice[];
  dependencies: Record<string, OriginDependency>;
}
export const isOriginFamily = (family: string): family is OriginFamily =>
  (ORIGIN_FAMILIES as readonly string[]).includes(family);
const s = (key: string, options: readonly string[]): FieldDescriptor => ({
  key,
  type: "select",
  group: "origin",
  options,
});
const n = (key: string, max = 1000): FieldDescriptor => ({
  key,
  type: "number",
  group: "origin",
  min: 0,
  max,
});
const t = (key: string): FieldDescriptor => ({ key, type: "text", group: "origin" });
export function originFields(family: AuthoringFamily): readonly FieldDescriptor[] {
  if (family === "species")
    return [
      s("size", ["medium", "small", "tiny", "large", "huge", "gargantuan"]),
      ...MOVEMENT_MODES.map((m) => n(m + "Speed")),
      ...SENSES.map((x) => n(x)),
    ];
  if (family === "feat")
    return [
      s("category", ["origin", "general", "fighting-style", "epic-boon"]),
      { key: "repeatable", type: "boolean", group: "origin" },
    ];
  if (family === "background")
    return [
      s("ability1", ABILITIES),
      s("ability2", ABILITIES),
      s("ability3", ABILITIES),
      s("skill1", ORIGIN_SKILLS),
      s("skill2", ORIGIN_SKILLS),
      t("tool"),
      t("originFeat"),
      n("equipmentGold", 100000),
    ];
  return [];
}
export function initializeOriginData(family: OriginFamily): Record<string, JsonValue> {
  return {
    prerequisites: [],
    benefits: [],
    choices: [],
    dependencies: {},
    ...(family === "species" ? { walkSpeed: 9 } : {}),
    ...(family === "background"
      ? {
          ability1: "strength",
          ability2: "dexterity",
          ability3: "constitution",
          skill1: "athletics",
          skill2: "acrobatics",
          equipment: [],
        }
      : {}),
  };
}
export const blankOriginBenefit = (): OriginBenefit => ({
  kind: "ability",
  ability: "strength",
  amount: 1,
});
export const blankOriginOption = (): OriginOption => ({ id: "", name: "", benefits: [] });
export const blankOriginChoice = (): OriginChoice => ({
  id: "",
  name: "",
  count: 1,
  options: [],
  parent: null,
});
/** JSON tuple identity avoids delimiter collisions; path segments use encodeURIComponent. */
export const dependencyKey = (
  version: Pick<LibraryVersion, "ownerUid" | "entryId" | "version">
): string => JSON.stringify([version.ownerUid, version.entryId, version.version]);
export const originNodePath = (parent: string, key: string): string =>
  parent + "/" + encodeURIComponent(key);
export const originRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const integer = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const nonempty = (v: unknown) => typeof v === "string" && !!v.trim() && v.length <= 10000;
const token = (v: unknown, values: readonly string[]) =>
  typeof v === "string" && values.includes(v);
const id = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);

/** Includes unknown declarations verbatim; diagnostics never rewrite authored input. */
export function conformOriginDefinition(
  definition: LibraryDefinition
): AuthoringDiagnostic[] {
  const issues: AuthoringDiagnostic[] = [];
  const add = (
    path: string,
    code: string,
    severity: AuthoringDiagnostic["severity"] = "invalid"
  ) => issues.push({ path, code, severity });
  const known = (v: Record<string, unknown>, fields: string[], path: string) => {
    for (const key of Object.keys(v))
      if (!fields.includes(key))
        add(path + "." + key, "unsupported-field", "unsupported");
  };
  const list = (v: unknown, path: string, max = 32): unknown[] => {
    if (!Array.isArray(v) || v.length > max) {
      add(path, "invalid-collection");
      return [];
    }
    return v;
  };
  const proficiency = (v: Record<string, unknown>, path: string) => {
    if (!token(v.category, ["skill", "tool", "language", "save"]))
      add(path + ".category", "unsupported-option", "unsupported");
    if (!nonempty(v.id)) add(path + ".id", "required");
    else if (
      (v.category === "skill" && !token(v.id, ORIGIN_SKILLS)) ||
      (v.category === "save" && !token(v.id, ABILITIES))
    )
      add(path + ".id", "unsupported-option", "unsupported");
  };
  const prerequisite = (
    value: unknown,
    path: string,
    reference: (value: unknown, path: string, allowed?: string[]) => void,
    depth = 0
  ): void => {
    const v = originRecord(value);
    if (!v || depth > 8) {
      add(path, "invalid-prerequisite");
      return;
    }
    let fields = ["kind"];
    switch (v.kind) {
      case "all":
      case "any":
        fields.push("requirements");
        {
          const requirements = list(v.requirements, path + ".requirements");
          if (!requirements.length) add(path, "empty-prerequisite");
          requirements.forEach((r, i) =>
            prerequisite(r, path + ".requirements." + String(i), reference, depth + 1)
          );
        }
        break;
      case "level":
        fields.push("minimum");
        if (!integer(v.minimum, 1, 20)) add(path + ".minimum", "invalid-number");
        break;
      case "ability":
        fields.push("ability", "minimum");
        if (!token(v.ability, ABILITIES))
          add(path + ".ability", "unsupported-option", "unsupported");
        if (!integer(v.minimum, 1, 30)) add(path + ".minimum", "invalid-number");
        break;
      case "proficiency":
        fields.push("category", "id");
        proficiency(v, path);
        break;
      case "feat":
        fields.push("mechanicId", "dependency");
        if (!nonempty(v.mechanicId)) add(path + ".mechanicId", "required");
        if (Object.hasOwn(v, "dependency")) {
          reference(v.dependency, path + ".dependency", ["feat"]);
          if (typeof v.dependency === "string") {
            const dependency = originRecord(table[v.dependency]);
            const definition = originRecord(dependency?.definition);
            const data = originRecord(originRecord(definition?.payload)?.data);
            if (data && data.mechanicId !== v.mechanicId)
              add(path + ".mechanicId", "prerequisite-mechanic-mismatch");
          }
        } else if (v.mechanicId === "custom")
          add(path + ".mechanicId", "ambiguous-feat-prerequisite", "unsupported");
        break;
      case "spellcasting":
        break;
      default:
        add(path + ".kind", "unsupported-predicate", "unsupported");
        fields = Object.keys(v);
    }
    known(v, fields, path);
  };
  const root = definition.payload.data;
  const dependencies = originRecord(root.dependencies);
  if (!dependencies || Object.keys(dependencies).length > 31)
    add("payload.data.dependencies", "invalid-dependencies");
  const table = dependencies ?? {};
  const edges = new Map<string, string[]>();
  const checkNode = (node: LibraryDefinition, nodeKey: string, prefix: string) => {
    const d = node.payload.data;
    const references: string[] = [];
    edges.set(nodeKey, references);
    const reference = (
      value: unknown,
      path: string,
      allowed = ["feat", "feature", "spell"]
    ) => {
      if (typeof value !== "string" || !originRecord(table[value])) {
        add(path, "missing-reference");
        return;
      }
      const dep = originRecord(table[value]) ?? {};
      const target = originRecord(dep.definition);
      if (!target || !allowed.includes(String(target.family)))
        add(path, "incompatible-reference");
      references.push(value);
    };
    const benefit = (value: unknown, path: string) => {
      const v = originRecord(value);
      if (!v) {
        add(path, "invalid-benefit");
        return;
      }
      let fields = ["kind"];
      switch (v.kind) {
        case "ability":
          fields.push("ability", "amount");
          if (!token(v.ability, ABILITIES))
            add(path + ".ability", "unsupported-option", "unsupported");
          if (!integer(v.amount, 1, 10)) add(path + ".amount", "invalid-number");
          break;
        case "size":
          fields.push("size");
          if (!token(v.size, ["tiny", "small", "medium", "large", "huge", "gargantuan"]))
            add(path + ".size", "unsupported-option", "unsupported");
          break;
        case "movement":
        case "sense": {
          const key = v.kind === "movement" ? "mode" : "sense";
          fields.push(key, "meters");
          if (!token(v[key], v.kind === "movement" ? MOVEMENT_MODES : SENSES))
            add(path + "." + key, "unsupported-option", "unsupported");
          if (
            typeof v.meters !== "number" ||
            !Number.isFinite(v.meters) ||
            v.meters < 0 ||
            v.meters > 1000
          )
            add(path + ".meters", "invalid-number");
          break;
        }
        case "proficiency":
          fields.push("category", "id");
          proficiency(v, path);
          break;
        case "spellcasting":
          fields.push("ability", "policy");
          if (!token(v.ability, ABILITIES))
            add(path + ".ability", "unsupported-option", "unsupported");
          if (v.policy !== "ability")
            add(path + ".policy", "unsupported-policy", "unsupported");
          break;
        case "resistance":
          fields.push("damageType");
          if (!token(v.damageType, DAMAGE_TYPES))
            add(path + ".damageType", "unsupported-option", "unsupported");
          break;
        case "reference":
          fields.push("dependency");
          reference(v.dependency, path + ".dependency");
          break;
        default:
          add(path + ".kind", "unsupported-benefit", "unsupported");
          fields = Object.keys(v);
      }
      known(v, fields, path);
    };
    if (isOriginFamily(node.family) || Object.hasOwn(d, "prerequisites"))
      list(d.prerequisites, prefix + "prerequisites").forEach((p, i) =>
        prerequisite(p, prefix + "prerequisites." + String(i), reference)
      );
    if (isOriginFamily(node.family) || Object.hasOwn(d, "benefits"))
      list(d.benefits, prefix + "benefits").forEach((b, i) =>
        benefit(b, prefix + "benefits." + String(i))
      );
    const choices =
      isOriginFamily(node.family) || Object.hasOwn(d, "choices")
        ? list(d.choices, prefix + "choices")
        : [];
    const choiceMap = new Map<string, Record<string, unknown>>();
    choices.forEach((value, i) => {
      const path = prefix + "choices." + String(i);
      const v = originRecord(value);
      if (!v) {
        add(path, "invalid-choice");
        return;
      }
      known(v, ["id", "name", "count", "options", "parent"], path);
      if (!id(v.id) || choiceMap.has(String(v.id)))
        add(path + ".id", "duplicate-or-invalid-id");
      choiceMap.set(String(v.id), v);
      if (!nonempty(v.name)) add(path + ".name", "required");
      const options = list(v.options, path + ".options");
      if (!integer(v.count, 1, options.length)) add(path + ".count", "invalid-count");
      const ids = new Set();
      options.forEach((value, j) => {
        const p = path + ".options." + String(j);
        const o = originRecord(value);
        if (!o) {
          add(p, "invalid-option");
          return;
        }
        known(o, ["id", "name", "benefits"], p);
        if (!id(o.id) || ids.has(o.id)) add(p + ".id", "duplicate-or-invalid-id");
        ids.add(o.id);
        if (!nonempty(o.name)) add(p + ".name", "required");
        list(o.benefits, p + ".benefits").forEach((b, k) =>
          benefit(b, p + ".benefits." + String(k))
        );
      });
    });
    choices.forEach((value, i) => {
      const v = originRecord(value);
      if (!v || v.parent === null) return;
      const p = originRecord(v.parent);
      const path = prefix + "choices." + String(i) + ".parent";
      if (!p) {
        add(path, "invalid-parent");
        return;
      }
      known(p, ["choiceId", "optionId"], path);
      const parent = choiceMap.get(String(p.choiceId));
      if (
        !parent ||
        !Array.isArray(parent.options) ||
        !parent.options.some((o) => originRecord(o)?.id === p.optionId)
      )
        add(path, "missing-parent");
      const visited = new Set([v.id]);
      let current: Record<string, unknown> | undefined = v;
      while (current && current.parent !== null) {
        const parentId = originRecord(current.parent)?.choiceId;
        if (visited.has(parentId)) {
          add(path, "choice-cycle");
          break;
        }
        visited.add(parentId);
        current = choiceMap.get(String(parentId));
      }
    });
    if (node.family === "background") {
      if (new Set([d.ability1, d.ability2, d.ability3]).size !== 3)
        add(prefix + "ability1", "distinct-abilities");
      if (d.skill1 === d.skill2) add(prefix + "skill2", "distinct-skills");
      if (d.originFeat !== "") {
        reference(d.originFeat, prefix + "originFeat", ["feat"]);
        const child = originRecord(
          originRecord(table[typeof d.originFeat === "string" ? d.originFeat : ""])
            ?.definition
        );
        const data = originRecord(originRecord(child?.payload)?.data);
        if (data && data.category !== "origin")
          add(prefix + "originFeat", "origin-feat-category");
      }
      list(d.equipment, prefix + "equipment").forEach((r, i) =>
        reference(r, prefix + "equipment." + String(i), ["equipment", "weapon"])
      );
    }
  };
  checkNode(definition, "root", "payload.data.");
  for (const [key, value] of Object.entries(table)) {
    const path = "payload.data.dependencies." + key;
    const v = originRecord(value);
    const source = originRecord(v?.source);
    if (
      !v ||
      !source ||
      typeof source.ownerUid !== "string" ||
      typeof source.id !== "string" ||
      !integer(v.sourceVersion, 1, Number.MAX_SAFE_INTEGER)
    ) {
      add(path, "invalid-dependency");
      continue;
    }
    known(v, ["source", "sourceVersion", "provenance", "definition"], path);
    try {
      libraryPath(source as unknown as LibraryRef);
      parseEntry({
        schema: 1,
        ownerUid: source.ownerUid,
        id: source.id,
        revision: 1,
        draft: v.definition,
        stableVersion: v.sourceVersion,
        provenance: v.provenance,
        lastOperation: { uid: source.ownerUid, opId: "validate" },
      });
    } catch {
      add(path, "invalid-dependency");
    }
    if (
      key !==
      dependencyKey({
        ownerUid: source.ownerUid,
        entryId: source.id,
        version: Number(v.sourceVersion),
      })
    )
      add(path, "dependency-identity");
    try {
      const node = parseDefinition(v.definition);
      if (Object.hasOwn(node.payload.data, "dependencies"))
        add(path, "nested-dependencies");
      for (const issue of conformDefinition(node, true))
        issues.push({ ...issue, path: path + ".definition." + issue.path });
      checkNode(node, key, path + ".definition.payload.data.");
    } catch {
      add(path, "invalid-definition");
    }
  }
  const explored = new Map<string, number>();
  const visit = (key: string, ancestors: Set<string>, depth: number) => {
    if (depth > 8) {
      add("payload.data.dependencies", "dependency-depth");
      return;
    }
    if (ancestors.has(key)) {
      add("payload.data.dependencies", "dependency-cycle");
      return;
    }
    if ((explored.get(key) ?? -1) >= depth) return;
    explored.set(key, depth);
    const next = new Set(ancestors).add(key);
    for (const child of edges.get(key) ?? []) visit(child, next, depth + 1);
  };
  for (const key of edges.keys()) visit(key, new Set(), key === "root" ? 0 : 1);
  return issues;
}

/** Explicit authoring inclusion. Stable root publication later validates the complete closure. */
export function includeOriginDependency(
  definition: LibraryDefinition,
  version: LibraryVersion
): { definition: LibraryDefinition; key: string } {
  const result = structuredClone(definition);
  const key = dependencyKey(version);
  const table = originRecord(result.payload.data.dependencies) ?? {};
  const copied = structuredClone(version.definition);
  const children = originRecord(copied.payload.data.dependencies) ?? {};
  delete copied.payload.data.dependencies;
  for (const [childKey, child] of Object.entries(children)) {
    if (Object.hasOwn(table, childKey) && !equal(table[childKey], child))
      throw new Error("conflicting-dependency");
    table[childKey] = child;
  }
  const node: OriginDependency = {
    source: { ownerUid: version.ownerUid, id: version.entryId },
    sourceVersion: version.version,
    provenance: version.provenance,
    definition: copied,
  };
  if (Object.hasOwn(table, key) && !equal(table[key], node))
    throw new Error("conflicting-dependency");
  table[key] = node;
  result.payload.data.dependencies = table as Record<string, JsonValue>;
  parseDefinition(result);
  const issues = conformOriginDefinition(result).filter(
    (i) =>
      i.severity === "invalid" &&
      [
        "invalid-dependencies",
        "dependency-identity",
        "dependency-cycle",
        "dependency-depth",
        "nested-dependencies",
        "invalid-dependency",
        "invalid-definition",
      ].includes(i.code)
  );
  const firstIssue = issues[0];
  if (firstIssue) throw new Error(firstIssue.code);
  return { definition: result, key };
}

/** Canonical acquisition identity shared by repeatability and pinned prerequisites.
 * Content/library revisions intentionally do not turn the same feat into a new one.
 */
export function originFeatIdentity(
  definition: LibraryDefinition,
  canonicalSource: LibraryRef
): string {
  const d = definition.payload.data;
  return typeof d.mechanicId === "string" && d.mechanicId !== "custom"
    ? JSON.stringify([
        "mechanic",
        d.edition,
        d.source,
        d.source === "homebrew" ? canonicalSource.ownerUid : null,
        d.mechanicId,
      ])
    : JSON.stringify([canonicalSource.ownerUid, canonicalSource.id]);
}
