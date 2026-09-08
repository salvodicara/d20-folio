import { SRD_ORIGIN_LANGUAGES } from "@/data/languages";
import { ABILITIES } from "../homebrew/model";
import {
  composeAcquisitionBuilds,
  type ActiveOriginChoice,
  type OriginBuild,
  type OriginComposition,
  type OriginDiagnostic,
  type OriginSelection,
} from "../homebrew/origin-build";
import type { ClassBuild, InitialClassAcquisition } from "../homebrew/class-build";
import { sourceIdentity, type DefinitionSnapshot } from "../homebrew/sources";
import { originNodePath, originRecord, type OriginDependency } from "../homebrew/origins";
import {
  DEFAULT_INSTANCE_STATE,
  materializeInstance,
  parseInitialLoadout,
  type InitialLoadout,
  type InstanceSnapshot,
} from "../homebrew/instances";
import { equal } from "../shared/model";
import type { FolioCharacter, JsonObject } from "../identity/model";
import type { ResolvedPoolOption } from "../homebrew/choice-pools";
import { checkCreationAbilities, type CreationScores } from "./abilities";
import {
  newCreationDraft,
  selectCreationSource,
  parseCreationDraft,
  type CreationDraft,
  type CreationRole,
} from "./model";
import { catalogueSnapshot, verifyCatalogueSnapshot } from "./catalogue";
import { resolveCreationPool } from "./catalogue-pools";

export interface CreationPreview {
  valid: boolean;
  issues: OriginDiagnostic[];
  composition: OriginComposition;
  abilities: CreationScores;
  maxHp: number;
  gold: number;
  character: FolioCharacter;
  origins: OriginBuild;
  classes: ClassBuild | null;
  loadout: InitialLoadout;
  options(choice: ActiveOriginChoice): ResolvedPoolOption[];
}
const jsonObject = (value: unknown): JsonObject =>
  JSON.parse(JSON.stringify(value)) as JsonObject;
