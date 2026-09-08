export { conformAcquisitionSnapshot } from "./conformance";
import { assertJsonBudget } from "../shared/json-budget";
import { frozen, identityId, object } from "../identity/model";
import {
  libraryPath,
  parseDefinition,
  parseEntry,
  type LibraryDefinition,
  type LibraryRef,
  type LibraryVersion,
  type Provenance,
  type JsonValue,
} from "../library/model";

/** A catalogue claim is structural data until checked against the pinned adapter output. */
export interface CatalogueSnapshot {
  kind: "catalogue";
  schema: 1;
  catalogue: string;
  release: string;
  adapterVersion: number;
  entryId: string;
  definition: LibraryDefinition;
  sourceData?: JsonValue;
}
export type DefinitionSnapshot = LibraryVersion | CatalogueSnapshot;
export type CatalogueVerifier = (
  snapshot: CatalogueSnapshot,
  included?: boolean
) => boolean;
export type DefinitionSource =
  | { ownerUid: string; id: string; version: number }
  | {
      kind: "catalogue";
      catalogue: string;
      release: string;
      adapterVersion: number;
      id: string;
    };
export type CanonicalSource =
  | LibraryRef
  | { kind: "catalogue"; catalogue: string; id: string };
export interface LibraryDependency {
  source: LibraryRef;
  sourceVersion: number;
  provenance: Provenance | null;
  definition: LibraryDefinition;
}
export type DefinitionDependency = LibraryDependency | CatalogueSnapshot;
export function isCatalogueSnapshot(
  value: DefinitionSnapshot | DefinitionDependency
): value is CatalogueSnapshot {
  return "kind" in value;
}
export function isLibrarySnapshot(value: DefinitionSnapshot): value is LibraryVersion {
  return !isCatalogueSnapshot(value);
}
function keys(value: Record<string, unknown>, expected: string[]) {
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error("incompatible-source");
}
export function parseDefinitionSnapshot(
  value: unknown,
  verifyCatalogue?: CatalogueVerifier,
  included = false
): DefinitionSnapshot {
  const v = object(value);
  if (Object.hasOwn(v, "kind")) {
    keys(v, [
      "kind",
      "schema",
      "catalogue",
      "release",
      "adapterVersion",
      "entryId",
      "definition",
      ...(Object.hasOwn(v, "sourceData") ? ["sourceData"] : []),
    ]);
    if (
      v.kind !== "catalogue" ||
      v.schema !== 1 ||
      !Number.isSafeInteger(v.adapterVersion) ||
      Number(v.adapterVersion) < 1 ||
      [v.catalogue, v.release, v.entryId].some(
        (s) => typeof s !== "string" || !s.trim() || s.length > 200
      )
    )
      throw new Error("incompatible-source");
    const definition = parseDefinition(v.definition);
    if (Object.hasOwn(v, "sourceData")) assertJsonBudget(v.sourceData, 200000, 4096);
    if (verifyCatalogue) verifyIncludedCatalogueSources(definition, verifyCatalogue);
    const snapshot = frozen(structuredClone(v)) as unknown as CatalogueSnapshot;
    if (verifyCatalogue && !verifyCatalogue(snapshot, included))
      throw new Error("incompatible-catalogue");
    return snapshot;
  }
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
    !Number.isSafeInteger(v.version) ||
    Number(v.version) < 1 ||
    [v.ownerUid, v.entryId, v.operationId].some((s) => typeof s !== "string")
  )
    throw new Error("incompatible-source");
  libraryPath({ ownerUid: String(v.ownerUid), id: String(v.entryId) });
  identityId(String(v.operationId));
  parseEntry({
    schema: 1,
    ownerUid: v.ownerUid,
    id: v.entryId,
    revision: 1,
    draft: v.definition,
    stableVersion: v.version,
    provenance: v.provenance,
    lastOperation: { uid: v.ownerUid, opId: v.operationId },
  });
  if (verifyCatalogue)
    verifyIncludedCatalogueSources(parseDefinition(v.definition), verifyCatalogue);
  return frozen(structuredClone(v)) as unknown as LibraryVersion;
}
/** Complete immutable address; author-authored labels never establish catalogue identity. */
export function sourceIdentity(snapshot: DefinitionSnapshot): string {
  return isCatalogueSnapshot(snapshot)
    ? JSON.stringify([
        "catalogue",
        snapshot.catalogue,
        snapshot.release,
        snapshot.adapterVersion,
        snapshot.entryId,
      ])
    : JSON.stringify([snapshot.ownerUid, snapshot.entryId, snapshot.version]);
}
export function snapshotSource(snapshot: DefinitionSnapshot): DefinitionSource {
  return isCatalogueSnapshot(snapshot)
    ? {
        kind: "catalogue",
        catalogue: snapshot.catalogue,
        release: snapshot.release,
        adapterVersion: snapshot.adapterVersion,
        id: snapshot.entryId,
      }
    : { ownerUid: snapshot.ownerUid, id: snapshot.entryId, version: snapshot.version };
}
export function canonicalSource(snapshot: DefinitionSnapshot): CanonicalSource {
  return isCatalogueSnapshot(snapshot)
    ? { kind: "catalogue", catalogue: snapshot.catalogue, id: snapshot.entryId }
    : (snapshot.provenance?.source ?? {
        ownerUid: snapshot.ownerUid,
        id: snapshot.entryId,
      });
}
export function dependencySource(dependency: DefinitionDependency): DefinitionSource {
  return isCatalogueSnapshot(dependency)
    ? snapshotSource(dependency)
    : { ...dependency.source, version: dependency.sourceVersion };
}
export function canonicalDependencySource(
  dependency: DefinitionDependency
): CanonicalSource {
  return isCatalogueSnapshot(dependency)
    ? canonicalSource(dependency)
    : (dependency.provenance?.source ?? dependency.source);
}
export function sourceVersionLabel(snapshot: DefinitionSnapshot): string {
  return isCatalogueSnapshot(snapshot) ? snapshot.release : String(snapshot.version);
}

function verifyIncludedCatalogueSources(
  definition: LibraryDefinition,
  verifyCatalogue: CatalogueVerifier
): void {
  const dependencies = definition.payload.data.dependencies;
  if (
    dependencies === null ||
    typeof dependencies !== "object" ||
    Array.isArray(dependencies)
  )
    return;
  for (const value of Object.values(dependencies)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.kind === "catalogue"
    )
      parseDefinitionSnapshot(value, verifyCatalogue, true);
  }
}
