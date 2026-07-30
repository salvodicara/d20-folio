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
    (snap) => cb(snap.exists() ? parseEntries(snap.data()) : []),
    (err) => onError?.(err)
  );
}

/**
 * Persist the WHOLE library (last-write-wins OVERWRITE — creates the doc if absent).
 * A no-op under DEV_BYPASS. Single-writer per user, so no transaction is needed.
 */
export async function writeLibrary(
  uid: string,
  entries: readonly LibraryEntry[]
): Promise<void> {
  if (DEV_BYPASS_AUTH) return;
  await setDoc(libraryRef(uid), stripUndefined({ entries }) as Record<string, unknown>);
}