function active(draft: CreationDraft, role: CreationRole): OriginSelection | undefined {
  const key = draft.sources[role];
  return key ? draft.selections[key] : undefined;
}
function sourceId(selection: OriginSelection | undefined): string {
  if (!selection) return "";
  if (!("kind" in selection.snapshot)) return selection.snapshot.entryId;
  const id = selection.snapshot.definition.payload.data.mechanicId;
  if (typeof id !== "string") throw new Error("incompatible-creation-source");
  return id;
}
function initialLoadout(
  draft: CreationDraft,
  composition: OriginComposition,
  issues: OriginDiagnostic[]
): InitialLoadout {
  const character = { ownerUid: draft.ownerUid, id: draft.id };
  const lastOperation = { uid: draft.ownerUid, opId: draft.id };
  const loadout: InitialLoadout = {
    schema: 1,
    character,
    revision: 1,
    sources: {},
    instances: {},
    lastOperation,
  };
  // Only currently active acquisition paths may supply copies. Retained answers are recovery data.
  const nodes: { selectionId: string; path: string; snapshot: DefinitionSnapshot }[] = [];
  for (const role of ["class", "species", "background"] as const) {
    const selection = active(draft, role);
    if (!selection) continue;
    nodes.push({ selectionId: selection.id, path: "root", snapshot: selection.snapshot });
    for (const choice of composition.activeChoices) {
      if (!choice.active || choice.selectionId !== selection.id || !choice.choice.pool)
        continue;
      if (
        choice.selected.length !== choice.choice.count ||
        choice.selected.some(
          (id) => !choice.choice.options.some((option) => option.id === id)
        )
      )
        continue;
      const snapshots = selection.resolvedChoices?.[choice.path] ?? [];
      choice.selected.forEach((id, index) => {
        const snapshot = snapshots[index];
        if (snapshot)
          nodes.push({
            selectionId: selection.id,
            path: originNodePath(choice.path, id),
            snapshot,
          });
      });
    }
  }
  const containing = (selectionId: string, path: string) =>
    nodes
      .filter(
        (node) =>
          node.selectionId === selectionId &&
          (path === node.path || path.startsWith(node.path + "/"))
      )
      .sort((a, b) => b.path.length - a.path.length);
  const missing = (selectionId: string, path: string, code = "missing-initial-item") => {
    issues.push({ selectionId, path, code, severity: "unsupported" });
  };
  let index = 0;
  const add = (
    snapshot: InstanceSnapshot,
    quantity: number,
    path: string,
    prepared = false
  ) => {
    try {
      const id = "initial_" + String(index++);
      loadout.instances[id] = materializeInstance(
        character,
        id,
        snapshot,
        { ...DEFAULT_INSTANCE_STATE, quantity, prepared },
        1,
        lastOperation,
        loadout.sources,
        verifyCatalogueSnapshot
      );
    } catch {
      issues.push({ path, code: "incompatible-initial-item", severity: "unsupported" });
    }
  };
  const bundled = (
    root: DefinitionSnapshot,
    dependency: string,
    child: OriginDependency
  ): InstanceSnapshot => {
    const sourceKey = sourceIdentity(root);
    loadout.sources[sourceKey] = root;
    return {
      kind: "bundled",
      schema: 1,
      sourceKey,
      dependencyPath: dependency,
      definition: child.definition,
    };
  };
  const included = (
    selectionId: string,
    dependency: string,
    quantity: number,
    path: string
  ) => {
    const root = containing(selectionId, path)[0]?.snapshot;
    const child = originRecord(root?.definition.payload.data.dependencies)?.[
      dependency
    ] as OriginDependency | undefined;
    if (!root || !child) return missing(selectionId, path);
    add(bundled(root, dependency, child), quantity, path);
  };
  for (const fact of composition.facts)
    if (fact.benefit.kind === "equipment")
      included(
        fact.selectionId,
        fact.benefit.dependency,
        fact.benefit.quantity,
        fact.path
      );
  for (const entitlement of composition.entitlements)
    for (const dependency of entitlement.dependencies)
      included(entitlement.selectionId, dependency, 1, entitlement.path);
  for (const item of composition.selectedEquipment)
    add(item.snapshot, item.quantity, item.path);

  const spells = new Map<
    string,
    { snapshot: InstanceSnapshot; prepared: boolean; path: string }
  >();
  for (const fact of composition.facts) {
    if (fact.benefit.kind !== "spell") continue;
    const benefit = fact.benefit;
    const node = containing(fact.selectionId, fact.path)[0];
    let snapshot: InstanceSnapshot | undefined;
    if (node?.snapshot.definition.family === "spell") {
      snapshot = node.snapshot;
    } else if (node) {
      const table =
        originRecord(node.snapshot.definition.payload.data.dependencies) ?? {};
      const matches = Object.entries(table).filter(([, raw]) => {
        const dependency = raw as OriginDependency;
        return (
          dependency.definition.family === "spell" &&
          dependency.definition.payload.data.mechanicId === benefit.id
        );
      });
      if (matches.length > 1) {
        missing(fact.selectionId, fact.path, "ambiguous-initial-spell");
        continue;
      }
      const match = matches[0];
      if (match)
        snapshot = bundled(node.snapshot, match[0], match[1] as OriginDependency);
      else if ("kind" in node.snapshot) {
        try {
          snapshot = catalogueSnapshot("spell:" + benefit.id);
        } catch {
          /* Missing official data is diagnosed below, never fabricated. */
        }
      }
    }
    if (!snapshot) {
      missing(fact.selectionId, fact.path, "missing-initial-spell");
      continue;
    }
    const key =
      "kind" in snapshot && snapshot.kind === "bundled"
        ? snapshot.sourceKey + "/" + snapshot.dependencyPath
        : sourceIdentity(snapshot);
    const previous = spells.get(key);
    spells.set(key, {
      snapshot,
      prepared: previous?.prepared === true || benefit.policy === "prepared",
      path: fact.path,
    });
  }
  for (const spell of spells.values()) add(spell.snapshot, 1, spell.path, spell.prepared);
  try {
    return parseInitialLoadout(loadout, verifyCatalogueSnapshot);
  } catch {
    issues.push({
      path: "loadout",
      code: "creation-loadout-budget",
      severity: "invalid",
    });
    return loadout;
  }
}

