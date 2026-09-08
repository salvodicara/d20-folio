import { ABILITIES } from "../homebrew/model";
import { parseAcquisitionSelection } from "../homebrew/acquisition-selection";
import type { InitialClassAcquisition } from "../homebrew/class-build";
import type { OriginException, OriginSelection } from "../homebrew/origin-build";
import {
  sourceIdentity,
  type CatalogueVerifier,
  type DefinitionSnapshot,
} from "../homebrew/sources";
import { frozen, identityId, object } from "../identity/model";
import { assertJsonBudget } from "../shared/json-budget";
import type { CreationMethod, CreationScores } from "./abilities";

export const CREATION_STEPS = [
  "identity",
  "origins",
  "class",
  "abilities",
  "equipment",
  "review",
] as const;
export type CreationStep = (typeof CREATION_STEPS)[number];
export type CreationRole = "species" | "background" | "class";
export interface CreationDraft {
  schema: 1;
  id: string;
  ownerUid: string;
  name: string;
  alignment: string;
  step: CreationStep;
  method: CreationMethod;
  scores: CreationScores;
  languages: string[];
  exceptions: OriginException[];
  sources: Record<CreationRole, string | null>;
  /** A source has one retained answer owner; active roles only reference it. */
  selections: Record<string, OriginSelection | InitialClassAcquisition>;
}
export function newCreationDraft(ownerUid: string, id: string): CreationDraft {
  identityId(ownerUid);
  identityId(id);
  return {
    schema: 1,
    id,
    ownerUid,
    name: "",
    alignment: "neutral",
    step: "identity",
    method: "standard",
    scores: Object.fromEntries(ABILITIES.map((a) => [a, null])) as CreationScores,
    languages: [],
    exceptions: [],
    sources: { species: null, background: null, class: null },
    selections: {},
  };
}
export function selectCreationSource(
  draft: CreationDraft,
  role: CreationRole,
  snapshot: DefinitionSnapshot
): CreationDraft {
  if (snapshot.definition.family !== role)
    throw new Error("incompatible-creation-source");
  const next = structuredClone(draft);
  const key = role + ":" + sourceIdentity(snapshot);
  next.sources[role] = key;
  next.selections[key] ??= {
    id: role,
    ordinal: role === "background" ? 1 : 0,
    snapshot: structuredClone(snapshot),
    answers: {},
    exceptions: [],
    ...(role === "class" ? { classLevel: 1 as const } : {}),
  };
  return next;
}
export function answerCreationChoice(
  draft: CreationDraft,
  role: CreationRole,
  path: string,
  values: string[],
  snapshots: DefinitionSnapshot[] = []
): CreationDraft {
  const next = structuredClone(draft);
  const key = next.sources[role];
  const selection = key ? next.selections[key] : undefined;
  if (!selection) throw new Error("creation-source-required");
  selection.answers[path] = [...values];
  selection.resolvedChoices ??= {};
  if (snapshots.length) selection.resolvedChoices[path] = structuredClone(snapshots);
  else Reflect.deleteProperty(selection.resolvedChoices, path);
  return next;
}
export function parseCreationDraft(
  value: unknown,
  ownerUid: string,
  verifyCatalogue: CatalogueVerifier
): CreationDraft {
  try {
    assertJsonBudget(value, 600000, 4096);
    const v = object(value),
      sources = object(v.sources),
      selections = object(v.selections),
      scores = object(v.scores);
    const fields = [
      "schema",
      "id",
      "ownerUid",
      "name",
      "alignment",
      "step",
      "method",
      "scores",
      "languages",
      "exceptions",
      "sources",
      "selections",
    ];
    if (
      Object.keys(v).length !== fields.length ||
      fields.some((k) => !Object.hasOwn(v, k)) ||
      v.schema !== 1 ||
      v.ownerUid !== ownerUid ||
      typeof v.id !== "string" ||
      typeof v.name !== "string" ||
      v.name.length > 200 ||
      typeof v.alignment !== "string" ||
      v.alignment.length > 100 ||
      !CREATION_STEPS.includes(v.step as CreationStep) ||
      typeof v.method !== "string" ||
      !["standard", "points", "manual"].includes(v.method) ||
      Object.keys(scores).length !== 6 ||
      ABILITIES.some(
        (a) =>
          !Object.hasOwn(scores, a) ||
          (scores[a] !== null &&
            (typeof scores[a] !== "number" || !Number.isFinite(scores[a])))
      ) ||
      !Array.isArray(v.languages) ||
      v.languages.length > 32 ||
      v.languages.some((l) => typeof l !== "string" || l.length > 200) ||
      new Set(v.languages).size !== v.languages.length ||
      !Array.isArray(v.exceptions) ||
      v.exceptions.length > 128 ||
      Object.keys(sources).length !== 3
    )
      throw new Error();
    identityId(ownerUid);
    identityId(v.id);
    for (const role of ["species", "background", "class"] as const) {
      if (
        !Object.hasOwn(sources, role) ||
        (sources[role] !== null &&
          (typeof sources[role] !== "string" ||
            !sources[role].startsWith(role + ":") ||
            !Object.hasOwn(selections, sources[role])))
      )
        throw new Error();
    }
    for (const [key, value] of Object.entries(selections)) {
      const role = key.slice(0, key.indexOf(":"));
      if (!["species", "background", "class"].includes(role)) throw new Error();
      const selection = parseAcquisitionSelection(
        value,
        role === "class" ? "class" : "origin",
        verifyCatalogue
      );
      if (
        selection.id !== role ||
        selection.ordinal !== (role === "background" ? 1 : 0) ||
        selection.snapshot.definition.family !== role ||
        key !== role + ":" + sourceIdentity(selection.snapshot)
      )
        throw new Error();
    }
    for (const value of v.exceptions) {
      const e = object(value);
      if (
        Object.keys(e).length !== 4 ||
        e.authorUid !== ownerUid ||
        typeof e.path !== "string" ||
        e.path.length > 8192 ||
        typeof e.code !== "string" ||
        e.code.length > 100 ||
        typeof e.reason !== "string" ||
        !e.reason.trim() ||
        e.reason.length > 2000
      )
        throw new Error();
    }
    return frozen(structuredClone(v)) as unknown as CreationDraft;
  } catch {
    throw new Error("incompatible-creation-draft");
  }
}
