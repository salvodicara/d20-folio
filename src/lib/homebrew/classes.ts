import { isCatalogueSnapshot, sourceIdentity, type DefinitionSnapshot } from "./sources";
import { ABILITIES, validResourceId, type CommonData } from "./model";
import { conformDefinition, type AuthoringDiagnostic } from "./conformance";
import {
  originRecord,
  type Ability,
  type OriginDeclarations,
  type OriginPrerequisite,
  type OriginBenefit,
  type OriginChoice,
} from "./origins";
import {
  declaredProgramCosts,
  type AdvancedResource,
  type ActionProgram,
} from "./advanced";
import {
  parseDefinition,
  type LibraryDefinition,
  type JsonValue,
} from "../library/model";
import { equal } from "../shared/model";
export const isClassFamily = (family: string): family is "class" | "subclass" =>
  family === "class" || family === "subclass";
export interface ClassAcquisition {
  prerequisites: OriginPrerequisite[];
  benefits: OriginBenefit[];
  choices: OriginChoice[];
}
export interface ClassSpellcasting {
  mode: "none" | "full" | "half" | "third" | "pact" | "custom";
  ability: "none" | Ability;
  multiclass: { contributes: boolean; divisor: number; rounding: "down" | "up" };
}
export interface ClassLevelSpellcasting {
  cantrips: number;
  prepared: number;
  known: number;
  slots: number[];
  pactSlots: number;
  pactLevel: number;
}
export interface ClassLevel extends ClassAcquisition {
  id: string;
  name: string;
  level: number;
  programIds: string[];
  resourceCapacities: { resourceId: string; capacity: number }[];
  spellcasting: ClassLevelSpellcasting;
}
interface ProgressionData extends CommonData, OriginDeclarations {
  levelBasis: "class";
  progression: ClassLevel[];
  spellcasting: ClassSpellcasting;
  resources: AdvancedResource[];
  programs: ActionProgram[];
}
export interface ClassData extends ProgressionData {
  startingEquipment?: { gold: number; items: { dependency: string; quantity: number }[] };
  hitDie: 6 | 8 | 10 | 12;
  primaryAbilities: Ability[];
  savingThrows: [Ability, Ability];
  subclassLevels: number[];
  starting: ClassAcquisition;
  multiclass: ClassAcquisition;
}
export interface SubclassData extends ProgressionData {
  parentClass: { dependency: string; mechanicId: string };
  castingRelationship: "inherit" | "augment" | "replace";
}
export const CLASS_DATA_KEYS = [
  "startingEquipment",
  "levelBasis",
  "progression",
  "spellcasting",
  "hitDie",
  "primaryAbilities",
  "savingThrows",
  "subclassLevels",
  "starting",
  "multiclass",
  "parentClass",
  "castingRelationship",
];
export function blankClassLevel(level = 1): ClassLevel {
  return {
    id: "level-" + String(level),
    name: String(level),
    level,
    prerequisites: [],
    benefits: [],
    choices: [],
    programIds: [],
    resourceCapacities: [],
    spellcasting: {
      cantrips: 0,
      prepared: 0,
      known: 0,
      slots: [],
      pactSlots: 0,
      pactLevel: 0,
    },
  };
}
export function initializeClassData(
  family: "class" | "subclass"
): Record<string, JsonValue> {
  return {
    levelBasis: "class",
    prerequisites: [],
    benefits: [],
    choices: [],
    dependencies: {},
    progression: [blankClassLevel(family === "class" ? 1 : 3)] as unknown as JsonValue,
    spellcasting: {
      mode: "none",
      ability: "none",
      multiclass: { contributes: false, divisor: 1, rounding: "down" },
    },
    ...(family === "class"
      ? {
          hitDie: 8,
          primaryAbilities: ["strength"],
          savingThrows: ["strength", "constitution"],
          subclassLevels: [3],
          starting: { prerequisites: [], benefits: [], choices: [] },
          multiclass: { prerequisites: [], benefits: [], choices: [] },
        }
      : {
          parentClass: { dependency: "", mechanicId: "" },
          castingRelationship: "inherit",
        }),
  };
}
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
/** Static authoring relationships only; never applies progression to a character. */
export function conformClassDefinition(
  definition: LibraryDefinition
): AuthoringDiagnostic[] {
  const issues: AuthoringDiagnostic[] = [];
  const add = (
    path: string,
    code: string,
    severity: AuthoringDiagnostic["severity"] = "invalid"
  ) => issues.push({ path: "payload.data." + path, code, severity });
  const d = definition.payload.data;
  const known = (v: Record<string, unknown>, keys: string[], p: string) => {
    for (const k of Object.keys(v))
      if (!keys.includes(k)) add(p + "." + k, "unsupported-field", "unsupported");
  };
  const list = (v: unknown, p: string, max = 32): unknown[] => {
    if (!Array.isArray(v) || v.length > max) {
      add(p, "invalid-collection");
      return [];
    }
    return v;
  };
  const distinctAbilities = (v: unknown, p: string, count?: number) => {
    const a = list(v, p, 6);
    if (
      !a.length ||
      (count !== undefined && a.length !== count) ||
      new Set(a).size !== a.length ||
      a.some((x) => !ABILITIES.includes(x as Ability))
    )
      add(p, "invalid-abilities");
  };
  if (d.levelBasis !== "class")
    add("levelBasis", "unsupported-level-basis", "unsupported");
  if (definition.family === "class") {
    if (![6, 8, 10, 12].includes(Number(d.hitDie)) || typeof d.hitDie !== "number")
      add("hitDie", "invalid-hit-die");
    distinctAbilities(d.primaryAbilities, "primaryAbilities");
    distinctAbilities(d.savingThrows, "savingThrows", 2);
    const schedule = list(d.subclassLevels, "subclassLevels", 20);
    if (
      !schedule.length ||
      schedule.some(
        (x, i) => !integer(x, 1, 20) || (i > 0 && Number(schedule[i - 1]) >= x)
      )
    )
      add("subclassLevels", "invalid-subclass-schedule");
    if (Object.hasOwn(d, "parentClass") || Object.hasOwn(d, "castingRelationship"))
      add("parentClass", "incompatible-class-field");
  } else {
    for (const k of [
      "hitDie",
      "primaryAbilities",
      "savingThrows",
      "subclassLevels",
      "starting",
      "multiclass",
    ])
      if (Object.hasOwn(d, k)) add(k, "incompatible-subclass-field");
    if (
      !["inherit", "augment", "replace"].includes(
        typeof d.castingRelationship === "string" ? d.castingRelationship : ""
      )
    )
      add("castingRelationship", "unsupported-option", "unsupported");
    const parent = originRecord(d.parentClass);
    if (!parent) add("parentClass", "invalid-parent-class");
    else {
      known(parent, ["dependency", "mechanicId"], "parentClass");
      if (
        typeof parent.dependency !== "string" ||
        !parent.dependency ||
        typeof parent.mechanicId !== "string" ||
        !parent.mechanicId.trim()
      )
        add("parentClass", "invalid-parent-class");
    }
  }
  const casting = originRecord(d.spellcasting);
  const modes = ["none", "full", "half", "third", "pact", "custom"];
  const knownMode = typeof casting?.mode === "string" && modes.includes(casting.mode);
  const knownAbility =
    typeof casting?.ability === "string" &&
    ["none", ...ABILITIES].includes(casting.ability);
  const checkToken = (value: unknown, options: readonly string[], path: string) => {
    if (typeof value !== "string") add(path, "invalid-text");
    else if (!options.includes(value)) add(path, "unsupported-option", "unsupported");
  };
  const contribution = originRecord(casting?.multiclass);
  if (!casting || !contribution) add("spellcasting", "invalid-spellcasting");
  else {
    known(casting, ["mode", "ability", "multiclass"], "spellcasting");
    known(
      contribution,
      ["contributes", "divisor", "rounding"],
      "spellcasting.multiclass"
    );
    checkToken(casting.mode, modes, "spellcasting.mode");
    checkToken(casting.ability, ["none", ...ABILITIES], "spellcasting.ability");
    checkToken(contribution.rounding, ["down", "up"], "spellcasting.multiclass.rounding");
    if (
      typeof contribution.contributes !== "boolean" ||
      !integer(contribution.divisor, 1, 20)
    )
      add("spellcasting.multiclass", "invalid-multiclass-contribution");
    if (
      knownMode &&
      knownAbility &&
      (casting.mode === "none") !== (casting.ability === "none")
    )
      add("spellcasting.ability", "casting-ability");
    if (
      (casting.mode === "none" || casting.mode === "pact") &&
      contribution.contributes !== false
    )
      add("spellcasting.multiclass", "invalid-multiclass-contribution");
    if (
      definition.family === "subclass" &&
      (d.castingRelationship === "inherit" || d.castingRelationship === "augment") &&
      knownMode &&
      (casting.mode !== "none" || contribution.contributes !== false)
    )
      add("spellcasting", "inherited-casting-contribution");
  }
  const rows = list(d.progression, "progression", 20);
  if (!rows.length) add("progression", "invalid-progression");
  const ids = new Set();
  const resourceRows = Array.isArray(d.resources) ? d.resources : [];
  const resources = new Map(
    resourceRows.map((r) => {
      const x = originRecord(r);
      return [String(x?.id), x] as const;
    })
  );
  const programs = new Map(
    (Array.isArray(d.programs) ? d.programs : []).map((r) => {
      const x = originRecord(r);
      return [String(x?.id), x] as const;
    })
  );
  const capacities = new Map<string, number>();
  const available = new Set<string>();
  rows.forEach((value, i) => {
    const p = "progression." + String(i);
    const r = originRecord(value);
    if (!r) {
      add(p, "invalid-progression");
      return;
    }
    known(
      r,
      [
        "id",
        "name",
        "level",
        "prerequisites",
        "benefits",
        "choices",
        "programIds",
        "resourceCapacities",
        "spellcasting",
      ],
      p
    );
    if (
      !integer(r.level, 1, 20) ||
      (i === 0 && definition.family === "class" && r.level !== 1) ||
      (i > 0 && Number(originRecord(rows[i - 1])?.level) >= r.level)
    )
      add(p + ".level", "invalid-progression");
    if (!validResourceId(r.id) || ids.has(r.id))
      add(p + ".id", "duplicate-or-invalid-id");
    ids.add(r.id);
    if (typeof r.name !== "string" || !r.name.trim() || r.name.length > 10000)
      add(p + ".name", "required");
    const bound = new Set();
    list(r.resourceCapacities, p + ".resourceCapacities").forEach((v, j) => {
      const x = originRecord(v);
      const q = p + ".resourceCapacities." + String(j);
      if (!x) {
        add(q, "invalid-resource-binding");
        return;
      }
      known(x, ["resourceId", "capacity"], q);
      const resource =
        typeof x.resourceId === "string" ? resources.get(x.resourceId) : undefined;
      if (
        typeof x.resourceId !== "string" ||
        !resource ||
        bound.has(x.resourceId) ||
        !integer(x.capacity, 0, Number(resource.capacity))
      )
        add(q, "invalid-resource-binding");
      else capacities.set(x.resourceId, x.capacity);
      bound.add(x.resourceId);
    });
    list(r.programIds, p + ".programIds").forEach((v) => {
      if (typeof v !== "string" || !programs.has(v))
        add(p + ".programIds", "missing-program");
      else if (available.has(v)) add(p + ".programIds", "duplicate-program-binding");
      else available.add(v);
    });
    const checkProgram = (id: string, seen: Set<string>) => {
      if (seen.has(id)) return;
      const next = new Set(seen).add(id);
      const program = programs.get(id);
      if (!program) return;
      for (const [resourceId, cost] of declaredProgramCosts(
        program,
        [...programs.values()].filter((v): v is Record<string, unknown> => v !== null)
      )) {
        if (
          cost > 0 &&
          (!capacities.has(resourceId) || cost > Number(capacities.get(resourceId)))
        )
          add(p + ".programIds", "resource-unavailable");
      }
      for (const step of Array.isArray(program.steps) ? program.steps : []) {
        const s = originRecord(step);
        const child = String(s?.programId);
        if (!available.has(child)) add(p + ".programIds", "program-unavailable");
        checkProgram(child, next);
      }
    };
    for (const id of available) checkProgram(id, new Set());
    const s = originRecord(r.spellcasting);
    if (!s) add(p + ".spellcasting", "invalid-spellcasting");
    else {
      known(
        s,
        ["cantrips", "prepared", "known", "slots", "pactSlots", "pactLevel"],
        p + ".spellcasting"
      );
      for (const k of ["cantrips", "prepared", "known"])
        if (!integer(s[k], 0, 100)) add(p + ".spellcasting." + k, "invalid-number");
      const slots = list(s.slots, p + ".spellcasting.slots", 9);
      if (
        slots.some((x) => !integer(x, 0, 100)) ||
        !integer(s.pactSlots, 0, 100) ||
        !integer(s.pactLevel, 0, 9) ||
        (s.pactSlots === 0) !== (s.pactLevel === 0)
      )
        add(p + ".spellcasting", "invalid-spellcasting");
      if (
        knownMode &&
        casting.mode !== "pact" &&
        (Number(s.pactSlots) > 0 || Number(s.pactLevel) > 0)
      )
        add(p + ".spellcasting", "incompatible-pact-slots");
      if (casting?.mode === "pact" && slots.some((x) => Number(x) > 0))
        add(p + ".spellcasting", "incompatible-spell-slots");
      if (
        casting?.mode === "none" &&
        (slots.some((x) => Number(x) > 0) ||
          Number(s.pactSlots) > 0 ||
          ((definition.family !== "subclass" || d.castingRelationship !== "augment") &&
            [s.cantrips, s.prepared, s.known].some((x) => Number(x) > 0)))
      )
        add(p + ".spellcasting", "noncasting-progression");
    }
  });
  return issues;
}
export type ClassDecodeResult =
  | { ok: true; family: "class"; data: ClassData; definition: LibraryDefinition }
  | { ok: true; family: "subclass"; data: SubclassData; definition: LibraryDefinition }
  | {
      ok: false;
      status: "incompatible" | "invalid" | "unsupported";
      original: unknown;
      issues: AuthoringDiagnostic[];
    };