/** Pure review. Stored base scores, acquisition facts and initial personal state have separate owners. */
export function previewCreation(draft: CreationDraft): CreationPreview {
  const ref = { ownerUid: draft.ownerUid, id: draft.id };
  const lastOperation = { uid: draft.ownerUid, opId: draft.id };
  const selectedOrigins = [active(draft, "species"), active(draft, "background")].filter(
    (s): s is OriginSelection => !!s
  );
  const origins: OriginBuild = {
    schema: 1,
    character: ref,
    revision: 1,
    selections: Object.fromEntries(selectedOrigins.map((s) => [s.id, s])),
    lastOperation,
  };
  const classSelection = active(draft, "class");
  const classes: ClassBuild | null = classSelection
    ? {
        schema: 1,
        character: ref,
        revision: 1,
        acquisitions: { [classSelection.id]: classSelection as InitialClassAcquisition },
        lastOperation,
      }
    : null;
  const languages = [...SRD_ORIGIN_LANGUAGES.known, ...draft.languages];
  const character: FolioCharacter = {
    ...ref,
    schema: 1,
    name: draft.name.trim(),
    speciesId: sourceId(active(draft, "species")),
    classId: sourceId(classSelection),
    level: 1,
    revision: 0,
    currentAssignment: null,
    portraitPath: null,
    sheet: {
      build: {
        abilities: jsonObject(
          Object.fromEntries(
            ABILITIES.map((a) => [a.slice(0, 3).toUpperCase(), draft.scores[a]])
          )
        ),
        alignment: draft.alignment,
        languageIds: languages,
        creation: jsonObject({
          schema: 1,
          kind: "guided",
          operationId: draft.id,
          method: draft.method,
          abilityExceptions: draft.exceptions,
        }),
      },
      state: {},
    },
  };
  const issues: OriginDiagnostic[] = [];
  if (!character.name)
    issues.push({ path: "name", code: "creation-name-required", severity: "invalid" });
  for (const role of ["species", "background", "class"] as const)
    if (!active(draft, role))
      issues.push({ path: role, code: "creation-source-required", severity: "invalid" });
  if (
    draft.languages.length !== SRD_ORIGIN_LANGUAGES.choice.count ||
    new Set(languages).size !== languages.length ||
    draft.languages.some((id) => !SRD_ORIGIN_LANGUAGES.choice.options.includes(id))
  )
    issues.push({
      path: "languages",
      code: "creation-languages-required",
      severity: "invalid",
    });
  for (const issue of checkCreationAbilities(
    draft.method,
    draft.scores,
    draft.exceptions,
    draft.ownerUid
  ).issues)
    issues.push({ path: issue.path, code: issue.code, severity: "invalid" });
  const resolvedOptions = new WeakMap<object, ResolvedPoolOption[]>();
  const resolvePool = (
    pool: Parameters<typeof resolveCreationPool>[0],
    facts: Parameters<typeof resolveCreationPool>[1]
  ) => {
    const options = resolveCreationPool(pool, facts).filter(
      (o) =>
        !o.option.benefits.some(
          (b) =>
            b.kind === "proficiency" &&
            b.category === "language" &&
            languages.includes(b.id)
        )
    );
    resolvedOptions.set(pool, options);
    return options;
  };
  const composition = composeAcquisitionBuilds(character, origins, classes, {
    verifyCatalogue: verifyCatalogueSnapshot,
    resolvePool,
  });
  issues.push(
    ...composition.diagnostics.filter(
      (d) => !["inactive-answer", "obsolete-answer"].includes(d.code)
    )
  );
  const abilities = { ...draft.scores };
  for (const fact of composition.facts)
    if (fact.benefit.kind === "ability" && abilities[fact.benefit.ability] !== null)
      abilities[fact.benefit.ability] =
        (abilities[fact.benefit.ability] ?? 0) + fact.benefit.amount;
  const hitDie = Number(classSelection?.snapshot.definition.payload.data.hitDie ?? 0);
  const constitution = abilities.constitution;
  const hpBonus = composition.facts.reduce(
    (sum, f) => sum + (f.benefit.kind === "hp-per-level" ? f.benefit.amount : 0),
    0
  );
  const maxHp =
    Math.max(
      1,
      hitDie + (constitution === null ? 0 : Math.floor((constitution - 10) / 2))
    ) + hpBonus;
  const gold =
    composition.facts.reduce(
      (sum, f) => sum + (f.benefit.kind === "gold" ? f.benefit.amount : 0),
      0
    ) + composition.entitlements.reduce((sum, e) => sum + e.gold, 0);
  character.sheet.state = {
    hp: { current: maxHp, temp: 0 },
    currency: { gp: gold, pp: 0, ep: 0, sp: 0, cp: 0 },
    conditions: [],
  };
  const loadout = initialLoadout(draft, composition, issues);
  return {
    valid: issues.length === 0,
    issues,
    composition,
    abilities,
    maxHp,
    gold,
    character,
    origins,
    classes,
    loadout,
    options(choice) {
      return choice.choice.pool
        ? (resolvedOptions.get(choice.choice.pool) ?? [])
        : choice.choice.options.map((option) => ({ option }));
    },
  };
}

