/**
 * library-io — Firestore IO for the account-level homebrew library.
 *
 * ONE document per user: `users/{uid}/library/index`, holding `{ entries: LibraryEntry[] }`
 * (the model + strip/landing rules live in `src/lib/library.ts`). A single doc — not a
 * doc per entry — because the whole library is always read together (the add-modal
 * picker, the settings manager) and is hard-capped at
 * `FREE_TIER_LIMITS.libraryEntries`: one listener, one write, no collection queries.
 *
 * Same singleton pattern as `combat-state-io.ts`: a full-doc `setDoc` OVERWRITE (no
 * `merge` — the payload is always the complete list, and the overwrite sheds any stray
 * key), offline-queueable, with a DEFENSIVE read (`parseEntries`) so shape tolerance
 * lives at the read edge and the rules only validate AUTHORIZATION + the cap. Every
 * payload goes through `stripUndefined` (domain rule D1 — Firestore rejects
 * `undefined`, and a homebrew item is full of optional fields).
 *
 * `DEV_BYPASS_AUTH` makes every read/write/listener a no-op (mirrors `firestore.ts`),
 * so dev runs on the store's optimistic in-memory list alone.
 */
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { stripUndefined } from "@/lib/strip-undefined";
import { LIBRARY_KINDS, type LibraryEntry, type LibraryKind } from "@/lib/library";

/** Ref to the user's single homebrew-library document. */
export function libraryRef(uid: string) {
  return doc(db, "users", uid, "library", "index");
}

/** Defensively parse one stored entry (our own write, but never trust IO). */
function parseEntry(raw: unknown): LibraryEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind;
  if (typeof kind !== "string" || !LIBRARY_KINDS.includes(kind as LibraryKind))
    return null;
  if (typeof r.id !== "string" || r.id === "") return null;
  if (typeof r.savedAt !== "number" || !Number.isFinite(r.savedAt)) return null;
  if (typeof r.item !== "object" || r.item === null) return null;
  // Past the `kind` tag the item shape is our own write; every renderer reads it
  // through the same optional-field types the sheet already tolerates.
  return { id: r.id, savedAt: r.savedAt, kind, item: r.item } as LibraryEntry;
}

/** Defensively parse the stored `entries` array, dropping anything malformed. */
function parseEntries(data: Record<string, unknown>): LibraryEntry[] {
  if (!Array.isArray(data.entries)) return [];
  return data.entries
    .map(parseEntry)
    .filter((entry): entry is LibraryEntry => entry !== null);
}

/** Defensively parse one stored SRD-art override — the crop is optional + trusted (our
 *  own write), so only the URL is validated (a broken entry is simply dropped). */
/**
 * Subscribe to the live library doc. `cb([])` when the doc is ABSENT (a user who has
 * never saved homebrew) — an empty library, not an error. Returns an unsubscribe; a
 * no-op under DEV_BYPASS (no real listener).
 */
export function subscribeLibrary(
  uid: string,
  cb: (entries: LibraryEntry[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (DEV_BYPASS_AUTH) return () => {};
  return onSnapshot(
    libraryRef(uid),
    (snap) => {
      const data = snap.exists() ? snap.data() : {};
      cb(parseEntries(data));
    },
    (err) => onError?.(err)
  );
}

/**
 * Persist the whole library doc (last-write-wins overwrite, creates it if absent).
 * A no-op under DEV_BYPASS. The overwrite also sheds obsolete stray keys.
 */
export async function writeLibrary(
  uid: string,
  entries: readonly LibraryEntry[]
): Promise<void> {
  if (DEV_BYPASS_AUTH) return;
  await setDoc(libraryRef(uid), stripUndefined({ entries }) as Record<string, unknown>);
}

/**
 * How long the writer coalesces before it flushes. Mirrors the character auto-save
 * debounce: the sheet-side custom EDIT seams fire per keystroke / per stepper tap, and
 * each write rewrites the WHOLE library doc — one flush per edit BURST, not per key.
 */
export const LIBRARY_WRITE_DEBOUNCE_MS = 2000;

/**
 * A DEBOUNCED library writer for one uid: `persist` records the latest list and arms
 * a single trailing flush; `flush` writes any pending list NOW (the caller's teardown
 * calls it, so a sign-out / unmount never drops the last edit).
 *
 * Only the FLUSH is delayed — `libraryStore` has already applied the change in memory,
 * so every surface reads the new list immediately (free-tier discipline, golden rule
 * 24: debounced writes, never a write per keystroke).
 */
export function createLibraryWriter(
  uid: string,
  delayMs: number = LIBRARY_WRITE_DEBOUNCE_MS,
  onError: (err: unknown) => void = (err) => console.error("Library write failed", err)
): {
  persist: (entries: readonly LibraryEntry[]) => void;
  flush: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: readonly LibraryEntry[] | null = null;

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending === null) return;
    const entries = pending;
    pending = null;
    void writeLibrary(uid, entries).catch(onError);
  };

  return {
    persist: (entries) => {
      pending = entries;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}
