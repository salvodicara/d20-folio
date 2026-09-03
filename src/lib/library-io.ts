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
 * key), offline-queueable. The read edge parses through the PURE, TOTAL
 * `parseLibraryEntries` (`library-codec.ts`) — a malformed document QUARANTINES rather
 * than dropping the offending element (see that module's doc for why: a per-entry drop
 * would be permanently baked in by the very next unrelated full-doc write). Every
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
import { diagnosticsLog } from "@/lib/diagnostics";
import { parseLibraryEntries } from "@/lib/library-codec";
import type { LibraryEntry } from "@/lib/library";

/** Ref to the user's single homebrew-library document. */
export function libraryRef(uid: string) {
  return doc(db, "users", uid, "library", "index");
}

/**
 * Subscribe to the live library doc. `cb([])` when the doc is ABSENT (a user who has
 * never saved homebrew) — an empty library, not an error. A malformed document
 * QUARANTINES: `cb` is never called (the store stays unhydrated — `loaded` stays
 * false, so every write path already refuses with `"unavailable"`), a diagnostics
 * report is logged (`library.quarantine`), and `onError` fires with a `TypeError`
 * naming the typed failure, mirroring `subscribeCombatState`'s fail-closed read.
 * Returns an unsubscribe; a no-op under DEV_BYPASS (no real listener).
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
      const parsed = parseLibraryEntries(data);
      if (!parsed.ok) {
        const { code, path } = parsed.failure;
        diagnosticsLog("error", "library.quarantine", { code, path });
        onError?.(new TypeError(`Invalid library document: ${code}:${path}`));
        return;
      }
      cb(parsed.entries);
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
