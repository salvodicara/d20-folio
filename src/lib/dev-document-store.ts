/**
 * Tiny local document replica for `VITE_DEV_BYPASS_AUTH`.
 *
 * Production gets persistence, optimistic echoes, reload survival, and cross-tab
 * snapshots from Firestore. The auth-bypass preview must exercise those same lifecycle
 * properties or it can hide navigation/state bugs. This adapter provides precisely that
 * browser contract over localStorage; domain modules still own their seed, validation,
 * and merge semantics.
 *
 * It is deliberately NOT a second backend: one versioned JSON envelope, one key per
 * logical document, and one listener set. Callers use it only behind DEV_BYPASS_AUTH.
 */

const PREFIX = "d20-folio.dev-doc.v1";
const memoryFallback = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

interface StoredEnvelope {
  version: 1;
  value: unknown;
}

function storageKey(collection: string, id: string): string {
  return `${PREFIX}:${encodeURIComponent(collection)}:${encodeURIComponent(id)}`;
}

function browserStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.localStorage;
    const probe = `${PREFIX}:probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/** JSON that preserves fixture Dates so local snapshots remain type-faithful. */
function encode(value: unknown): string {
  return JSON.stringify(
    { version: 1, value } satisfies StoredEnvelope,
    function dateReplacer(key, candidate: unknown) {
      const original = key === "" ? candidate : (this as Record<string, unknown>)[key];
      return original instanceof Date
        ? { __d20DevDate: original.toISOString() }
        : candidate;
    }
  );
}

function decode<T>(
  raw: string | null,
  isValue?: (value: unknown) => value is T
): T | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw, (_key, candidate: unknown) => {
      if (
        typeof candidate === "object" &&
        candidate !== null &&
        Object.keys(candidate).length === 1 &&
        typeof (candidate as { __d20DevDate?: unknown }).__d20DevDate === "string"
      ) {
        return new Date((candidate as { __d20DevDate: string }).__d20DevDate);
      }
      return candidate;
    }) as Partial<StoredEnvelope>;
    if (parsed.version !== 1 || !("value" in parsed) || parsed.value == null) return null;
    return !isValue || isValue(parsed.value) ? (parsed.value as T) : null;
  } catch {
    return null;
  }
}

function readRaw(key: string): string | null {
  const storage = browserStorage();
  return storage ? storage.getItem(key) : (memoryFallback.get(key) ?? null);
}

function emit(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
}

/** Read one local replica document. Corrupt/stale envelopes safely behave as absent. */
export function readDevDocument<T>(
  collection: string,
  id: string,
  isValue?: (value: unknown) => value is T
): T | null {
  return decode(readRaw(storageKey(collection, id)), isValue);
}

/** Replace one document and synchronously emit the same-tab optimistic snapshot. */
export function writeDevDocument(collection: string, id: string, value: unknown): void {
  const key = storageKey(collection, id);
  const raw = encode(value);
  const storage = browserStorage();
  if (storage) storage.setItem(key, raw);
  else memoryFallback.set(key, raw);
  emit(key);
}

/** Fresh-read functional update: the local equivalent of a tiny document transaction. */
export function updateDevDocument<T>(
  collection: string,
  id: string,
  fallback: T,
  update: (current: T) => T
): T {
  const next = update(readDevDocument<T>(collection, id) ?? fallback);
  writeDevDocument(collection, id, next);
  return next;
}

/**
 * Subscribe to one document. Emits immediately, then for same-tab writes and browser
 * `storage` events from other tabs. Mirrors Firestore's initial snapshot contract.
 */
export function subscribeDevDocument<T>(
  collection: string,
  id: string,
  callback: (value: T | null) => void,
  isValue?: (value: unknown) => value is T
): () => void {
  const key = storageKey(collection, id);
  const deliver = () => callback(decode(readRaw(key), isValue));
  let bucket = listeners.get(key);
  if (!bucket) {
    bucket = new Set();
    listeners.set(key, bucket);
  }
  bucket.add(deliver);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === key) callback(decode(event.newValue, isValue));
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  deliver();
  return () => {
    bucket.delete(deliver);
    if (bucket.size === 0) listeners.delete(key);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** Clear only d20 Folio's dev replicas; theme, locale, and test scenario flags survive. */
export function clearDevDocuments(): void {
  const storage = browserStorage();
  if (storage) {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) {
      if (key?.startsWith(`${PREFIX}:`)) storage.removeItem(key);
    }
  }
  memoryFallback.clear();
  for (const key of listeners.keys()) emit(key);
}
