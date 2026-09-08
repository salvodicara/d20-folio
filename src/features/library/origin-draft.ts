import { identityId, parseCharacter, type FolioCharacter } from "@/lib/identity/model";
import {
  parseOriginBuild,
  type OriginBuild,
  type OriginSelection,
} from "@/lib/homebrew/origin-build";
import { equal } from "@/lib/shared/model";
export interface OriginDraft {
  schema: 1;
  character: FolioCharacter;
  base: OriginBuild | null;
  targetId: string;
  selection: OriginSelection | null;
  invalidated: boolean;
}
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function loadOriginDraft(
  storage: DraftStorage,
  key: string,
  character: FolioCharacter
): { draft: OriginDraft | null; original: string | null; storageError: boolean } {
  let original: string | null = null;
  try {
    original = storage.getItem(key);
    if (original === null) return { draft: null, original: null, storageError: false };
    const value = JSON.parse(original) as Partial<OriginDraft> | null;
    if (
      !value ||
      Object.keys(value).length !== 6 ||
      !["schema", "character", "base", "targetId", "selection", "invalidated"].every(
        (k) => Object.hasOwn(value, k)
      )
    )
      throw Error("incompatible-origin-draft");
    if (
      value.schema !== 1 ||
      typeof value.invalidated !== "boolean" ||
      typeof value.targetId !== "string"
    )
      throw Error("incompatible-origin-draft");
    const source = parseCharacter(value.character);
    identityId(value.targetId);
    if (source.ownerUid !== character.ownerUid || source.id !== character.id)
      throw Error("incompatible-origin-draft");
    const base = value.base === null ? null : parseOriginBuild(value.base);
    if (
      base &&
      (base.character.ownerUid !== source.ownerUid || base.character.id !== source.id)
    )
      throw Error("incompatible-origin-draft");
    // The codec checks exact snapshots and answer shapes without certifying incomplete choices.
    const candidate = parseOriginBuild({
      schema: 1,
      character: { ownerUid: source.ownerUid, id: source.id },
      revision: 1,
      selections: value.selection === null ? {} : { [value.targetId]: value.selection },
      lastOperation: { uid: source.ownerUid, opId: "draft" },
    });
    const selection = candidate.selections[value.targetId] ?? null;
    if (value.selection !== null && !selection) throw Error("incompatible-origin-draft");
    return {
      draft: {
        schema: 1,
        character: source,
        base,
        targetId: value.targetId,
        selection: selection,
        invalidated: value.invalidated,
      },
      original: null,
      storageError: false,
    };
  } catch {
    return { draft: null, original, storageError: original === null };
  }
}
export function persistOriginDraft(
  storage: DraftStorage,
  key: string,
  draft: OriginDraft
): void {
  const old = loadOriginDraft(storage, key, draft.character);
  if (old.storageError) throw Error("origin-draft-storage");
  if (old.original !== null) {
    let archive: string;
    do {
      archive = key + ":original:" + crypto.randomUUID();
    } while (storage.getItem(archive) !== null);
    storage.setItem(archive, old.original);
    if (storage.getItem(archive) !== old.original) throw Error("original-not-preserved");
  }
  const serialized = JSON.stringify(draft);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw Error("origin-draft-storage");
}
export function retireOriginDraft(
  storage: DraftStorage,
  key: string,
  sent: OriginDraft
): void {
  const current = loadOriginDraft(storage, key, sent.character);
  if (current.storageError) throw Error("origin-draft-storage");
  if (current.draft && !current.draft.invalidated && equal(current.draft, sent))
    storage.removeItem(key);
}
/** Explicitly keep a complete draft before switching to another requested change. */
export function parkOriginDraft(
  storage: DraftStorage,
  key: string,
  draft: OriginDraft
): string {
  const parkedKey = key + ":parked:" + crypto.randomUUID();
  const serialized = JSON.stringify(draft);
  storage.setItem(parkedKey, serialized);
  if (storage.getItem(parkedKey) !== serialized) throw Error("origin-draft-storage");
  return parkedKey;
}

/** Transfer only after read-back proves the active copy exists. */
export function activateParkedOriginDraft(
  storage: DraftStorage,
  key: string,
  parkedKey: string,
  character: FolioCharacter
): OriginDraft {
  const original = storage.getItem(parkedKey);
  const loaded = loadOriginDraft(storage, parkedKey, character);
  if (!loaded.draft || original === null) throw Error("incompatible-origin-draft");
  persistOriginDraft(storage, key, loaded.draft);
  if (storage.getItem(parkedKey) === original) storage.removeItem(parkedKey);
  return loaded.draft;
}
