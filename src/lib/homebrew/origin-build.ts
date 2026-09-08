import { parseClassBuild, type ClassBuild } from "./class-build";
import { parseAcquisitionSelection } from "./acquisition-selection";
import { equal } from "../shared/model";
import { resolveCatalogueChoice, type ChoiceResolutionContext } from "./choice-pools";
import { assertJsonBudget } from "../shared/json-budget";
import {
  frozen,
  identityId,
  type CharacterRef,
  type FolioCharacter,
  type JsonObject,
} from "../identity/model";
import type { LibraryVersion } from "../library/model";
import {
  snapshotSource,
  conformAcquisitionSnapshot,
  canonicalSource as canonicalSourceOf,
  dependencySource,
  canonicalDependencySource,
  type DefinitionSnapshot,
  type DefinitionSource,
  type CanonicalSource,
  type CatalogueVerifier,
} from "./sources";
import { conformDefinition } from "./conformance";
import { ABILITIES, initializeDefinition } from "./model";
import {
  originFeatIdentity,
  originNodePath,
  originRecord,
  MOVEMENT_MODES,
  SENSES,
  type Ability,
  type OriginBenefit,
  type OriginChoice,
  type OriginDependency,
  type OriginPrerequisite,
} from "./origins";

export interface OriginException {
  path: string;
  code: string;
  reason: string;
  authorUid: string;
}
export interface OriginSelection {
  id: string;
  ordinal: number;
  snapshot: DefinitionSnapshot;
  resolvedChoices?: Record<string, DefinitionSnapshot[]>;
  answers: Record<string, string[]>;
  exceptions: OriginException[];
}
export interface OriginBuild {
  schema: 1;
  character: CharacterRef;
  revision: number;
  selections: Record<string, OriginSelection>;
  lastOperation: { uid: string; opId: string };
}
export interface OriginDiagnostic {
  path: string;
  code: string;
  severity: "invalid" | "unsupported" | "unresolved";
  selectionId?: string;
}
export interface OriginFact {
  selectionId: string;
  path: string;
  source: DefinitionSource;
  benefit: OriginBenefit;
}
export interface ActiveOriginChoice {
  selectionId: string;
  path: string;
  choice: OriginChoice;
  selected: string[];
  active: boolean;
}
export interface OriginEquipmentEntitlement {
  selectionId: string;
  path: string;
  choice: "gold" | "bundle";
  gold: number;
  dependencies: string[];
}
export interface SelectedEquipmentEntitlement {
  selectionId: string;
  path: string;
  snapshot: DefinitionSnapshot;
  quantity: number;
}
export interface OriginComposition {
  selectedEquipment: SelectedEquipmentEntitlement[];
  entitlements: OriginEquipmentEntitlement[];
  facts: OriginFact[];
  diagnostics: OriginDiagnostic[];
  activeChoices: ActiveOriginChoice[];
  valid: boolean;
}
export interface OriginProjection extends OriginComposition {
  abilities: Record<Ability, number | null>;
  species: { id: string; name: string; selectionId: string | null; catalogue?: boolean };
  background: {
    id: string;
    name: string;
    selectionId: string | null;
    catalogue?: boolean;
  };
  baseline: { build: JsonObject; superseded: string[]; unresolved: string[] };
  available: boolean;
  projectedCharacter: FolioCharacter;
}
export const ORIGIN_BUILD_MAX_BYTES = 180000;
export const ORIGIN_JSON_MAX_NODES = 4096;
const upper: Record<Ability, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};
function fail(): never {
  throw new Error("incompatible-origin-build");
}
function record(value: unknown): Record<string, unknown> {
  const v = originRecord(value);
  if (!v || ![Object.prototype, null].includes(Object.getPrototypeOf(v) as object | null))
    return fail();
  return v;
}
function keys(value: Record<string, unknown>, expected: string[]) {
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((k) => !Object.hasOwn(value, k))
  )
    fail();
}
const safeInt = (v: unknown, min = 0) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min;
/** Budget validation runs before cloning/serializing untrusted data. */
export function assertOriginJsonBudget(
  value: unknown,
  maxBytes = ORIGIN_BUILD_MAX_BYTES
): void {
  try {
    assertJsonBudget(value, maxBytes, ORIGIN_JSON_MAX_NODES);
  } catch {
    fail();
  }
}
export function parseOriginBuild(
  value: unknown,
  verifyCatalogue?: CatalogueVerifier
): OriginBuild {
  try {
    assertOriginJsonBudget(value);
    const v = record(value);
    keys(v, ["schema", "character", "revision", "selections", "lastOperation"]);
    const character = record(v.character);
    keys(character, ["ownerUid", "id"]);
    if (typeof character.ownerUid !== "string" || typeof character.id !== "string")
      fail();
    identityId(character.ownerUid);
    identityId(character.id);
    if (v.schema !== 1 || !safeInt(v.revision, 1)) fail();
    const last = record(v.lastOperation);
    keys(last, ["uid", "opId"]);
    if (typeof last.uid !== "string" || typeof last.opId !== "string") fail();
    identityId(last.uid);
    identityId(last.opId);
    const selections = record(v.selections);
    if (Object.keys(selections).length > 32) fail();
    const ordinals = new Set<number>();
    for (const [id, value] of Object.entries(selections)) {
      identityId(id);
      const selection = parseAcquisitionSelection(value, "origin", verifyCatalogue);
      if (selection.id !== id || ordinals.has(selection.ordinal)) fail();
      ordinals.add(selection.ordinal);
    }
    return frozen(structuredClone(v)) as unknown as OriginBuild;
  } catch {
    return fail();
  }
}
function baseAbilities(
  character: FolioCharacter,
  replacedBackground: boolean
): Record<Ability, number | null> {
  const b = character.sheet.build;
  const scores = originRecord(b.abilities) ?? {};
  const asi = replacedBackground
    ? {}
    : (originRecord(originRecord(b.asi)?.background) ?? {});
  return Object.fromEntries(
    ABILITIES.map((a) => [
      a,
      typeof scores[upper[a]] === "number" && Number.isFinite(scores[upper[a]])
        ? Number(scores[upper[a]]) +
          (typeof asi[upper[a]] === "number" ? Number(asi[upper[a]]) : 0)
        : null,
    ])
  ) as Record<Ability, number | null>;
}
function baselineProofs(character: FolioCharacter, replaced: boolean): Set<string> {
  const b = character.sheet.build;
  const proofs = new Set<string>();
  // Imported unqualified skills can include a replaced origin, so cannot prove acquisition.
  if (!replaced) {
    for (const [id, value] of Object.entries(originRecord(b.skills) ?? {}))
      if (value === "proficient" || value === "expertise") proofs.add("skill:" + id);
  }
  for (const [field, category] of [
    ["toolProficiencyIds", "tool"],
    ["languageIds", "language"],
  ] as const)
    if (Array.isArray(b[field]))
      for (const id of b[field])
        if (typeof id === "string") proofs.add(category + ":" + id);
  if (Array.isArray(b.savingThrows))
    for (const id of b.savingThrows)
      if (typeof id === "string")
        proofs.add("save:" + (ABILITIES.find((a) => upper[a] === id) ?? id));
  return proofs;
}
/** Context is attributed output from another validated build owner, never imported unqualified data. */
function inheritedFacts(
  context: ChoiceResolutionContext,
  selections: OriginSelection[],
  diagnostics: OriginDiagnostic[]
): OriginFact[] {
  const accepted = new Map<string, OriginFact>();
  const conflicts = new Set<string>();
  try {
    assertOriginJsonBudget(context.inheritedFacts ?? []);
  } catch {
    diagnostics.push({
      path: "inheritedFacts",
      code: "invalid-inherited-fact",
      severity: "invalid",
    });
    return [];
  }
  for (const fact of context.inheritedFacts ?? []) {
    if (!originRecord(fact)) {
      diagnostics.push({
        path: "inheritedFacts",
        code: "invalid-inherited-fact",
        severity: "invalid",
      });
      continue;
    }
    if (selections.some((selection) => selection.id === fact.selectionId)) continue;
    const source = originRecord(fact.source);
    const expected =
      source?.kind === "catalogue"
        ? ["kind", "catalogue", "release", "adapterVersion", "id"]
        : ["ownerUid", "id", "version"];
    const validSource =
      source &&
      Object.keys(source).length === expected.length &&
      expected.every((key) => Object.hasOwn(source, key)) &&
      typeof source.id === "string" &&
      !!source.id &&
      (source.kind === "catalogue"
        ? typeof source.catalogue === "string" &&
          typeof source.release === "string" &&
          safeInt(source.adapterVersion, 1)
        : typeof source.ownerUid === "string" && safeInt(source.version, 1));
    const definition = initializeDefinition("feat");
    definition.name = "Inherited fact";
    definition.payload.data.benefits = [fact.benefit];
    if (
      Object.keys(fact).some(
        (key) => !["selectionId", "path", "source", "benefit"].includes(key)
      ) ||
      typeof fact.selectionId !== "string" ||
      !fact.selectionId ||
      typeof fact.path !== "string" ||
      !fact.path ||
      !validSource ||
      conformDefinition(definition).length
    ) {
      diagnostics.push({
        path: fact.path,
        code: "invalid-inherited-fact",
        severity: "invalid",
      });
      continue;
    }
    const key = JSON.stringify([
      fact.selectionId,
      fact.path,
      "kind" in fact.source
        ? [
            fact.source.kind,
            fact.source.catalogue,
            fact.source.release,
            fact.source.adapterVersion,
            fact.source.id,
          ]
        : [fact.source.ownerUid, fact.source.id, fact.source.version],
    ]);
    const previous = accepted.get(key);
    if (previous && !equal(previous.benefit, fact.benefit)) {
      conflicts.add(key);
      diagnostics.push({
        selectionId: fact.selectionId,
        path: fact.path,
        code: "conflicting-inherited-fact",
        severity: "invalid",
      });
    }
    accepted.set(key, structuredClone(fact));
  }
  return [...accepted.entries()]
    .filter(([key]) => !conflicts.has(key))
    .map(([, fact]) => fact);
}
export function composeOriginBuild(
  character: FolioCharacter,
  build: OriginBuild | null,
  context: ChoiceResolutionContext = {}
): OriginComposition {
  return composeAcquisitionBuilds(character, build, null, context);
}
export function composeAcquisitionBuilds(
  character: FolioCharacter,
  build: OriginBuild | null,
  classBuild: ClassBuild | null,
  context: ChoiceResolutionContext = {}
): OriginComposition {
  const result: OriginComposition = {
    entitlements: [],
    selectedEquipment: [],
    facts: [],
    diagnostics: [],
    activeChoices: [],
    valid: true,
  };
  let parsed: OriginBuild | null = null;
  if (build !== null) {
    try {
      parsed = parseOriginBuild(build, context.verifyCatalogue ?? (() => false));
    } catch {
      result.diagnostics.push({
        path: "build",
        code: "incompatible-origin-build",
        severity: "invalid",
      });
      result.valid = false;
      return result;
    }
  }
  if (
    parsed &&
    (parsed.character.ownerUid !== character.ownerUid ||
      parsed.character.id !== character.id)
  ) {
    result.diagnostics.push({
      path: "character",
      code: "character-mismatch",
      severity: "invalid",
    });
    result.valid = false;
    return result;
  }
  let parsedClasses: ClassBuild | null = null;
  if (classBuild) {
    try {
      parsedClasses = parseClassBuild(
        classBuild,
        context.verifyCatalogue ?? (() => false)
      );
    } catch {
      result.diagnostics.push({
        path: "classes",
        code: "incompatible-class-build",
        severity: "invalid",
      });
      result.valid = false;
      return result;
    }
    if (
      parsedClasses.character.ownerUid !== character.ownerUid ||
      parsedClasses.character.id !== character.id
    ) {
      result.diagnostics.push({
        path: "classes.character",
        code: "character-mismatch",
        severity: "invalid",
      });
      result.valid = false;
      return result;
    }
  }
  const selections: OriginSelection[] = [
    ...Object.values(parsedClasses?.acquisitions ?? {}),
    ...Object.values(parsed?.selections ?? {}).sort((a, b) => a.ordinal - b.ordinal),
  ];
  const replacedBackground = selections.some(
    (s) => s.snapshot.definition.family === "background"
  );
  const replacedSpecies = selections.some(
    (s) => s.snapshot.definition.family === "species"
  );
  const abilities = baseAbilities(character, replacedBackground);
  const proofs = baselineProofs(character, replacedBackground || replacedSpecies);
  const feats = new Set<string>();
  const acquired = new Set<string>();
  const families = new Set<string>();
  const spellcasting = originRecord(character.sheet.build.spellcasting);
  let hasSpellcasting =
    !(replacedBackground || replacedSpecies) &&
    (character.sheet.build.spellcasting === true ||
      !!(spellcasting && Object.keys(spellcasting).length));
  result.facts.push(...inheritedFacts(context, selections, result.diagnostics));
  for (const { benefit } of result.facts) {
    if (benefit.kind === "proficiency" || benefit.kind === "expertise")
      proofs.add(benefit.category + ":" + benefit.id);
    if (benefit.kind === "spellcasting") hasSpellcasting = true;
    if (benefit.kind === "ability" && abilities[benefit.ability] !== null)
      abilities[benefit.ability] = (abilities[benefit.ability] ?? 0) + benefit.amount;
  }
  const deferredChoices: (() => void)[] = [];
  const deferredSpells: (() => void)[] = [];
  const finalizers: (() => void)[] = [];
  for (const selection of selections) {
    const classLevel =
      selection.snapshot.definition.family === "class"
        ? parsedClasses?.acquisitions[selection.id]?.classLevel
        : undefined;
    const localAbilities = new Map<string, Ability>();
    const pendingSpells = new Map<string, (() => void)[]>();
    const conflictedAbilities = new Set<string>();
    const add = (
      path: string,
      code: string,
      severity: OriginDiagnostic["severity"] = "invalid"
    ) => result.diagnostics.push({ selectionId: selection.id, path, code, severity });
    const exception = (path: string, code: string) =>
      selection.exceptions.some(
        (e) => e.path === path && e.code === code && !!e.reason.trim()
      );
    const rule = (
      condition: boolean,
      path: string,
      code: string,
      severity: OriginDiagnostic["severity"] = "invalid"
    ) => {
      if (condition) return true;
      if (exception(path, code)) return true;
      add(path, code, severity);
      return false;
    };
    const definition = selection.snapshot.definition;
    if (definition.family !== "feat" && families.has(definition.family)) {
      add("root", "duplicate-origin");
      continue;
    }
    families.add(definition.family);
    const declarations = conformAcquisitionSnapshot(
      selection.snapshot,
      context.verifyCatalogue
    );
    if (declarations.length) {
      for (const diagnostic of declarations)
        add(diagnostic.path, diagnostic.code, diagnostic.severity);
      continue;
    }
    const dependencies = originRecord(definition.payload.data.dependencies) ?? {};
    const visited = new Set<OriginDependency>();
    const usedAnswers = new Set<string>();
    const evaluate = (
      p: OriginPrerequisite,
      path: string,
      table = dependencies
    ): boolean => {
      switch (p.kind) {
        case "all":
          return p.requirements
            .map((r, i) => evaluate(r, path + ".requirements." + String(i), table))
            .every(Boolean);
        case "any": {
          if (exception(path, "prerequisite-any")) return true;
          const before = result.diagnostics.length;
          const failures: OriginDiagnostic[] = [];
          for (let i = 0; i < p.requirements.length; i++) {
            result.diagnostics.splice(before);
            if (
              evaluate(
                p.requirements[i] as OriginPrerequisite,
                path + ".requirements." + String(i),
                table
              )
            ) {
              result.diagnostics.splice(before);
              return true;
            }
            failures.push(...result.diagnostics.slice(before));
          }
          result.diagnostics.splice(before);
          result.diagnostics.push(...failures);
          return rule(false, path, "prerequisite-any");
        }
        case "level":
          return rule(
            (classLevel ?? character.level) >= p.minimum,
            path,
            "prerequisite-level"
          );
        case "ability":
          return rule(
            abilities[p.ability] !== null &&
              (abilities[p.ability] ?? -Infinity) >= p.minimum,
            path,
            "prerequisite-ability",
            abilities[p.ability] === null ? "unresolved" : "invalid"
          );
        case "proficiency":
          return rule(
            proofs.has(p.category + ":" + p.id),
            path,
            "prerequisite-proficiency",
            "unresolved"
          );
        case "training":
          return rule(
            result.facts.some(
              ({ benefit }) =>
                benefit.kind === "training" &&
                benefit.category === p.category &&
                benefit.id === p.id
            ),
            path,
            "prerequisite-training",
            "unresolved"
          );
        case "feat": {
          if (p.dependency !== undefined) {
            const dependency = table[p.dependency] as OriginDependency | undefined;
            if (!dependency) {
              add(path, "missing-reference");
              return false;
            }
            return rule(
              acquired.has(
                originFeatIdentity(
                  dependency.definition,
                  canonicalDependencySource(dependency)
                )
              ),
              path,
              "prerequisite-feat",
              "unresolved"
            );
          }
          return rule(
            p.mechanicId !== "custom" && feats.has(p.mechanicId),
            path,
            "prerequisite-feat",
            "unresolved"
          );
        }
        case "spellcasting":
          return rule(hasSpellcasting, path, "prerequisite-spellcasting", "unresolved");
        default:
          add(path, "unsupported-predicate", "unsupported");
          return false;
      }
    };
    const resolve = (
      node: LibraryVersion["definition"],
      path: string,
      source: OriginFact["source"],
      depth: number,
      canonicalSource: CanonicalSource = source,
      table = dependencies,
      scopeData?: Record<string, unknown>,
      abilityScope = path
    ): void => {
      if (depth > 8) {
        add(path, "dependency-depth");
        return;
      }
      const d = scopeData ?? node.payload.data;
      const identity = originFeatIdentity(node, canonicalSource);
      const prereqs = (Array.isArray(d.prerequisites)
        ? d.prerequisites
        : []) as unknown as OriginPrerequisite[];
      const eligible = prereqs
        .map((p, i) => evaluate(p, path + "/prerequisites/" + String(i), table))
        .every(Boolean);
      if (
        node.family === "feature" &&
        typeof d.acquisitionLevel === "number" &&
        !rule(
          (classLevel ?? character.level) >= d.acquisitionLevel,
          path,
          "prerequisite-level"
        )
      )
        return;
      const repeatable =
        node.family !== "feat" || d.repeatable === true || !acquired.has(identity);
      if (!rule(repeatable, path, "nonrepeatable-feat") || !eligible) return;
      if (node.family === "feat") {
        acquired.add(identity);
        if (typeof d.mechanicId === "string" && d.mechanicId !== "custom")
          feats.add(d.mechanicId);
      }
      const childReferences: { key: string; path: string }[] = [];
      let referenceIndex = 0;
      const resolveReferences = () => {
        while (referenceIndex < childReferences.length) {
          const child = childReferences[referenceIndex++];
          if (!child) continue;
          const dependency = table[child.key] as OriginDependency | undefined;
          const childPath = originNodePath(path, child.key);
          if (!dependency) {
            add(child.path, "missing-reference");
            continue;
          }
          if (visited.has(dependency)) {
            continue;
          }
          visited.add(dependency);
          resolve(
            dependency.definition,
            childPath,
            dependencySource(dependency),
            depth + 1,
            canonicalDependencySource(dependency),
            table
          );
        }
      };
      const apply = (benefit: OriginBenefit, benefitPath: string) => {
        if (benefit.kind === "casting-ability") {
          const key = abilityScope + "/" + benefit.id;
          if (localAbilities.has(key) && localAbilities.get(key) !== benefit.ability) {
            conflictedAbilities.add(key);
            add(benefitPath, "casting-ability-conflict");
            return;
          }
          localAbilities.set(key, benefit.ability);
          const pending = pendingSpells.get(key) ?? [];
          pendingSpells.delete(key);
          for (const emit of pending) emit();
        }
        if (benefit.kind === "spell" && typeof benefit.ability === "object") {
          const key = abilityScope + "/" + benefit.ability.choice;
          const resolved = localAbilities.get(key);
          if (resolved && !conflictedAbilities.has(key)) {
            apply({ ...benefit, ability: resolved }, benefitPath);
            return;
          }
          let emitted = false;
          const emit = () => {
            const ability = localAbilities.get(key);
            if (emitted || !ability || conflictedAbilities.has(key)) return;
            emitted = true;
            apply({ ...benefit, ability }, benefitPath);
          };
          pendingSpells.set(key, [...(pendingSpells.get(key) ?? []), emit]);
          deferredSpells.push(() => {
            if (!emitted) add(benefitPath, "casting-ability-required", "unresolved");
          });
          return;
        }
        if (benefit.kind === "reference") {
          childReferences.push({ key: benefit.dependency, path: benefitPath });
          return;
        }
        if (
          benefit.kind === "expertise" &&
          !proofs.has(benefit.category + ":" + benefit.id)
        ) {
          add(benefitPath, "expertise-proficiency", "unresolved");
          return;
        }
        if (benefit.kind === "spellcasting") hasSpellcasting = true;
        if (benefit.kind === "ability") {
          if (abilities[benefit.ability] === null) {
            add(benefitPath, "ability-context", "unresolved");
            return;
          }
          if (
            !rule(
              (abilities[benefit.ability] ?? 0) + benefit.amount <= 20,
              benefitPath,
              "ability-maximum"
            )
          )
            return;
          abilities[benefit.ability] = (abilities[benefit.ability] ?? 0) + benefit.amount;
        }
        if (benefit.kind === "proficiency" || benefit.kind === "expertise")
          proofs.add(benefit.category + ":" + benefit.id);
        result.facts.push({
          selectionId: selection.id,
          path: benefitPath,
          source,
          benefit,
        });
      };
      for (const [i, b] of ((d.benefits ?? []) as unknown as OriginBenefit[]).entries())
        apply(b, path + "/benefits/" + String(i));
      if (node.family === "class" && scopeData === undefined) {
        for (const ability of Array.isArray(d.savingThrows) ? d.savingThrows : [])
          apply(
            { kind: "proficiency", category: "save", id: String(ability) },
            path + "/savingThrows/" + String(ability)
          );
        const casting = originRecord(d.spellcasting);
        if (
          casting &&
          casting.mode !== "none" &&
          ABILITIES.includes(casting.ability as Ability)
        )
          apply(
            {
              kind: "spellcasting",
              ability: casting.ability as Ability,
              policy: "ability",
            },
            path + "/spellcasting"
          );
        const starting = originRecord(d.starting);
        if (starting)
          resolve(
            node,
            path + "/starting",
            source,
            depth,
            canonicalSource,
            table,
            starting,
            abilityScope
          );
        for (const row of Array.isArray(d.progression) ? d.progression : []) {
          const level = originRecord(row);
          if (level && level.level === classLevel)
            resolve(
              node,
              originNodePath(path + "/progression", String(level.id)),
              source,
              depth,
              canonicalSource,
              table,
              level,
              abilityScope
            );
        }
        const equipment = originRecord(d.startingEquipment);
        if (equipment) {
          apply(
            { kind: "gold", amount: Number(equipment.gold) },
            path + "/startingEquipment/gold"
          );
          for (const [index, value] of (Array.isArray(equipment.items)
            ? equipment.items
            : []
          ).entries()) {
            const item = originRecord(value);
            if (item)
              apply(
                {
                  kind: "equipment",
                  dependency: String(item.dependency),
                  quantity: Number(item.quantity),
                },
                path + "/startingEquipment/items/" + String(index)
              );
          }
        }
      }
      if (node.family === "species") {
        if (d.sizeChoice === undefined)
          apply({ kind: "size", size: d.size as "medium" }, path + "/size");
        for (const mode of MOVEMENT_MODES)
          if (Number(d[mode + "Speed"]) > 0)
            apply(
              { kind: "movement", mode, meters: Number(d[mode + "Speed"]) },
              path + "/" + mode + "Speed"
            );
        for (const sense of SENSES)
          if (Number(d[sense]) > 0)
            apply({ kind: "sense", sense, meters: Number(d[sense]) }, path + "/" + sense);
      }
      if (node.family === "background") {
        const abilityPath = path + "/background-abilities";
        usedAnswers.add(abilityPath);
        const answer = selection.answers[abilityPath] ?? [];
        const options = [d.ability1, d.ability2, d.ability3] as string[];
        const distribution = answer.map((a) => a.split(":"));
        const valid =
          distribution.every(
            ([a, n]) => options.includes(a ?? "") && ["1", "2"].includes(n ?? "")
          ) &&
          new Set(distribution.map((a) => a[0])).size === distribution.length &&
          ((distribution.length === 2 &&
            distribution.reduce((sum, a) => sum + Number(a[1]), 0) === 3) ||
            (distribution.length === 3 && distribution.every((a) => a[1] === "1")));
        if (valid)
          for (const [ability, amount] of distribution)
            apply(
              { kind: "ability", ability: ability as Ability, amount: Number(amount) },
              abilityPath + "/" + (ability ?? "")
            );
        else add(abilityPath, "background-distribution");
        for (const field of ["skill1", "skill2"])
          apply(
            {
              kind: "proficiency",
              category: "skill",
              id: typeof d[field] === "string" ? d[field] : "",
            },
            path + "/" + field
          );
        if (typeof d.tool === "string" && d.tool.trim())
          apply({ kind: "proficiency", category: "tool", id: d.tool }, path + "/tool");
        else if (d.toolChoice === undefined)
          add(path + "/tool", "background-tool-required");
        if (typeof d.originFeat === "string" && d.originFeat)
          childReferences.push({ key: d.originFeat, path: path + "/originFeat" });
        else if (d.originFeatChoice === undefined)
          add(path + "/originFeat", "background-feat-required");
        if (d.equipmentChoice === undefined) {
          const equipmentPath = path + "/background-equipment";
          usedAnswers.add(equipmentPath);
          const equipment = selection.answers[equipmentPath] ?? [];
          if (equipment.length !== 1 || !["bundle", "gold"].includes(equipment[0] ?? ""))
            add(equipmentPath, "equipment-choice");
          if (equipment.length === 1 && ["gold", "bundle"].includes(equipment[0] ?? ""))
            result.entitlements.push({
              selectionId: selection.id,
              path: equipmentPath,
              choice: equipment[0] as "gold" | "bundle",
              gold: equipment[0] === "gold" ? Number(d.equipmentGold) : 0,
              dependencies: equipment[0] === "bundle" ? (d.equipment as string[]) : [],
            });
          // Entitlement is represented as selected immutable authored references, never inventory transfers.
          if (equipment[0] === "bundle")
            for (const key of Array.isArray(d.equipment) ? d.equipment : [])
              result.facts.push({
                selectionId: selection.id,
                path: equipmentPath,
                source,
                benefit: {
                  kind: "reference",
                  dependency: typeof key === "string" ? key : "",
                },
              });
        }
      }
      const choices = (Array.isArray(d.choices)
        ? d.choices
        : []) as unknown as OriginChoice[];
      const expandedChoices = choices.map((choice) => ({ ...choice }));
      const poolResults = new Map<string, ReturnType<typeof resolveCatalogueChoice>>();
      const expanded = (choice: OriginChoice): OriginChoice => {
        if (choice.pool && !poolResults.has(choice.id)) {
          const choicePath = originNodePath(path, choice.id);
          poolResults.set(
            choice.id,
            resolveCatalogueChoice(
              choice.pool,
              selection.answers[choicePath] ?? [],
              selection.resolvedChoices?.[choicePath] ?? [],
              context,
              result.facts
            )
          );
          choice.options = poolResults.get(choice.id)?.options ?? [];
        }
        return choice;
      };
      const status = new Map<string, boolean>();
      const active = (
        rawChoice: OriginChoice,
        ancestors = new Set<string>()
      ): boolean => {
        const choice = expanded(rawChoice);
        if (status.has(choice.id)) return status.get(choice.id) ?? false;
        if (ancestors.has(choice.id)) return false;
        const parent = choice.parent;
        const parentChoice = parent
          ? expandedChoices.find((c) => c.id === parent.choiceId)
          : undefined;
        const value =
          !parent ||
          (!!parentChoice &&
            active(parentChoice, new Set(ancestors).add(choice.id)) &&
            (selection.answers[originNodePath(path, parent.choiceId)] ?? []).includes(
              parent.optionId
            ) &&
            (selection.answers[originNodePath(path, parent.choiceId)] ?? []).length ===
              parentChoice.count &&
            (selection.answers[originNodePath(path, parent.choiceId)] ?? []).every((id) =>
              parentChoice.options.some((option) => option.id === id)
            ));
        status.set(choice.id, value);
        return value;
      };
      const resolveChoice = (rawChoice: OriginChoice) => {
        const choice = expanded(rawChoice);
        const choicePath = originNodePath(path, choice.id);
        usedAnswers.add(choicePath);
        const selected = selection.answers[choicePath] ?? [];
        const enabled = active(choice);
        result.activeChoices.push({
          selectionId: selection.id,
          path: choicePath,
          choice,
          selected: [...selected],
          active: enabled,
        });
        if (!enabled) {
          if (selected.length) add(choicePath, "inactive-answer", "unresolved");
          return;
        }
        const poolResult = poolResults.get(choice.id);
        if (poolResult?.error) {
          add(choicePath, poolResult.error);
          return;
        }
        if (!choice.pool && (selection.resolvedChoices?.[choicePath]?.length ?? 0) > 0) {
          add(choicePath, "pool-snapshot-mismatch");
          return;
        }
        if (
          selected.length !== choice.count ||
          selected.some((id) => !choice.options.some((o) => o.id === id))
        ) {
          add(choicePath, "choice-answer");
          return;
        }
        let invalidSelected = false;
        for (const [index, selectedSnapshot] of (
          poolResult?.selectedSnapshots ?? []
        ).entries()) {
          // The resolver binds snapshots in selected option order. Entry IDs are
          // local to each source and can collide across owners or source kinds.
          const selectedId = selected[index];
          if (selectedId === undefined) continue;
          const selectedPath = originNodePath(choicePath, selectedId);
          const childIssues = conformAcquisitionSnapshot(
            selectedSnapshot,
            context.verifyCatalogue
          );
          if (childIssues.length) {
            invalidSelected = true;
            childIssues.forEach((issue) =>
              add(selectedPath + "/" + issue.path, issue.code, issue.severity)
            );
            continue;
          }
          if (choice.selectedGrant) continue;
          resolve(
            selectedSnapshot.definition,
            selectedPath,
            snapshotSource(selectedSnapshot),
            depth + 1,
            canonicalSourceOf(selectedSnapshot),
            originRecord(selectedSnapshot.definition.payload.data.dependencies) ?? {}
          );
        }
        if (invalidSelected) return;
        const grant = choice.selectedGrant;
        if (grant)
          for (const [index, selectedId] of selected.entries()) {
            const selectedPath = originNodePath(choicePath, selectedId);
            if (grant.kind === "spell")
              for (const [permissionIndex, entitlement] of grant.entitlements.entries())
                apply(
                  {
                    kind: "spell",
                    id: selectedId,
                    ability: grant.ability,
                    ...entitlement,
                  },
                  selectedPath + "/permissions/" + String(permissionIndex)
                );
            else if (grant.kind === "expertise")
              apply(
                { kind: "expertise", category: grant.category, id: selectedId },
                selectedPath
              );
            else if (grant.kind === "mastery")
              apply({ kind: "mastery", id: selectedId }, selectedPath);
            else {
              const snapshot = poolResult?.selectedSnapshots[index];
              if (snapshot)
                result.selectedEquipment.push({
                  selectionId: selection.id,
                  path: selectedPath,
                  snapshot,
                  quantity: grant.quantity,
                });
            }
          }
        for (const option of choice.options)
          if (selected.includes(option.id))
            option.benefits.forEach((b, i) =>
              apply(b, choicePath + "/" + option.id + "/" + String(i))
            );
        resolveReferences();
      };
      for (const choice of expandedChoices) {
        if (choice.phase === "dependent")
          deferredChoices.push(() => resolveChoice(choice));
        else resolveChoice(choice);
      }
      resolveReferences();
    };
    resolve(
      definition,
      "root",
      snapshotSource(selection.snapshot),
      0,
      canonicalSourceOf(selection.snapshot)
    );
    finalizers.push(() => {
      for (const path of Object.keys(selection.resolvedChoices ?? {}))
        if (!usedAnswers.has(path) && !Object.hasOwn(selection.answers, path))
          add(path, "obsolete-answer", "unresolved");
      for (const path of Object.keys(selection.answers))
        if (!usedAnswers.has(path)) add(path, "obsolete-answer", "unresolved");
      for (const e of selection.exceptions)
        if (
          ![
            "prerequisite-level",
            "prerequisite-ability",
            "prerequisite-proficiency",
            "prerequisite-training",
            "prerequisite-feat",
            "prerequisite-spellcasting",
            "prerequisite-any",
            "nonrepeatable-feat",
            "ability-maximum",
          ].includes(e.code)
        )
          add(e.path, "invalid-exception");
    });
  }
  for (const run of deferredChoices) run();
  for (const run of deferredSpells) run();
  for (const finish of finalizers) finish();
  result.valid = !result.diagnostics.some(originDiagnosticBlocks);
  return result;
}
export const originDiagnosticBlocks = (diagnostic: OriginDiagnostic): boolean =>
  !["inactive-answer", "obsolete-answer"].includes(diagnostic.code);
