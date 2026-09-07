import { frozen, identityId, object, type FolioCampaign } from "../identity/model";
import {
  libraryPath,
  parseDefinition,
  parseEntry,
  type LibraryVersion,
} from "../library/model";
import { CONDITIONS, validResourceId } from "./model";
import type { Envelope } from "../shared/model";
export type PreparedState =
  | {
      kind: "monster";
      label: string;
      currentHp: number;
      tempHp: number;
      conditions: string[];
      resources: Record<string, number>;
    }
  | { kind: "campaign-rule"; enabled: boolean };
export interface PreparedCopy {
  schema: 1;
  id: string;
  campaignId: string;
  preparationId: string | null;
  revision: number;
  snapshot: LibraryVersion;
  state: PreparedState;
  lastOperation: { uid: string; opId: string };
}
export interface PreparationOperation extends Envelope {
  kind:
    | "preparation-add"
    | "preparation-update"
    | "preparation-state"
    | "preparation-remove";
  campaignId: string;
  preparationId: string | null;
  targetId: string;
  base: PreparedCopy | null;
  snapshot: LibraryVersion;
  state: PreparedState;
}
export interface PreparationReceipt {
  operation: PreparationOperation;
  revision: number;
}
export interface PreparationIssue {
  path: string;
  original: string;
  error: "incompatible-preparation";
}
export interface PreparationRepository {
  list(campaignId: string, preparationId: string | null): Promise<PreparedCopy[]>;
  watch(
    campaignId: string,
    preparationId: string | null,
    onData: (copies: PreparedCopy[]) => void,
    onError: (error: Error) => void
  ): () => void;
  watchIssues(listener: (issues: PreparationIssue[]) => void): () => void;
  addIntent(
    campaign: FolioCampaign,
    version: LibraryVersion,
    preparationId: string | null,
    state?: PreparedState,
    id?: string
  ): PreparationOperation;
  updateIntent(
    campaign: FolioCampaign,
    base: PreparedCopy,
    version: LibraryVersion
  ): PreparationOperation;
  stateIntent(
    campaign: FolioCampaign,
    base: PreparedCopy,
    state: PreparedState
  ): PreparationOperation;
  removeIntent(campaign: FolioCampaign, base: PreparedCopy): PreparationOperation;
  commit(
    operation: PreparationOperation,
    check?: () => void
  ): Promise<PreparationReceipt>;
  reconcile(operation: PreparationOperation): Promise<PreparationReceipt | null>;
}
function keys(o: Record<string, unknown>, expected: string[]) {
  if (
    Object.keys(o).length !== expected.length ||
    !expected.every((k) => Object.hasOwn(o, k))
  )
    throw new Error("incompatible-preparation");
}
function integer(v: unknown) {
  return Number.isSafeInteger(v) && Number(v) >= 0;
}
export function preparationCollection(campaignId: string, preparationId: string | null) {
  return (
    `folioCampaigns/${identityId(campaignId)}/` +
    (preparationId === null
      ? "rules"
      : `preparations/${identityId(preparationId)}/monsters`)
  );
}
export function preparationPath(
  campaignId: string,
  preparationId: string | null,
  id: string
) {
  return preparationCollection(campaignId, preparationId) + "/" + identityId(id);
}
export function parsePreparedState(value: unknown): PreparedState {
  const s = object(value);
  if (s.kind === "campaign-rule") {
    keys(s, ["kind", "enabled"]);
    if (typeof s.enabled !== "boolean") throw new Error("incompatible-preparation");
  } else {
    keys(s, ["kind", "label", "currentHp", "tempHp", "conditions", "resources"]);
    const r = object(s.resources);
    if (
      s.kind !== "monster" ||
      typeof s.label !== "string" ||
      s.label.length > 120 ||
      !integer(s.currentHp) ||
      !integer(s.tempHp) ||
      !Array.isArray(s.conditions) ||
      s.conditions.length > 64 ||
      s.conditions.some((c) => !(CONDITIONS as readonly unknown[]).includes(c)) ||
      Object.keys(r).length > 32 ||
      Object.entries(r).some(([k, v]) => !validResourceId(k) || !integer(v))
    )
      throw new Error("incompatible-preparation");
  }
  return frozen(structuredClone(s)) as unknown as PreparedState;
}
export function parsePreparationVersion(value: unknown): LibraryVersion {
  const v = object(value);
  keys(v, [
    "schema",
    "ownerUid",
    "entryId",
    "version",
    "definition",
    "provenance",
    "operationId",
  ]);
  if ([v.ownerUid, v.entryId, v.operationId].some((x) => typeof x !== "string"))
    throw new Error("incompatible-preparation");
  libraryPath({ ownerUid: String(v.ownerUid), id: String(v.entryId) });
  identityId(String(v.operationId));
  const definition = parseDefinition(v.definition);
  if (
    v.schema !== 1 ||
    !integer(v.version) ||
    Number(v.version) < 1 ||
    !["monster", "campaign-rule"].includes(definition.family)
  )
    throw new Error("incompatible-preparation");
  // Reuse P04's complete provenance validation without translating or projecting its snapshot.
  parseEntry({
    schema: 1,
    ownerUid: v.ownerUid,
    id: v.entryId,
    revision: 1,
    draft: definition,
    stableVersion: v.version,
    provenance: v.provenance,
    lastOperation: { uid: v.ownerUid, opId: v.operationId },
  });
  return frozen(structuredClone(v)) as unknown as LibraryVersion;
}
export function parsePreparedCopy(value: unknown): PreparedCopy {
  const i = object(value);
  keys(i, [
    "schema",
    "id",
    "campaignId",
    "preparationId",
    "revision",
    "snapshot",
    "state",
    "lastOperation",
  ]);
  if (
    typeof i.id !== "string" ||
    typeof i.campaignId !== "string" ||
    (i.preparationId !== null && typeof i.preparationId !== "string")
  )
    throw new Error("incompatible-preparation");
  preparationPath(i.campaignId, i.preparationId, i.id);
  const v = parsePreparationVersion(i.snapshot),
    s = parsePreparedState(i.state),
    last = object(i.lastOperation);
  keys(last, ["uid", "opId"]);
  if (typeof last.uid !== "string" || typeof last.opId !== "string")
    throw new Error("incompatible-preparation");
  identityId(last.uid);
  identityId(last.opId);
  if (
    i.schema !== 1 ||
    !integer(i.revision) ||
    Number(i.revision) < 1 ||
    s.kind !== v.definition.family ||
    (s.kind === "campaign-rule") !== (i.preparationId === null)
  )
    throw new Error("incompatible-preparation");
  return frozen(structuredClone(i)) as unknown as PreparedCopy;
}
export function materializePreparedCopy(
  campaignId: string,
  preparationId: string | null,
  id: string,
  snapshot: LibraryVersion,
  state: PreparedState,
  revision: number,
  lastOperation: PreparedCopy["lastOperation"]
): PreparedCopy {
  return parsePreparedCopy({
    schema: 1,
    campaignId,
    preparationId,
    id,
    snapshot,
    state,
    revision,
    lastOperation,
  });
}
export function defaultPreparedState(version: LibraryVersion): PreparedState {
  parsePreparationVersion(version);
  if (version.definition.family === "campaign-rule")
    return frozen({ kind: "campaign-rule", enabled: false });
  const d = version.definition.payload.data,
    resources: Record<string, number> = {};
  if (!Array.isArray(d.resources)) throw new Error("incompatible-preparation");
  if (Array.isArray(d.resources))
    for (const row of d.resources) {
      if (
        row &&
        typeof row === "object" &&
        !Array.isArray(row) &&
        typeof row.id === "string" &&
        integer(row.capacity) &&
        validResourceId(row.id)
      )
        Object.defineProperty(resources, row.id, {
          value: row.capacity,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      else throw new Error("incompatible-preparation");
    }
  return parsePreparedState({
    kind: "monster",
    label: version.definition.name.slice(0, 120),
    currentHp: integer(d.maxHp) ? d.maxHp : 0,
    tempHp: 0,
    conditions: [],
    resources,
  });
}