export function decodeClassDefinition(original: unknown): ClassDecodeResult {
  let definition: LibraryDefinition;
  try {
    definition = parseDefinition(original);
  } catch {
    return {
      ok: false,
      status: "incompatible",
      original,
      issues: [{ path: "definition", code: "invalid-definition", severity: "invalid" }],
    };
  }
  const issues = conformDefinition(definition);
  if (!isClassFamily(definition.family))
    return {
      ok: false,
      status: "unsupported",
      original,
      issues: [
        ...issues,
        { path: "family", code: "unsupported-family", severity: "unsupported" },
      ],
    };
  if (issues.length)
    return {
      ok: false,
      status: issues.some((i) => i.severity === "invalid") ? "invalid" : "unsupported",
      original,
      issues,
    };
  return definition.family === "class"
    ? {
        ok: true,
        family: "class",
        definition,
        data: definition.payload.data as unknown as ClassData,
      }
    : {
        ok: true,
        family: "subclass",
        definition,
        data: definition.payload.data as unknown as SubclassData,
      };
}
/** Exact owned stable parent; names and a floating library head never establish compatibility. */
export function conformClassPair(
  subclass: LibraryDefinition,
  parent: DefinitionSnapshot
): AuthoringDiagnostic[] {
  const issues = conformDefinition(subclass);
  if (subclass.family !== "subclass" || parent.definition.family !== "class")
    return [
      ...issues,
      { path: "parentClass", code: "incompatible-parent-class", severity: "invalid" },
    ];
  const p = originRecord(subclass.payload.data.parentClass);
  const dep = originRecord(
    originRecord(subclass.payload.data.dependencies)?.[String(p?.dependency)]
  );
  const source = originRecord(dep?.source);
  const childDefinition = structuredClone(parent.definition);
  const children = originRecord(childDefinition.payload.data.dependencies) ?? {};
  const table = originRecord(subclass.payload.data.dependencies) ?? {};
  delete childDefinition.payload.data.dependencies;
  if (isCatalogueSnapshot(parent)) {
    if (
      !dep ||
      dep.kind !== "catalogue" ||
      sourceIdentity(dep as unknown as DefinitionSnapshot) !== sourceIdentity(parent) ||
      !equal(dep, { ...parent, definition: childDefinition }) ||
      Object.entries(children).some(([key, value]) => !equal(table[key], value))
    )
      issues.push({
        path: "parentClass",
        code: "parent-version-mismatch",
        severity: "invalid",
      });
    return issues;
  }
  const direct =
    source?.ownerUid === parent.ownerUid &&
    source.id === parent.entryId &&
    dep?.sourceVersion === parent.version &&
    equal(dep.provenance, parent.provenance);
  const granted =
    parent.provenance !== null &&
    source?.ownerUid === parent.provenance.source.ownerUid &&
    source.id === parent.provenance.source.id &&
    dep?.sourceVersion === parent.provenance.sourceVersion;
  if (
    !dep ||
    (!direct && !granted) ||
    !equal(dep.definition, childDefinition) ||
    Object.entries(children).some(([key, value]) => !equal(table[key], value))
  )
    issues.push({
      path: "parentClass",
      code: "parent-version-mismatch",
      severity: "invalid",
    });
  return issues;
}
