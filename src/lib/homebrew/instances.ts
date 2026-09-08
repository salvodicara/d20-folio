import { assertJsonBudget } from "../shared/json-budget";
import { equal } from "../shared/model";
import {
  parseDefinitionSnapshot,
  isLibrarySnapshot,
  sourceIdentity,
  sourceVersionLabel,
  type DefinitionSnapshot,
  type CatalogueVerifier,
} from "./sources";
import { type LibraryDefinition } from "../library/model";
import {
  characterPath,
  frozen,
  identityId,
  object,
  type CharacterRef,
  type FolioCharacter,
} from "../identity/model";
import { parseDefinition, type LibraryVersion } from "../library/model";
import type { Envelope } from "../shared/model";
export interface InstanceState {
  quantity: number;
  remainingCharges: number | null;
  prepared: boolean;
  equipped: boolean;
  attuned: boolean;
}
export interface BundledSnapshot {
  kind: "bundled";
  schema: 1;
  sourceKey: string;
  dependencyPath: string;
  definition: LibraryDefinition;
}
export type InstanceSnapshot = DefinitionSnapshot | BundledSnapshot;
export interface InitialLoadout {
  schema: 1;
  character: CharacterRef;
  revision: number;
  sources: Record<string, DefinitionSnapshot>;
  instances: Record<string, HomebrewInstance>;
  lastOperation: { uid: string; opId: string };
}
export interface HomebrewInstance {
  schema: 1;
  id: string;
  character: CharacterRef;
  revision: number;
  snapshot: InstanceSnapshot;
  state: InstanceState;
  lastOperation: { uid: string; opId: string };
}
export interface InstanceOperation extends Envelope {
  kind: "homebrew-add" | "homebrew-update" | "homebrew-state";
  character: CharacterRef;
  targetId: string;
  base: HomebrewInstance | null;
  snapshot: InstanceSnapshot;
  state: InstanceState;
  initialBase?: InitialLoadout;
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
export function parseInstanceVersion(
  value: unknown,
  verifyCatalogue?: CatalogueVerifier
): LibraryVersion {
  const snapshot = parseDefinitionSnapshot(value, verifyCatalogue);
  if (
    !isLibrarySnapshot(snapshot) ||
    !["weapon", "equipment", "spell", "feature"].includes(snapshot.definition.family)
  )
    throw new Error("incompatible-instance");
  return snapshot;
}
export function instancePath(character: CharacterRef, id: string) {
  if (isInitialInstanceId(id)) throw new Error("reserved-instance-id");
  return characterPath(character) + "/homebrew/" + identityId(id);
}
export function parseInstance(
  value: unknown,
  sources?: InitialLoadout["sources"],
  verifyCatalogue?: CatalogueVerifier
): HomebrewInstance {
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
  const grouped = isInitialInstanceId(String(i.id));
  if (grouped !== (sources !== undefined)) throw new Error("incompatible-instance");
  const snapshot = grouped
    ? parseInitialSnapshot(i.snapshot, sources ?? {}, verifyCatalogue)
    : parseInstanceVersion(i.snapshot, verifyCatalogue);
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
    (!isBundledSnapshot(snapshot) &&
      isLibrarySnapshot(snapshot) &&
      snapshot.ownerUid !== c.ownerUid) ||
    last.uid !== c.ownerUid
  )
    throw new Error("incompatible-instance");
  return frozen(structuredClone(i)) as unknown as HomebrewInstance;
}
export function materializeInstance(
  character: CharacterRef,
  id: string,
  snapshot: InstanceSnapshot,
  state: InstanceState,
  revision: number,
  lastOperation: HomebrewInstance["lastOperation"],
  sources?: InitialLoadout["sources"],
  verifyCatalogue?: CatalogueVerifier
): HomebrewInstance {
  return parseInstance(
    {
      schema: 1,
      character: { ownerUid: character.ownerUid, id: character.id },
      id,
      snapshot,
      state,
      revision,
      lastOperation,
    },
    sources,
    verifyCatalogue
  );
}
export const DEFAULT_INSTANCE_STATE: InstanceState = frozen({
  quantity: 1,
  remainingCharges: null,
  prepared: false,
  equipped: false,
  attuned: false,
});

export const isInitialInstanceId = (id: string): boolean => id.startsWith("initial_");
export const initialLoadoutPath = (character: CharacterRef): string =>
  characterPath(character) + "/loadout/initial";