export function creationCandidate(
  draft: CreationDraft
): Pick<CreationPreview, "character" | "origins" | "loadout"> & { classes: ClassBuild } {
  const preview = previewCreation(
    parseCreationDraft(draft, draft.ownerUid, verifyCatalogueSnapshot)
  );
  if (!preview.valid || !preview.classes) throw new Error("invalid-creation");
  return {
    character: preview.character,
    origins: preview.origins,
    classes: preview.classes,
    loadout: preview.loadout,
  };
}

/** Repository boundary recomputes the review; neither caller-supplied HP nor inventory is trusted. */
export function validateCreationCandidate(
  output: ReturnType<typeof creationCandidate>
): void {
  const character = output.character;
  const b = character.sheet.build,
    marker = b.creation;
  if (
    !marker ||
    Array.isArray(marker) ||
    typeof marker !== "object" ||
    marker.schema !== 1 ||
    marker.kind !== "guided" ||
    typeof marker.operationId !== "string"
  )
    throw new Error("invalid-creation");
  let draft = newCreationDraft(character.ownerUid, character.id);
  draft.name = character.name;
  draft.alignment = typeof b.alignment === "string" ? b.alignment : "";
  draft.method = marker.method as CreationDraft["method"];
  draft.exceptions = structuredClone(
    marker.abilityExceptions
  ) as unknown as CreationDraft["exceptions"];
  const base = b.abilities;
  if (
    !base ||
    Array.isArray(base) ||
    typeof base !== "object" ||
    !Array.isArray(b.languageIds)
  )
    throw new Error("invalid-creation");
  draft.scores = Object.fromEntries(
    ABILITIES.map((a) => [a, base[a.slice(0, 3).toUpperCase()]])
  ) as CreationScores;
  if (b.languageIds.some((id) => typeof id !== "string"))
    throw new Error("invalid-creation");
  draft.languages = (b.languageIds as string[]).filter(
    (id) => !SRD_ORIGIN_LANGUAGES.known.includes(id)
  );
  for (const selection of [
    ...Object.values(output.origins.selections),
    ...Object.values(output.classes.acquisitions),
  ]) {
    const role = selection.snapshot.definition.family;
    if (role !== "species" && role !== "background" && role !== "class")
      throw new Error("invalid-creation");
    if (draft.sources[role]) throw new Error("invalid-creation");
    draft = selectCreationSource(draft, role, selection.snapshot);
    const key = draft.sources[role];
    if (!key) throw new Error("invalid-creation");
    draft.selections[key] = structuredClone(selection);
  }
  const expected = structuredClone(creationCandidate(draft));
  const witness = { uid: character.ownerUid, opId: marker.operationId };
  expected.character.sheet.build.creation = {
    ...(expected.character.sheet.build.creation as JsonObject),
    operationId: marker.operationId,
  };
  expected.origins.lastOperation = witness;
  expected.classes.lastOperation = witness;
  expected.loadout.lastOperation = witness;
  for (const instance of Object.values(expected.loadout.instances))
    instance.lastOperation = witness;
  if (!equal(output, expected)) throw new Error("invalid-creation");
}
