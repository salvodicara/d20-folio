import { assertJsonBudget } from "../shared/json-budget";
import {
  frozen,
  identityId,
  type CharacterRef,
  type FolioCharacter,
  type JsonObject,
} from "../identity/model";
import { libraryPath, parseDefinition, type LibraryVersion } from "../library/model";
import { conformDefinition } from "./conformance";
import { ABILITIES } from "./model";
import {
  isOriginFamily,
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
  snapshot: LibraryVersion;
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
  source: { ownerUid: string; id: string; version: number };
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
export interface OriginComposition {
  entitlements: OriginEquipmentEntitlement[];
  facts: OriginFact[];
  diagnostics: OriginDiagnostic[];
  activeChoices: ActiveOriginChoice[];
  valid: boolean;
}
export interface OriginProjection extends OriginComposition {
  abilities: Record<Ability, number | null>;
  species: { id: string; name: string; selectionId: string | null };
  background: { id: string; name: string; selectionId: string | null };
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
function parseSnapshot(value: unknown): LibraryVersion {
  const v = record(value);
  keys(v, [
    "schema",
    "ownerUid",
    "entryId",
    "version",
    "definition",
    "provenance",
    "operationId",
  ]);
  if (
    v.schema !== 1 ||
    !safeInt(v.version, 1) ||
    typeof v.ownerUid !== "string" ||
    typeof v.entryId !== "string" ||
    typeof v.operationId !== "string"
  )
    fail();
  libraryPath({ ownerUid: v.ownerUid, id: v.entryId });
  identityId(v.operationId);
  parseDefinition(v.definition);
  if (v.provenance !== null) {
    const p = record(v.provenance);
    keys(p, ["source", "sourceVersion", "senderUid", "offerId", "grantId"]);
    const source = record(p.source);
    keys(source, ["ownerUid", "id"]);
    libraryPath(source as unknown as { ownerUid: string; id: string });
    if (
      !safeInt(p.sourceVersion, 1) ||
      typeof p.senderUid !== "string" ||
      typeof p.offerId !== "string" ||
      p.grantId !== p.senderUid + "~" + p.offerId
    )
      fail();
    identityId(p.senderUid);
    identityId(p.offerId);
  }
  return v as unknown as LibraryVersion;
}
export function parseOriginBuild(value: unknown): OriginBuild {
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
      const s = record(value);
      keys(s, ["id", "ordinal", "snapshot", "answers", "exceptions"]);
      if (s.id !== id || !safeInt(s.ordinal) || ordinals.has(Number(s.ordinal))) fail();
      ordinals.add(Number(s.ordinal));
      const snapshot = parseSnapshot(s.snapshot);
      if (!isOriginFamily(snapshot.definition.family)) fail();
      const answers = record(s.answers);
      if (Object.keys(answers).length > 1024) fail();
      for (const [path, answer] of Object.entries(answers)) {
        if (
          !path.startsWith("root/") ||
          path.length > 8192 ||
          !Array.isArray(answer) ||
          answer.length > 32 ||
          answer.some((a) => typeof a !== "string" || a.length > 200) ||
          new Set(answer).size !== answer.length
        )
          fail();
      }
      if (!Array.isArray(s.exceptions) || s.exceptions.length > 128) fail();
      for (const value of s.exceptions) {
        const e = record(value);
        keys(e, ["path", "code", "reason", "authorUid"]);
        if (
          typeof e.path !== "string" ||
          e.path.length > 8192 ||
          typeof e.code !== "string" ||
          e.code.length > 100 ||
          typeof e.reason !== "string" ||
          !e.reason.trim() ||
          e.reason.length > 2000 ||
          typeof e.authorUid !== "string"
        )
          fail();
        identityId(e.authorUid);
      }
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
export function composeOriginBuild(
  character: FolioCharacter,
  build: OriginBuild | null
): OriginComposition {
  const result: OriginComposition = {
    entitlements: [],
    facts: [],
    diagnostics: [],
    activeChoices: [],
    valid: true,
  };
  let parsed: OriginBuild | null = null;
  if (build !== null) {
    try {
      parsed = parseOriginBuild(build);
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
  const selections = Object.values(parsed?.selections ?? {}).sort(
    (a, b) => a.ordinal - b.ordinal
  );
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
  for (const selection of selections) {
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
    const declarations = conformDefinition(definition);
    if (declarations.length) {
      for (const diagnostic of declarations)
        add(diagnostic.path, diagnostic.code, diagnostic.severity);
      continue;
    }
    const dependencies = originRecord(definition.payload.data.dependencies) ?? {};
    const visited = new Set<string>();
    const usedAnswers = new Set<string>();
    const evaluate = (p: OriginPrerequisite, path: string): boolean => {
      switch (p.kind) {
        case "all":
          return p.requirements
            .map((r, i) => evaluate(r, path + ".requirements." + String(i)))
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
                path + ".requirements." + String(i)
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
          return rule(character.level >= p.minimum, path, "prerequisite-level");
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
        case "feat": {
          if (p.dependency !== undefined) {
            const dependency = dependencies[p.dependency] as OriginDependency | undefined;
            if (!dependency) {
              add(path, "missing-reference");
              return false;
            }
            return rule(
              acquired.has(
                originFeatIdentity(
                  dependency.definition,
                  dependency.provenance?.source ?? dependency.source
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
      canonicalSource: { ownerUid: string; id: string } = source
    ): void => {
      if (depth > 8) {
        add(path, "dependency-depth");
        return;
      }
      const d = node.payload.data;
      const identity = originFeatIdentity(node, canonicalSource);
      const prereqs = (Array.isArray(d.prerequisites)
        ? d.prerequisites
        : []) as unknown as OriginPrerequisite[];
      const eligible = prereqs
        .map((p, i) => evaluate(p, path + "/prerequisites/" + String(i)))
        .every(Boolean);
      const repeatable =
        node.family !== "feat" || d.repeatable === true || !acquired.has(identity);
      if (!rule(repeatable, path, "nonrepeatable-feat") || !eligible) return;
      if (node.family === "feat") {
        acquired.add(identity);
        if (typeof d.mechanicId === "string" && d.mechanicId !== "custom")
          feats.add(d.mechanicId);
      }
      const childReferences: { key: string; path: string }[] = [];
      const apply = (benefit: OriginBenefit, benefitPath: string) => {
        if (benefit.kind === "reference") {
          childReferences.push({ key: benefit.dependency, path: benefitPath });
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
        if (benefit.kind === "proficiency")
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
      if (node.family === "species") {
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
        else add(path + "/tool", "background-tool-required");
        if (typeof d.originFeat === "string" && d.originFeat)
          childReferences.push({ key: d.originFeat, path: path + "/originFeat" });
        else add(path + "/originFeat", "background-feat-required");
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
      const choices = (Array.isArray(d.choices)
        ? d.choices
        : []) as unknown as OriginChoice[];
      const status = new Map<string, boolean>();
      const active = (choice: OriginChoice, ancestors = new Set<string>()): boolean => {
        if (status.has(choice.id)) return status.get(choice.id) ?? false;
        if (ancestors.has(choice.id)) return false;
        const parent = choice.parent;
        const parentChoice = parent
          ? choices.find((c) => c.id === parent.choiceId)
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
      for (const choice of choices) {
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
          continue;
        }
        if (
          selected.length !== choice.count ||
          selected.some((id) => !choice.options.some((o) => o.id === id))
        ) {
          add(choicePath, "choice-answer");
          continue;
        }
        for (const option of choice.options)
          if (selected.includes(option.id))
            option.benefits.forEach((b, i) =>
              apply(b, choicePath + "/" + option.id + "/" + String(i))
            );
      }
      for (const child of childReferences) {
        const dependency = dependencies[child.key] as OriginDependency | undefined;
        const childPath = originNodePath(path, child.key);
        if (!dependency) {
          add(child.path, "missing-reference");
          continue;
        }
        if (visited.has(child.key)) {
          continue;
        }
        visited.add(child.key);
        resolve(
          dependency.definition,
          childPath,
          { ...dependency.source, version: dependency.sourceVersion },
          depth + 1,
          dependency.provenance?.source ?? dependency.source
        );
      }
    };
    resolve(
      definition,
      "root",
      {
        ownerUid: selection.snapshot.ownerUid,
        id: selection.snapshot.entryId,
        version: selection.snapshot.version,
      },
      0,
      selection.snapshot.provenance?.source
    );
    for (const path of Object.keys(selection.answers))
      if (!usedAnswers.has(path)) add(path, "obsolete-answer", "unresolved");
    for (const e of selection.exceptions)
      if (
        ![
          "prerequisite-level",
          "prerequisite-ability",
          "prerequisite-proficiency",
          "prerequisite-feat",
          "prerequisite-spellcasting",
          "prerequisite-any",
          "nonrepeatable-feat",
          "ability-maximum",
        ].includes(e.code)
      )
        add(e.path, "invalid-exception");
  }
  result.valid = !result.diagnostics.some(originDiagnosticBlocks);
  return result;
}
export const originDiagnosticBlocks = (diagnostic: OriginDiagnostic): boolean =>
  !["inactive-answer", "obsolete-answer"].includes(diagnostic.code);
export function validateOriginSelection(
  character: FolioCharacter,
  build: OriginBuild
): OriginDiagnostic[] {
  return composeOriginBuild(character, build).diagnostics.filter(originDiagnosticBlocks);
}
export function projectOriginCharacter(
  character: FolioCharacter,
  build: OriginBuild | null
): OriginProjection {
  const composition = composeOriginBuild(character, build);
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
    projectedCharacter.speciesId = species.snapshot.entryId;
    b.race = species.snapshot.entryId;
    baseline.superseded.push("race", "originFeats.species", "humanOriginFeat");
    delete b.humanOriginFeat;
    baseline.superseded.push("speed", "speeds", "senses", "size");
    delete b.speed;
    b.speeds = {};
    b.senses = {};
    delete b.size;
  }
  if (background) {
    b.background = background.snapshot.entryId;
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
    if (benefit.kind === "proficiency") {
      if (benefit.category === "skill") {
        const skills = originRecord(b.skills) ?? {};
        if (skills[benefit.id] !== "expertise") skills[benefit.id] = "proficient";
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
  // Base scores remain base scores; derived scores are a separate projection value.
  return {
    ...composition,
    abilities,
    available,
    projectedCharacter,
    species: {
      id: species?.snapshot.entryId ?? character.speciesId,
      name: species?.snapshot.definition.name ?? character.speciesId,
      selectionId: species?.id ?? null,
    },
    background: {
      id:
        background?.snapshot.entryId ??
        (typeof character.sheet.build.background === "string"
          ? character.sheet.build.background
          : ""),
      name:
        background?.snapshot.definition.name ??
        (typeof character.sheet.build.background === "string"
          ? character.sheet.build.background
          : ""),
      selectionId: background?.id ?? null,
    },
    baseline,
  };
}
