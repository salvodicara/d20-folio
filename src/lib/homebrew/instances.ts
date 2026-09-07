import {
  characterPath,
  frozen,
  identityId,
  object,
  type CharacterRef,
  type FolioCharacter,
} from "../identity/model";
import {
  libraryPath,
  parseDefinition,
  parseEntry,
  type LibraryVersion,
} from "../library/model";
import type { Envelope } from "../shared/model";
export interface InstanceState {
  quantity: number;
  remainingCharges: number | null;
  prepared: boolean;
  equipped: boolean;
  attuned: boolean;
}
export interface HomebrewInstance {
  schema: 1;
  id: string;
  character: CharacterRef;
  revision: number;
  snapshot: LibraryVersion;
  state: InstanceState;
  lastOperation: { uid: string; opId: string };
}
export interface InstanceOperation extends Envelope {
  kind: "homebrew-add" | "homebrew-update" | "homebrew-state";
  character: CharacterRef;
  targetId: string;
  base: HomebrewInstance | null;
  snapshot: LibraryVersion;
  state: InstanceState;
}
export interface InstanceReceipt {
  operation: InstanceOperation;
  revision: number;
}
export interface InstanceIssue {
  path: string;
  original: string;
  error: "incompatible-instance";
}
export interface InstanceRepository {
  list(character: CharacterRef): Promise<HomebrewInstance[]>;
  watch(
    character: CharacterRef,
    onData: (instances: HomebrewInstance[]) => void,
    onError: (error: Error) => void
  ): () => void;
  watchIssues(onIssues: (issues: InstanceIssue[]) => void): () => void;
  addIntent(
    character: FolioCharacter,
    version: LibraryVersion,
    state?: InstanceState,
    id?: string
  ): InstanceOperation;
  updateIntent(
    character: FolioCharacter,
    base: HomebrewInstance,
    version: LibraryVersion
  ): InstanceOperation;
  stateIntent(
    character: FolioCharacter,
    base: HomebrewInstance,
    state: InstanceState
  ): InstanceOperation;
  commit(operation: InstanceOperation, check?: () => void): Promise<InstanceReceipt>;
  reconcile(operation: InstanceOperation): Promise<InstanceReceipt | null>;
}
function keys(o: Record<string, unknown>, expected: string[]) {
  if (
    Object.keys(o).length !== expected.length ||
    !expected.every((k) => Object.hasOwn(o, k))
  )
    throw new Error("incompatible-instance");
}
function integer(v: unknown) {
  return Number.isSafeInteger(v) && Number(v) >= 0;
}
export function parseInstanceState(value: unknown): InstanceState {
  const s = object(value);
  keys(s, ["quantity", "remainingCharges", "prepared", "equipped", "attuned"]);
  if (
    !integer(s.quantity) ||
    (s.remainingCharges !== null && !integer(s.remainingCharges)) ||
    [s.prepared, s.equipped, s.attuned].some((v) => typeof v !== "boolean")
  )
    throw new Error("incompatible-instance");
  return frozen(structuredClone(s)) as unknown as InstanceState;
}
export function parseInstanceVersion(value: unknown): LibraryVersion {
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
    throw new Error("incompatible-instance");
  libraryPath({ ownerUid: String(v.ownerUid), id: String(v.entryId) });
  identityId(String(v.operationId));
  const definition = parseDefinition(v.definition);
  if (
    v.schema !== 1 ||
    !integer(v.version) ||
    Number(v.version) < 1 ||
    !["weapon", "equipment", "spell", "feature"].includes(definition.family)
  )
    throw new Error("incompatible-instance");
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
export function instancePath(character: CharacterRef, id: string) {
  return characterPath(character) + "/homebrew/" + identityId(id);
}
export function parseInstance(value: unknown): HomebrewInstance {
  const i = object(value);
  keys(i, [
    "schema",
    "id",
    "character",
    "revision",
    "snapshot",
    "state",
    "lastOperation",
  ]);
  const c = object(i.character);
  keys(c, ["ownerUid", "id"]);
  if ([c.ownerUid, c.id, i.id].some((x) => typeof x !== "string"))
    throw new Error("incompatible-instance");
  characterPath(c as unknown as CharacterRef);
  identityId(String(i.id));
  const snapshot = parseInstanceVersion(i.snapshot);
  parseInstanceState(i.state);
  const last = object(i.lastOperation);
  keys(last, ["uid", "opId"]);
  if ([last.uid, last.opId].some((x) => typeof x !== "string"))
    throw new Error("incompatible-instance");
  identityId(String(last.uid));
  identityId(String(last.opId));
  if (
    i.schema !== 1 ||
    !integer(i.revision) ||
    Number(i.revision) < 1 ||
    snapshot.ownerUid !== c.ownerUid ||
    last.uid !== c.ownerUid
  )
    throw new Error("incompatible-instance");
  return frozen(structuredClone(i)) as unknown as HomebrewInstance;
}
export function materializeInstance(
  character: CharacterRef,
  id: string,
  snapshot: LibraryVersion,
  state: InstanceState,
  revision: number,
  lastOperation: HomebrewInstance["lastOperation"]
): HomebrewInstance {
  return parseInstance({
    schema: 1,
    character: { ownerUid: character.ownerUid, id: character.id },
    id,
    snapshot,
    state,
    revision,
    lastOperation,
  });
}
export const DEFAULT_INSTANCE_STATE: InstanceState = frozen({
  quantity: 1,
  remainingCharges: null,
  prepared: false,
  equipped: false,
  attuned: false,
});
