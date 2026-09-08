import type { OriginFact } from "./origin-build";
import { equal } from "../shared/model";
import { parseDefinitionSnapshot, isCatalogueSnapshot } from "./sources";
import type { AuthoringDiagnostic } from "./conformance";
import type { OriginOption } from "./origins";
import type { CatalogueVerifier, DefinitionSnapshot } from "./sources";

export type CataloguePoolQuery =
  | {
      kind: "spell";
      classSpellLists?: string[];
      minimumLevel: number;
      maximumLevel: number;
      ritualOnly?: boolean;
      schools?: string[];
      ids?: string[];
    }
  | { kind: "feat"; categories?: string[]; classScope?: string; ids?: string[] }
  | {
      kind: "proficiency";
      categories: ("skill" | "tool" | "language")[];
      toolCategories?: string[];
      ids?: string[];
      proficientOnly?: boolean;
    }
  | { kind: "equipment"; categories?: string[]; ids?: string[] }
  | {
      kind: "mastery";
      ids?: string[];
      categories?: string[];
      properties?: string[];
      proficientOnly?: boolean;
    };
export interface CataloguePool {
  kind: "catalogue";
  catalogue: string;
  release: string;
  adapterVersion: number;
  query: CataloguePoolQuery;
}
export interface ResolvedPoolOption {
  option: OriginOption;
  snapshot?: DefinitionSnapshot;
}
export interface ChoiceResolutionContext {
  inheritedFacts?: readonly OriginFact[];
  verifyCatalogue?: CatalogueVerifier;
  resolvePool?: (pool: CataloguePool) => readonly ResolvedPoolOption[];
}
export function conformCataloguePool(
  value: unknown,
  path: string
): AuthoringDiagnostic[] {
  const issues: AuthoringDiagnostic[] = [];
  const add = (
    p: string,
    code: string,
    severity: AuthoringDiagnostic["severity"] = "invalid"
  ) => issues.push({ path: p, code, severity });
  const record = (v: unknown): Record<string, unknown> | null =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  const known = (v: Record<string, unknown>, fields: string[], p: string) => {
    for (const k of Object.keys(v))
      if (!fields.includes(k)) add(p + "." + k, "unsupported-field", "unsupported");
  };
  const p = record(value);
  const q = record(p?.query);
  if (!p || !q) return [{ path, code: "invalid-pool", severity: "invalid" }];
  known(p, ["kind", "catalogue", "release", "adapterVersion", "query"], path);
  if (p.kind !== "catalogue") add(path + ".kind", "unsupported-pool-kind", "unsupported");
  for (const key of ["catalogue", "release"])
    if (typeof p[key] !== "string" || !p[key].trim() || p[key].length > 200)
      add(path + "." + key, "invalid-pool");
  if (!Number.isSafeInteger(p.adapterVersion) || Number(p.adapterVersion) < 1)
    add(path + ".adapterVersion", "invalid-number");
  const fields: Record<string, string[]> = {
    spell: [
      "classSpellLists",
      "minimumLevel",
      "maximumLevel",
      "ritualOnly",
      "schools",
      "ids",
    ],
    feat: ["categories", "classScope", "ids"],
    proficiency: ["categories", "toolCategories", "ids", "proficientOnly"],
    equipment: ["categories", "ids"],
    mastery: ["ids", "categories", "properties", "proficientOnly"],
  };
  const allowed = fields[String(q.kind)];
  if (!allowed) {
    add(path + ".query.kind", "unsupported-pool-kind", "unsupported");
    return issues;
  }
  known(q, ["kind", ...allowed], path + ".query");
  for (const k of [
    "classSpellLists",
    "schools",
    "ids",
    "categories",
    "toolCategories",
    "properties",
  ])
    if (
      Object.hasOwn(q, k) &&
      (!Array.isArray(q[k]) ||
        q[k].some((s: unknown) => typeof s !== "string" || !s.trim() || s.length > 200) ||
        new Set(q[k]).size !== q[k].length)
    )
      add(path + ".query." + k, "invalid-pool");
  if (
    q.kind === "spell" &&
    (![q.minimumLevel, q.maximumLevel].every(
      (n) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 9
    ) ||
      Number(q.minimumLevel) > Number(q.maximumLevel))
  )
    add(path + ".query", "invalid-spell-range");
  if (
    q.kind === "proficiency" &&
    (!Array.isArray(q.categories) ||
      !q.categories.length ||
      q.categories.some((c) => !["skill", "tool", "language"].includes(String(c))))
  )
    add(path + ".query.categories", "invalid-pool");
  for (const k of ["ritualOnly", "proficientOnly"])
    if (Object.hasOwn(q, k) && typeof q[k] !== "boolean")
      add(path + ".query." + k, "invalid-pool");
  if (
    Object.hasOwn(q, "classScope") &&
    (typeof q.classScope !== "string" || !q.classScope.trim())
  )
    add(path + ".query.classScope", "invalid-pool");
  return issues;
}

/** Resolve the full query for browsing; only answer-bound snapshots are retained by callers. */
export function resolveCatalogueChoice(
  pool: CataloguePool,
  selected: readonly string[],
  snapshots: readonly DefinitionSnapshot[],
  context: ChoiceResolutionContext
): {
  options: OriginOption[];
  selectedSnapshots: DefinitionSnapshot[];
  error: string | null;
} {
  if (!context.resolvePool || conformCataloguePool(pool, "pool").length)
    return { options: [], selectedSnapshots: [], error: "unavailable-pool" };
  const candidates = context.resolvePool(pool);
  const ids = new Set(candidates.map(({ option }) => option.id));
  if (ids.size !== candidates.length)
    return { options: [], selectedSnapshots: [], error: "invalid-pool" };
  const chosen = selected.map((id) => candidates.find(({ option }) => option.id === id));
  const requiresSnapshot = ["feat", "spell", "equipment"].includes(pool.query.kind);
  if (
    new Set(selected).size !== selected.length ||
    selected.length > 32 ||
    chosen.some(
      (candidate) => candidate && Boolean(candidate.snapshot) !== requiresSnapshot
    )
  )
    return {
      options: candidates.map(({ option }) => structuredClone(option)),
      selectedSnapshots: [],
      error: "pool-snapshot-mismatch",
    };
  const expected = chosen.flatMap((c) => (c?.snapshot ? [c.snapshot] : []));
  const options = candidates.map(({ option }) => structuredClone(option));
  if (chosen.some((c) => !c))
    return { options, selectedSnapshots: [], error: "stale-pool-option" };
  if (!equal(expected, snapshots))
    return { options, selectedSnapshots: [], error: "pool-snapshot-mismatch" };
  try {
    for (const snapshot of expected) {
      parseDefinitionSnapshot(snapshot, context.verifyCatalogue ?? (() => false));
      if (
        isCatalogueSnapshot(snapshot) &&
        (snapshot.catalogue !== pool.catalogue ||
          snapshot.release !== pool.release ||
          snapshot.adapterVersion !== pool.adapterVersion)
      )
        throw new Error("pool-source-mismatch");
      if (
        (pool.query.kind === "spell" || pool.query.kind === "feat") &&
        snapshot.definition.family !== pool.query.kind
      )
        throw new Error("pool-family-mismatch");
      if (
        pool.query.kind === "equipment" &&
        !["equipment", "weapon"].includes(snapshot.definition.family)
      )
        throw new Error("pool-family-mismatch");
    }
  } catch {
    return { options, selectedSnapshots: [], error: "pool-snapshot-mismatch" };
  }
  return { options, selectedSnapshots: expected, error: null };
}