export function validateOriginSelection(
  character: FolioCharacter,
  build: OriginBuild,
  context: ChoiceResolutionContext = {}
): OriginDiagnostic[] {
  return composeOriginBuild(character, build, context).diagnostics.filter(
    originDiagnosticBlocks
  );
}
export function projectOriginCharacter(
  character: FolioCharacter,
  build: OriginBuild | null,
  context: ChoiceResolutionContext = {}
): OriginProjection {
  return projectAcquisitionCharacter(character, build, null, context);
}
export function projectAcquisitionCharacter(
  character: FolioCharacter,
  build: OriginBuild | null,
  classes: ClassBuild | null,
  context: ChoiceResolutionContext = {}
): OriginProjection {
  const composition = composeAcquisitionBuilds(character, build, classes, context);
  const mechanic = (snapshot: DefinitionSnapshot) => {
    const id = snapshot.definition.payload.data.mechanicId;
    return "kind" in snapshot && typeof id === "string" ? id : snapshot.entryId;
  };
  const validAggregate = !composition.diagnostics.some((d) =>
    ["incompatible-origin-build", "character-mismatch"].includes(d.code)
  );
  const selections = validAggregate
    ? Object.values(build?.selections ?? {}).sort((a, b) => a.ordinal - b.ordinal)
    : [];
  const species = selections.find((s) => s.snapshot.definition.family === "species");
  const background = selections.find(
    (s) => s.snapshot.definition.family === "background"
  );
  const abilities = baseAbilities(character, !!background);
  for (const fact of composition.facts)
    if (fact.benefit.kind === "ability")
      if (abilities[fact.benefit.ability] !== null)
        abilities[fact.benefit.ability] =
          (abilities[fact.benefit.ability] ?? 0) + fact.benefit.amount;
  const available =
    validAggregate && Object.values(abilities).every((value) => value !== null);
  const projectedCharacter = structuredClone(character);
  const b = projectedCharacter.sheet.build;
  const baseline = {
    build: structuredClone(character.sheet.build),
    superseded: [] as string[],
    unresolved: [] as string[],
  };
  if (species) {
    projectedCharacter.speciesId = mechanic(species.snapshot);
    b.race = mechanic(species.snapshot);
    baseline.superseded.push("race", "originFeats.species", "humanOriginFeat");
    delete b.humanOriginFeat;
    baseline.superseded.push("speed", "speeds", "senses", "size");
    delete b.speed;
    b.speeds = {};
    b.senses = {};
    delete b.size;
  }
  if (background) {
    b.background = mechanic(background.snapshot);
    baseline.superseded.push(
      "background",
      "asi.background",
      "originFeats.background",
      "bgFeat"
    );
    delete b.bgFeat;
    const asi = originRecord(b.asi);
    if (asi) delete asi.background;
  }
  if (
    classes &&
    !composition.diagnostics.some((d) => d.code === "incompatible-class-build")
  ) {
    const acquiredClasses = Object.values(classes.acquisitions);
    const first = acquiredClasses[0];
    if (first) projectedCharacter.classId = mechanic(first.snapshot);
    b.classes = acquiredClasses.map((c) => ({
      classId: mechanic(c.snapshot),
      level: c.classLevel,
    }));
  }
  const originFeats = originRecord(b.originFeats);
  if (originFeats) {
    if (species) delete originFeats.species;
    if (background) delete originFeats.background;
  }
  if (species || background) {
    if (Object.keys(originRecord(b.skills) ?? {}).length) {
      baseline.unresolved.push("skills");
      b.skills = {};
    }
    if (b.spellcasting) {
      baseline.unresolved.push("spellcasting");
      delete b.spellcasting;
    }
  }
  for (const { benefit } of composition.facts) {
    if (benefit.kind === "movement") {
      const speeds = originRecord(b.speeds) ?? {};
      const importedWalk =
        benefit.mode === "walk" && typeof b.speed === "number" ? b.speed : 0;
      speeds[benefit.mode] = Math.max(
        Number(speeds[benefit.mode] ?? 0),
        importedWalk,
        benefit.meters
      );
      b.speeds = speeds as JsonObject;
      if (benefit.mode === "walk") b.speed = speeds.walk as number;
    }
    if (benefit.kind === "sense") {
      const senses = originRecord(b.senses) ?? {};
      senses[benefit.sense] = Math.max(
        Number(senses[benefit.sense] ?? 0),
        benefit.meters
      );
      b.senses = senses as JsonObject;
    }
    if (benefit.kind === "size") b.size = benefit.size;
    if (benefit.kind === "resistance")
      b.resistances = [
        ...new Set([
          ...(Array.isArray(b.resistances) ? b.resistances : []),
          benefit.damageType,
        ]),
      ];
    if (benefit.kind === "spellcasting")
      b.spellcasting = { ability: upper[benefit.ability] };
    if (benefit.kind === "proficiency" || benefit.kind === "expertise") {
      if (benefit.category === "skill") {
        const skills = originRecord(b.skills) ?? {};
        if (benefit.kind === "expertise") skills[benefit.id] = "expertise";
        else if (skills[benefit.id] !== "expertise") skills[benefit.id] = "proficient";
        b.skills = skills as JsonObject;
      } else {
        const key =
          benefit.category === "tool"
            ? "toolProficiencyIds"
            : benefit.category === "language"
              ? "languageIds"
              : "savingThrows";
        const id =
          benefit.category === "save" ? upper[benefit.id as Ability] : benefit.id;
        b[key] = [...new Set([...(Array.isArray(b[key]) ? b[key] : []), id])];
      }
    }
  }
  const speeds = originRecord(b.speeds) ?? {};
  const bonus = (mode: string) =>
    composition.facts.reduce(
      (sum, { benefit }) =>
        sum +
        (benefit.kind === "movement-bonus" && benefit.mode === mode ? benefit.meters : 0),
      0
    );
  const walk =
    Math.max(Number(speeds.walk ?? 0), typeof b.speed === "number" ? b.speed : 0) +
    bonus("walk");
  if (walk || Object.hasOwn(speeds, "walk")) {
    speeds.walk = walk;
    b.speed = walk;
  }
  for (const mode of MOVEMENT_MODES.filter((mode) => mode !== "walk")) {
    const relationships = composition.facts.flatMap(({ benefit }) =>
      benefit.kind === "movement-equals-walk" && benefit.mode === mode
        ? [walk * benefit.multiplier]
        : []
    );
    const value = Math.max(Number(speeds[mode] ?? 0), ...relationships) + bonus(mode);
    if (value || Object.hasOwn(speeds, mode)) speeds[mode] = value;
  }
  if (Object.keys(speeds).length) b.speeds = speeds as JsonObject;
  // Base scores remain base scores; derived scores are a separate projection value.
  return {
    ...composition,
    abilities,
    available,
    projectedCharacter,
    species: {
      id: species ? mechanic(species.snapshot) : character.speciesId,
      name: species?.snapshot.definition.name ?? character.speciesId,
      selectionId: species?.id ?? null,
      catalogue: !!species && "kind" in species.snapshot,
    },
    background: {
      id:
        (background ? mechanic(background.snapshot) : undefined) ??
        (typeof character.sheet.build.background === "string"
          ? character.sheet.build.background
          : ""),
      name:
        background?.snapshot.definition.name ??
        (typeof character.sheet.build.background === "string"
          ? character.sheet.build.background
          : ""),
      selectionId: background?.id ?? null,
      catalogue: !!background && "kind" in background.snapshot,
    },
    baseline,
  };
}