export function isBundledSnapshot(
  snapshot: InstanceSnapshot
): snapshot is BundledSnapshot {
  return "kind" in snapshot && snapshot.kind === "bundled";
}
export function instanceVersionLabel(snapshot: InstanceSnapshot): string {
  return isBundledSnapshot(snapshot) ? "—" : sourceVersionLabel(snapshot);
}
export function parseInitialSnapshot(
  value: unknown,
  sources: InitialLoadout["sources"],
  verifyCatalogue?: CatalogueVerifier
): InstanceSnapshot {
  const v = object(value);
  let snapshot: InstanceSnapshot;
  if (v.kind === "bundled") {
    keys(v, ["kind", "schema", "sourceKey", "dependencyPath", "definition"]);
    if (
      v.schema !== 1 ||
      typeof v.sourceKey !== "string" ||
      typeof v.dependencyPath !== "string"
    )
      throw new Error("incompatible-instance");
    const source = sources[v.sourceKey];
    if (!source) throw new Error("incompatible-instance");
    const dependencies = object(source.definition.payload.data.dependencies);
    const dependency = object(dependencies[v.dependencyPath]);
    if (!equal(dependency.definition, v.definition))
      throw new Error("incompatible-instance");
    parseDefinition(v.definition);
    snapshot = frozen(structuredClone(v)) as unknown as BundledSnapshot;
  } else snapshot = parseDefinitionSnapshot(v, verifyCatalogue ?? (() => false));
  if (!["weapon", "equipment", "spell", "feature"].includes(snapshot.definition.family))
    throw new Error("incompatible-instance");
  return snapshot;
}
export function parseInitialLoadout(
  value: unknown,
  verifyCatalogue?: CatalogueVerifier
): InitialLoadout {
  assertJsonBudget(value, 180000, 4096);
  const v = object(value);
  keys(v, ["schema", "character", "revision", "sources", "instances", "lastOperation"]);
  const character = object(v.character);
  keys(character, ["ownerUid", "id"]);
  if ([character.ownerUid, character.id].some((s) => typeof s !== "string"))
    throw new Error("incompatible-instance");
  characterPath(character as unknown as CharacterRef);
  if (v.schema !== 1 || !integer(v.revision) || Number(v.revision) < 1)
    throw new Error("incompatible-instance");
  const sources = object(v.sources) as InitialLoadout["sources"];
  for (const [key, value] of Object.entries(sources)) {
    const source = parseDefinitionSnapshot(value, verifyCatalogue ?? (() => false));
    if (
      sourceIdentity(source) !== key ||
      (isLibrarySnapshot(source) && source.ownerUid !== character.ownerUid)
    )
      throw new Error("incompatible-instance");
  }
  const last = object(v.lastOperation);
  keys(last, ["uid", "opId"]);
  if (last.uid !== character.ownerUid || typeof last.opId !== "string")
    throw new Error("incompatible-instance");
  identityId(last.opId);
  for (const [id, value] of Object.entries(object(v.instances))) {
    const instance = parseInstance(value, sources, verifyCatalogue);
    if (id !== instance.id || !equal(instance.character, character))
      throw new Error("incompatible-instance");
  }
  return frozen(structuredClone(v)) as unknown as InitialLoadout;
}
/** Whole-group CAS input/output; unrelated instances and frozen sources remain exact. */
export function updateInitialLoadoutState(
  base: InitialLoadout,
  id: string,
  state: InstanceState,
  lastOperation: HomebrewInstance["lastOperation"],
  verifyCatalogue?: CatalogueVerifier
): InitialLoadout {
  const item = base.instances[id];
  if (!item) throw new Error("incompatible-instance");
  return updateInitialLoadoutInstance(
    base,
    id,
    item.snapshot,
    state,
    lastOperation,
    verifyCatalogue
  );
}
export function updateInitialLoadoutInstance(
  base: InitialLoadout,
  id: string,
  snapshot: InstanceSnapshot,
  state: InstanceState,
  lastOperation: HomebrewInstance["lastOperation"],
  verifyCatalogue?: CatalogueVerifier
): InitialLoadout {
  const parsed = parseInitialLoadout(base, verifyCatalogue);
  const item = parsed.instances[id];
  if (!item) throw new Error("incompatible-instance");
  if (
    !equal(item.snapshot, snapshot) &&
    (isBundledSnapshot(item.snapshot) ||
      isBundledSnapshot(snapshot) ||
      !isLibrarySnapshot(item.snapshot) ||
      !isLibrarySnapshot(snapshot) ||
      item.snapshot.entryId !== snapshot.entryId ||
      !equal(item.state, state))
  )
    throw new Error("invalid-operation");
  return parseInitialLoadout(
    {
      ...parsed,
      revision: parsed.revision + 1,
      lastOperation,
      instances: {
        ...parsed.instances,
        [id]: {
          ...item,
          snapshot,
          revision: item.revision + 1,
          state: parseInstanceState(state),
          lastOperation,
        },
      },
    },
    verifyCatalogue
  );
}
