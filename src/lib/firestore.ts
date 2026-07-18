/**
 * Firestore CRUD helpers for character documents.
 * Collection path: /users/{uid}/characters/{charId}
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  getCountFromServer,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { CharacterData, SessionState } from "@/types/character";
import { db, functions } from "@/lib/firebase";
import type { CharacterDoc } from "@/types/character";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import {
  makeDevUsers,
  devCharacterCounts,
  devCampaignSummaries,
  devUserCharacters,
  devBugReports,
  type DevAdminUser,
  type AdminCampaignSummary,
} from "@/lib/dev-admin-fixture";

/** The slim campaign shape the admin console reads (re-exported as the io surface). */
export type { AdminCampaignSummary } from "@/lib/dev-admin-fixture";
import { FREE_TIER_LIMITS } from "@/lib/limits";
// SRD-free module (NOT @/lib/character-io, which pulls the SRD resolver) so the
// always-eager persistence layer never weighs the SRD onto the initial bundle.
import { sanitizeSession } from "@/lib/sanitize-session";
import { sanitizeCharacter } from "@/lib/sanitize-character";
import { cacheToRosterDoc, type RosterCharacterDoc } from "@/lib/character-cache";
import { deletePortrait, deleteBugReportScreenshot } from "@/lib/storage";
import { stripUndefined } from "@/lib/strip-undefined";
import { clearLogFromIDB } from "@/lib/log-persistence";
import { omitCombatTrio } from "@/lib/combat-state";

/** The Firestore-only metadata fields a character document carries ALONGSIDE the
 *  `{ schema, build, state }` codec envelope. Pulled off a raw doc on read. */
function readDocMeta(
  id: string,
  data: Record<string, unknown>
): Pick<
  CharacterDoc,
  "id" | "createdAt" | "updatedAt" | "portraitUrl" | "portraitCrop" | "shareId" | "status"
> {
  return {
    id,
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : (data.createdAt as Date),
    updatedAt:
      data.updatedAt instanceof Timestamp
        ? data.updatedAt.toDate()
        : (data.updatedAt as Date),
    portraitUrl: typeof data.portraitUrl === "string" ? data.portraitUrl : null,
    portraitCrop: (data.portraitCrop as CharacterDoc["portraitCrop"]) ?? null,
    shareId: typeof data.shareId === "string" ? data.shareId : null,
    status:
      data.status === "retired" || data.status === "dead" || data.status === "archived"
        ? data.status
        : "active",
  };
}

function charsCol(uid: string) {
  return collection(db, "users", uid, "characters");
}

function charDoc(uid: string, charId: string) {
  return doc(db, "users", uid, "characters", charId);
}

/**
 * Unified-codec persistence (write side): when the payload carries a COMPLETE
 * character (+ session), serialize it through the SAME codec the export uses
 * (`serializeCharacterEnvelope` → `{ schema, build, state }`) and stamp the
 * SRD-free roster `cache` (name · effective AC · hp.max · speed · race id ·
 * classes[]) so the roster never rehydrates. The flat `character`/`session` keys
 * are REPLACED by the envelope (golden rule 10). A partial / field-only write (status,
 * portrait, session-only) is passed through
 * UNTOUCHED, so a field update is never corrupted by serializing an incomplete character.
 *
 * COMBAT TRIO OMITTED HERE. The combat-mutable state (HP/temp · conditions · initiative ·
 * death saves) lives in the per-character `combat/state` subdoc as its SOLE persisted home
 * — so the parent Firestore doc must NOT carry it (a lingering copy would be dead dual
 * representation, the bug class golden rule 10 forbids). We omit {@link COMBAT_SESSION_KEYS}
 * from the serialized `state` at THIS boundary; the codec itself is unchanged, so the
 * self-contained portable EXPORT (which has no subdoc) keeps the trio inline.
 *
 * Lazy-imports `character-codec` + `character-cache` so the class tables stay OFF
 * the always-eager persistence bundle (the bundle-budget guard pins this; the
 * cockpit that triggers a full save already lazy-loads the SRD).
 */
async function toStoredPayload(
  payload: Partial<CharacterDoc>
): Promise<Record<string, unknown>> {
  const ch = payload.character;
  const session = payload.session;
  // Runtime guards (a partial / malformed write may carry an incomplete character):
  // read the character via a plain record so the structural checks aren't
  // "no-overlap" against the strict type. The `ch && session` presence guard
  // narrows both for the codec call below.
  const chRec = ch as Record<string, unknown> | undefined;
  const isFullCharacter =
    !!chRec &&
    typeof chRec.name === "string" &&
    Array.isArray(chRec.classes) &&
    chRec.classes.length > 0 &&
    chRec.abilityScores != null;
  if (!ch || !session || !isFullCharacter) {
    // A field-only write (status / portrait / session-only) — pass the
    // recognized fields through. `character` alone (no session) can't be serialized
    // to the codec, so it's dropped from a partial write (the cockpit always saves
    // both together — see `useCharacterSubscription`).
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (k === "character") continue; // never persist a flat `character` (legacy shape)
      out[k] = v;
    }
    return out;
  }
  const [{ serializeCharacterEnvelope }, { buildCharacterCache }] = await Promise.all([
    import("@/lib/character-codec"),
    import("@/lib/character-cache"),
  ]);
  // `serializeCharacterEnvelope` reads ONLY `character` + `session`; the metadata
  // fields are irrelevant to the envelope, so a minimal doc is enough.
  const envelope = serializeCharacterEnvelope({ character: ch, session } as CharacterDoc);
  // The combat trio lives ONLY in the `combat/state` subdoc — omit it from the parent
  // `state` so the Firestore doc never carries a second copy (golden rule 10).
  const state = omitCombatTrio(envelope.state);
  const cache = buildCharacterCache(ch, session);
  const { character: _character, session: _session, ...rest } = payload;
  void _character;
  void _session;
  return { ...rest, ...envelope, state, cache };
}

/**
 * Create a new character document.
 * Returns the auto-generated document ID.
 */
export async function createCharacter(
  uid: string,
  data: Partial<CharacterDoc>
): Promise<string> {
  const { id: _id, ...rest } = data;
  void _id;
  const payload = await toStoredPayload(rest);
  // Bug fix (2026-05-28): Firestore's `addDoc()` rejects any tree containing
  // an `undefined` value with "Unsupported field value: undefined". The
  // character builder produces several optional fields (e.g. armorNote, every
  // `…Override`) that may legitimately be undefined when
  // the player skips them in the wizard. `updateCharacter` was already
  // running `stripUndefined`; `createCharacter` was the only write path
  // that didn't, so the very first save of a fresh character could fail
  // with the cryptic "Unsupported field value" error. Now both paths are
  // symmetric.
  const docRef = await addDoc(charsCol(uid), {
    ...(stripUndefined(payload) as Record<string, unknown>),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Update fields on a character document.
 */
export async function updateCharacter(
  uid: string,
  charId: string,
  data: Partial<CharacterDoc>
): Promise<void> {
  if (DEV_BYPASS_AUTH) return;
  const { id: _id, ...rest } = data;
  void _id;
  const payload = await toStoredPayload(rest);
  await updateDoc(charDoc(uid, charId), {
    ...(stripUndefined(payload) as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a character document, every snapshot it owns, the portrait image
 * in Storage, AND the per-character local action-log entries in IndexedDB —
 * fully cascading so no caller can leak any of the sub-resources by
 * forgetting to clean them up.
 *
 * Firestore does not auto-cascade subcollections; without the explicit
 * snapshot sweep here, every deletion left a phantom snapshots
 * subcollection behind. Portrait files in Firebase Storage have the same
 * problem — they're addressed by path, not by parent relationship — so we
 * also wipe them as part of the same delete. The action log keeps a local
 * IndexedDB backup keyed by character id (`d20-folio-logs`); it too would
 * survive the doc delete, so we clear it in the same cascade.
 *
 * Order matters for partial-failure recovery:
 *   1. Portrait file (Storage). Idempotent — `deletePortrait` ignores
 *      "object not found", so calling it for a character that never had
 *      a portrait is safe.
 *   2. Snapshots subcollection (one Firestore delete per snapshot, in
 *      parallel). If any snapshot delete fails, the parent character
 *      doc is still alive so the user can retry; deleting the parent
 *      first would orphan the surviving snapshots.
 *   3. Parent character doc.
 *   4. Local action-log entries (IndexedDB). Best-effort + self-swallowing
 *      (`clearLogFromIDB` never throws), so it can never block the delete;
 *      runs last because it is purely local cleanup, not a remote resource.
 *
 * Callers should NOT call `deletePortrait` separately — this function
 * already handles it.
 *
 * SCOPE — this is the engine primitive and stays pure: it owns ONLY the
 * character's own sub-resources (its portrait + snapshots + doc). The
 * cross-aggregate referential-integrity concern (detaching the character
 * from any shared campaign that references it) lives ONE layer up, in the
 * feature orchestrator `features/roster/delete-character.ts`
 * (`deleteCharacterAndDetach`) — the engine must never import the campaign
 * feature. UI callers go through that orchestrator, not this directly.
 */
export async function deleteCharacter(uid: string, charId: string): Promise<void> {
  if (DEV_BYPASS_AUTH) return;
  // 1. Portrait image (Storage). Idempotent; ignores not-found.
  await deletePortrait(uid, charId);
  // 2. Every snapshot in the subcollection — parallel, but await before
  // touching the parent so partial failures don't orphan.
  const snapshotsCol = collection(db, "users", uid, "characters", charId, "snapshots");
  const snaps = await getDocs(snapshotsCol);
  await Promise.all(snaps.docs.map((d) => deleteDoc(d.ref)));
  // 3. The parent character document.
  await deleteDoc(charDoc(uid, charId));
  // 4. The per-character local action-log backup (IndexedDB). Best-effort and
  // self-swallowing — never blocks the delete.
  await clearLogFromIDB(charId);
}

/**
 * Subscribe to real-time updates on the full character list for a user.
 * Fires immediately with the current list, then on every add/update/delete.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 *
 * The callback's second arg is `fromCache` — the snapshot's provenance. This is the
 * boot-resilience seam (the 2026-07-09 "Clear site data" incident): after the local
 * IndexedDB cache is wiped mid-session, the FIRST snapshot fires from the now-EMPTY
 * cache (`fromCache: true`, zero docs) BEFORE the server round-trip lands, so an
 * empty-from-cache result must NEVER be treated as the authoritative "you have no
 * characters" answer. `includeMetadataChanges` is set so the cache→server transition
 * (which changes only metadata, not the doc set) re-invokes the callback, letting the
 * consumer wait for a server-confirmed answer.
 */
export function subscribeToCharacters(
  uid: string,
  callback: (docs: RosterCharacterDoc[], fromCache: boolean) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(charsCol(uid), orderBy("updatedAt", "desc"));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      callback(
        // `rosterDoc` returns `null` for a corrupt cache (no valid name) — SKIP it,
        // so one bad doc can never blank the whole roster (fault isolation) and no
        // invented name is ever rendered. Writers guarantee non-empty names, so this
        // should never fire; it's a safety net.
        snap.docs
          .map((d) => rosterDoc(d.id, d.data() as Record<string, unknown>))
          .filter((d): d is RosterCharacterDoc => d !== null),
        snap.metadata.fromCache
      );
    },
    (err) => onError?.(err)
  );
}

/**
 * Build the SRD-FREE roster projection for one persisted doc. Reads ONLY the
 * top-level `cache` (the unified codec's roster projection) — NEVER `parseCharacter`
 * — so the always-eager roster list stays off the SRD corpus (the bundle-budget
 * guard). Returns the DISTINCT {@link RosterCharacterDoc} (Layer 2), not the full
 * `CharacterDoc`, so a full-character engine call on it is a compile error. Returns
 * `null` for a corrupt doc whose cache has no valid name (the caller skips it).
 */
function rosterDoc(id: string, data: Record<string, unknown>): RosterCharacterDoc | null {
  const meta = readDocMeta(id, data);
  return cacheToRosterDoc(id, data, meta);
}

/**
 * Subscribe to real-time updates on a SINGLE character document (the cockpit AND
 * the DM/admin read-only view — ONE load path). Lazily imports the shared codec and
 * `parseCharacterEnvelope`s the `{ build, state }` into the full in-memory
 * `CharacterData` + `SessionState` (the SRD-coupled rehydrate + the read-time
 * normalizations: race-trait pip remap, weapon-action-id remap), then stamps the
 * effective AC. Because the parse is async (lazy SRD chunk), the snapshot handler
 * resolves it and invokes `callback` when ready; a superseded snapshot's result is
 * dropped (a monotonically-increasing token) so an out-of-order parse can't render
 * stale data. Returns an unsubscribe function.
 */
export function subscribeToCharacter(
  uid: string,
  charId: string,
  callback: (doc: CharacterDoc | null) => void,
  onError?: (err: Error) => void
): () => void {
  let token = 0;
  let cancelled = false;
  const unsub = onSnapshot(
    charDoc(uid, charId),
    (snap) => {
      const my = ++token;
      if (!snap.exists()) {
        callback(null);
        return;
      }
      void parseStoredCharacter(snap.id, snap.data())
        .then((doc) => {
          // Drop a superseded / post-unsubscribe result.
          if (cancelled || my !== token) return;
          callback(doc);
        })
        .catch((err: unknown) => {
          if (cancelled || my !== token) return;
          onError?.(err instanceof Error ? err : new Error(String(err)));
        });
    },
    (err) => onError?.(err)
  );
  return () => {
    cancelled = true;
    unsub();
  };
}

/**
 * One-shot fetch of the FULL parsed character (the cockpit's shape), not the
 * SRD-free roster projection — the roster list streams {@link RosterCharacterDoc}
 * (cache-only), which OMITS `abilityScores`/`equipment`/`spells`, so any operation
 * that needs the complete character (Export JSON/PDF, Clone) must re-read + parse
 * the stored `{ build, state }` envelope here. Returns `null` if the doc is gone.
 *
 * This closes the export/clone half of the unified-codec reshape (#106): the roster
 * list stopped carrying the full character, so serializing the list item produced a
 * TRUNCATED export/clone. The type system now forbids passing a projection to the
 * codec, and this is the seam that supplies the real character instead.
 */
export async function getFullCharacter(
  uid: string,
  charId: string
): Promise<CharacterDoc | null> {
  const snap = await getDoc(charDoc(uid, charId));
  if (!snap.exists()) return null;
  return parseStoredCharacter(snap.id, snap.data());
}

/**
 * Parse one persisted character document into the full in-memory `CharacterDoc` via
 * the shared codec (lazy SRD). Reads the unified `{ build, state }` envelope. Throws
 * on a structurally invalid doc so the caller surfaces a clean error (never a stuck
 * spinner).
 */
async function parseStoredCharacter(
  id: string,
  data: Record<string, unknown>
): Promise<CharacterDoc> {
  const meta = readDocMeta(id, data);
  const { parseCharacterEnvelope, stampEffectiveAc } =
    await import("@/lib/character-codec");
  const { normalizeSessionActionIds } =
    await import("@/lib/normalize-session-action-ids");

  const build =
    typeof data.build === "object" && data.build !== null
      ? (data.build as Record<string, unknown>)
      : {};
  const state =
    typeof data.state === "object" && data.state !== null
      ? (data.state as Record<string, unknown>)
      : {};

  const parsed = parseCharacterEnvelope(build, state);
  if (!parsed.ok) throw new Error(parsed.error);
  const character = stampEffectiveAc(parsed.character, parsed.session);
  const session = normalizeSessionActionIds(character, parsed.session);
  // The combat-mutable trio (HP/temp · conditions · initiative · death saves) is NOT on
  // the parent doc — it lives in the `combat/state` subdoc, hydrated by the subscription
  // hooks (absent subdoc → the full-HP default for a fresh/undamaged character).
  return { ...meta, character, session };
}

/**
 * Auto-save handle returned by `createDebouncedSave`.
 *
 * - `save(data)` schedules a debounced Firestore write.
 * - `flush()` writes the latest pending payload immediately (for unmount or
 *   beforeunload) and returns a promise that resolves when the write completes.
 *   Returns a resolved promise when there is nothing pending.
 *
 * Bug fix (2026-05-28): the previous API returned only the `save` callback;
 * if a user made an edit and quickly navigated/closed the tab within the
 * debounce window, the pending write was silently lost. The hook now flushes
 * on unmount.
 */
export interface DebouncedSaveHandle {
  save: (data: Partial<CharacterDoc>) => void;
  flush: () => Promise<void>;
}

export function createDebouncedSave(
  uid: string,
  charId: string,
  delayMs: number = 2000
): DebouncedSaveHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingPayload: Partial<CharacterDoc> | null = null;
  let inflight: Promise<void> = Promise.resolve();

  function runWrite(data: Partial<CharacterDoc>): Promise<void> {
    saveStatusCallbacks.onSaving();
    return updateCharacter(uid, charId, data)
      .then(() => {
        saveStatusCallbacks.onSaved();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Save failed";
        saveStatusCallbacks.onError(msg);
      });
  }

  return {
    save(data) {
      if (timer) clearTimeout(timer);
      pendingPayload = data;
      saveStatusCallbacks.onPending();
      timer = setTimeout(() => {
        const payload = pendingPayload;
        pendingPayload = null;
        timer = null;
        if (payload) inflight = runWrite(payload);
      }, delayMs);
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      const payload = pendingPayload;
      pendingPayload = null;
      if (payload) {
        inflight = runWrite(payload);
      }
      return inflight;
    },
  };
}

/**
 * Callbacks for save status reporting.
 * Connected by the save store at initialization time to avoid circular imports.
 */
export const saveStatusCallbacks: {
  onPending: () => void;
  onSaving: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
} = {
  onPending: () => {},
  onSaving: () => {},
  onSaved: () => {},
  onError: () => {},
};

// ─── Character Snapshots ──────────────────────────────────────────────────────

/**
 * Save a snapshot of a character's data before a major change (e.g. level-up).
 * Stored under /users/{uid}/characters/{charId}/snapshots/{snapId} as the SAME
 * unified codec envelope (`{ schema, build, state }`) the main doc + export use —
 * ONE format everywhere (golden rule 10, no parallel raw-character shape).
 */
export async function saveCharacterSnapshot(
  uid: string,
  charId: string,
  data: {
    character: CharacterData;
    session: SessionState;
    reason: string;
  }
): Promise<string> {
  if (DEV_BYPASS_AUTH) return "mock-snapshot-id";
  const snapshotsCol = collection(db, "users", uid, "characters", charId, "snapshots");
  const { serializeCharacterEnvelope } = await import("@/lib/character-codec");
  const envelope = serializeCharacterEnvelope({
    character: data.character,
    session: data.session,
  } as CharacterDoc);
  // stripUndefined symmetry with createCharacter / updateCharacter — the codec
  // envelope is plain JSON, but `reason` + nested fields stay strip-safe.
  const docRef = await addDoc(snapshotsCol, {
    ...(stripUndefined({ ...envelope, reason: data.reason }) as Record<string, unknown>),
    createdAt: serverTimestamp(),
  });
  // Free-tier cap (#29): snapshots auto-generate on every level-up, so this list
  // grows unattended — keep it bounded by pruning oldest-first. Read at most
  // cap+1 oldest (cheap) and delete the overflow; converges to the cap over saves.
  await pruneOldestSnapshots(snapshotsCol);
  return docRef.id;
}

/**
 * FIFO-prune a character's snapshots to `FREE_TIER_LIMITS.snapshotsPerCharacter`,
 * deleting the oldest beyond the cap. Reads only the oldest `cap+1` (bounded), so
 * the cost stays flat regardless of how the collection grew.
 */
async function pruneOldestSnapshots(
  snapshotsCol: ReturnType<typeof collection>
): Promise<void> {
  const cap = FREE_TIER_LIMITS.snapshotsPerCharacter;
  const oldest = await getDocs(
    query(snapshotsCol, orderBy("createdAt", "asc"), limit(cap + 1))
  );
  if (oldest.size <= cap) return;
  const overflow = oldest.docs.slice(0, oldest.size - cap);
  await Promise.all(overflow.map((d) => deleteDoc(d.ref)));
}

/**
 * List all snapshots for a character, most recent first.
 */
export async function listCharacterSnapshots(
  uid: string,
  charId: string
): Promise<
  Array<{
    id: string;
    reason: string;
    createdAt: Date | null;
    character: CharacterData;
    session: SessionState;
  }>
> {
  // Dev bypass has no Firestore connection. A `dev-bypass-snapshots` JSON seed
  // (the same localStorage harness seam as `dev-bypass-name`) renders real rows
  // for self-verification; without it the list is honestly empty.
  if (DEV_BYPASS_AUTH) {
    const seed = window.localStorage.getItem("dev-bypass-snapshots");
    if (!seed) return [];
    const parsed = JSON.parse(seed) as Array<{
      id: string;
      reason: string;
      createdAt: string;
      character: Record<string, unknown>;
    }>;
    return parsed.map((s) => ({
      id: s.id,
      reason: s.reason,
      createdAt: s.createdAt ? new Date(s.createdAt) : null,
      character: sanitizeCharacter(s.character) as unknown as CharacterData,
      session: sanitizeSession({}),
    }));
  }
  const snapshotsCol = collection(db, "users", uid, "characters", charId, "snapshots");
  const q = query(snapshotsCol, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  // Snapshots are unified codec envelopes (`{ build, state }`) — parse each through
  // the SAME codec the main read uses (lazy SRD). A snapshot that FAILS to parse
  // (a corrupt/incomplete envelope — e.g. no valid name) is SKIPPED, never rendered
  // with an invented placeholder character (reject-at-boundary; non-nullability).
  const { parseCharacterEnvelope } = await import("@/lib/character-codec");
  return snap.docs.flatMap((d) => {
    const data = d.data();
    const ts = data["createdAt"] as Timestamp | null;
    const build = (data["build"] ?? {}) as Record<string, unknown>;
    const state = (data["state"] ?? {}) as Record<string, unknown>;
    const parsed = parseCharacterEnvelope(build, state);
    if (!parsed.ok) return [];
    return [
      {
        id: d.id,
        reason: typeof data["reason"] === "string" ? data["reason"] : "manual",
        createdAt: ts instanceof Timestamp ? ts.toDate() : null,
        character: parsed.character,
        session: parsed.session,
      },
    ];
  });
}

/**
 * Restore a character to a previous snapshot.
 * Overwrites the character's `character` and `session` fields with snapshot data.
 */
export async function restoreCharacterSnapshot(
  uid: string,
  charId: string,
  snapshot: { character: CharacterData; session: SessionState }
): Promise<void> {
  if (DEV_BYPASS_AUTH) return;
  // Write through the SAME unified-codec path the auto-save uses, so the restored
  // doc carries `{ build, state }` + the refreshed roster `cache` (never a flat
  // `character`/`session`). `attachedCampaignId` is untouched (a restore doesn't change
  // campaign attachment).
  await updateCharacter(uid, charId, {
    character: snapshot.character,
    session: snapshot.session,
  });
}

/**
 * Delete a character snapshot.
 */
export async function deleteCharacterSnapshot(
  uid: string,
  charId: string,
  snapshotId: string
): Promise<void> {
  if (DEV_BYPASS_AUTH) return;
  const ref = doc(db, "users", uid, "characters", charId, "snapshots", snapshotId);
  await deleteDoc(ref);
}

// ─── Admin Functions ─────────────────────────────────────────────────────────

/**
 * List all users (admin only — requires Firestore rules to allow).
 */
/**
 * Dev-bypass user roster (admin console). Held mutable at module scope — lazily
 * seeded from the fixture on first read — so a block/unblock survives the panel's
 * in-place "Refresh" (which re-calls `listAllUsers`) within a session, exactly as a
 * real Firestore write would. Reset only on a full page reload. `null` until the
 * panel is first opened, and never touched in production (DEV_BYPASS_AUTH false).
 */
let devUsersCache: DevAdminUser[] | null = null;
function devUsers(): DevAdminUser[] {
  if (!devUsersCache) devUsersCache = makeDevUsers();
  return devUsersCache;
}

export async function listAllUsers(): Promise<
  Array<{
    uid: string;
    email: string;
    displayName: string;
    photoURL: string | null;
    status: "active" | "blocked";
    role: "admin" | null;
    createdAt: Date | null;
    lastActiveAt: Date | null;
  }>
> {
  // Dev-bypass: serve the in-memory fixture (Firestore is never read). Fresh object
  // copies so the panel's local state edits can't mutate the cache out-of-band.
  if (DEV_BYPASS_AUTH) return devUsers().map((u) => ({ ...u }));

  const usersCol = collection(db, "users");
  const snap = await getDocs(usersCol);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      email: String(data.email ?? ""),
      displayName: String(data.displayName ?? ""),
      // The Google photo is written to the user doc on first sign-in (auth.ts) but
      // was never read back here, so admin rows had no avatar (#82). Surface it.
      photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
      status: data.status === "blocked" ? "blocked" : "active",
      // The data-driven admin role (the same field firestore.rules' isAdmin() reads);
      // surfaced so the console can badge admins. Only "admin" matters — else null.
      role: data.role === "admin" ? "admin" : null,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
      lastActiveAt:
        data.lastActiveAt instanceof Timestamp ? data.lastActiveAt.toDate() : null,
    };
  });
}

/**
 * Update a user's status (block or unblock). Admin only.
 */
export async function setUserStatus(
  uid: string,
  status: "active" | "blocked"
): Promise<void> {
  // Dev-bypass: mutate the in-memory fixture so the change persists across the
  // panel's "Refresh" (no Firestore write).
  if (DEV_BYPASS_AUTH) {
    const target = devUsers().find((u) => u.uid === uid);
    if (target) target.status = status;
    return;
  }
  const userDoc = doc(db, "users", uid);
  await updateDoc(userDoc, { status });
}

/**
 * Per-user character counts (admin only), keyed by uid. Uses an aggregation
 * (`getCountFromServer`) per user — ONE billed read each regardless of roster size
 * (cheaper than reading every character doc), which the free-tier budget needs. The
 * console derives the "total characters" stat by summing the map, so this single
 * call feeds both the per-user metric and the overview total. Iterates per-user
 * subcollections to avoid a collection-group index.
 */
export async function countCharactersPerUser(
  userUids: string[]
): Promise<Record<string, number>> {
  // Dev-bypass: the fixture tallies (no per-user subcollection reads).
  if (DEV_BYPASS_AUTH) return devCharacterCounts(userUids);
  const entries = await Promise.all(
    userUids.map(async (uid) => {
      const charCol = collection(db, "users", uid, "characters");
      const snap = await getCountFromServer(charCol);
      return [uid, snap.data().count] as const;
    })
  );
  return Object.fromEntries(entries);
}

/**
 * Slim campaign summaries (admin only) — every campaign's id, members, DM, and
 * status, but none of the heavy treasury / notes / banner payload. The console
 * derives the campaign total AND each user's member/DM counts from this one list
 * (membership is an `array-contains` over `members`, with no per-user query).
 */
export async function listCampaignSummaries(): Promise<AdminCampaignSummary[]> {
  // Dev-bypass: the in-memory dev campaigns.
  if (DEV_BYPASS_AUTH) return devCampaignSummaries();
  const campCol = collection(db, "campaigns");
  const snap = await getDocs(campCol);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      members: Array.isArray(data.members) ? data.members.map(String) : [],
      dmUid: String(data.dmUid ?? ""),
      status: data.status === "archived" ? "archived" : "active",
    };
  });
}

/** One row in the admin "view a user's characters" drill-down — the SRD-free roster
 *  projection (id + display name + portrait), never a full parse. */
export interface AdminUserCharacter {
  id: string;
  name: string;
  portraitUrl: string | null;
}

/**
 * List ANY user's characters (admin only) — the drill-down roster behind the admin
 * console's read-only sheet view. Reads ONLY the top-level `cache` (the SRD-free
 * roster projection via the SAME `rosterDoc` the owner's roster streams) so it never
 * weighs the SRD corpus, then opens one read-only as a sheet. The admin read is
 * already granted server-side (`firestore.rules` character read: `… || isAdmin()`),
 * so this needs NO rules change. A corrupt doc (no valid name) is skipped.
 */
export async function listUserCharacters(uid: string): Promise<AdminUserCharacter[]> {
  // Dev-bypass: the in-memory fixture roster (no Firestore).
  if (DEV_BYPASS_AUTH) return devUserCharacters(uid);
  const snap = await getDocs(charsCol(uid));
  return snap.docs
    .map((d) => rosterDoc(d.id, d.data() as Record<string, unknown>))
    .filter((d): d is RosterCharacterDoc => d !== null)
    .map((d) => ({
      id: d.id,
      name: d.character.name,
      portraitUrl: d.portraitUrl ?? null,
    }));
}

/**
 * Delete a user account WHOLESALE (admin only) — a thin client wrapper over the
 * `deleteUser` 2nd-gen callable (functions/src/index.ts), which does the
 * server-authoritative cascade (characters + combat/snapshots, Storage portraits,
 * campaign membership + DM-orphaning + co-member ACL cleanup, the user doc, the Auth
 * user) behind an admin gate + a typed email re-confirm. The callable verifies the
 * caller is admin and that `targetEmail` matches the stored email; the client cannot
 * forge either. Throws (a `FirebaseError` carrying the HttpsError code/message) on
 * any guard failure, which the panel surfaces.
 */
export async function deleteUserAccount(
  targetUid: string,
  targetEmail: string
): Promise<void> {
  // Dev-bypass: no callable. Drop the row from the in-memory roster so the panel
  // updates exactly as a real cascade + refresh would (no Firestore / no Functions).
  if (DEV_BYPASS_AUTH) {
    devUsersCache = devUsers().filter((u) => u.uid !== targetUid);
    return;
  }
  const callable = httpsCallable<
    { targetUid: string; targetEmail: string },
    { ok: boolean }
  >(functions, "deleteUser");
  await callable({ targetUid, targetEmail });
}

/**
 * One row in the admin BUG INBOX. Beyond the list line (title/badges/meta) it
 * carries the PRIVATE remainder the public issue deliberately omits — the
 * description, reporter identity, debug context, and screenshot — which the
 * inbox's expandable detail renders (admin-only; the privacy strip keeps all of
 * it off GitHub, so this is the only place the admin can see it).
 */
export interface AdminBugReport {
  id: string;
  type: string;
  title: string;
  description: string;
  status: "new" | "opened" | "error";
  severity: string;
  screen: string;
  reporterUid: string;
  locale: string;
  /** Sanitized client snapshot (url/pathname, appVersion, userAgent, recentErrors…). */
  debugContext: Record<string, unknown> | null;
  screenshotUrl: string | null;
  /** Storage path of the screenshot — what the purge cascade deletes. */
  screenshotPath: string | null;
  issueUrl: string | null;
  issueNumber: number | null;
  createdAt: Date | null;
}

/**
 * List bug / feature reports (admin only) — the console's BUG INBOX. Surfaces the
 * STRANDED `status: "error"` reports first (a report whose GitHub-issue creation
 * failed in the Cloud Function — otherwise invisible, since GitHub never got it), so
 * the admin can re-file them by hand. GitHub stays the canonical tracker; this is a
 * minimal safety net over the `/bug_reports` collection (admin-read per the rules).
 */
export async function listBugReports(max = 50): Promise<AdminBugReport[]> {
  if (DEV_BYPASS_AUTH) return devBugReports();
  const q = query(
    collection(db, "bug_reports"),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  const snap = await getDocs(q);
  // Clamp `type` to the known set so the console's `admin.bugType.<type>` i18n key
  // always resolves (the throwing resolver has no defaultValue) — an unexpected
  // value collapses to "other".
  const KNOWN_TYPES = ["bug", "feature", "visual", "data", "performance", "other"];
  return snap.docs.map((d) => {
    const data = d.data();
    const status =
      data.status === "opened" ? "opened" : data.status === "error" ? "error" : "new";
    const rawType = String(data.type ?? "other");
    const debugContext: unknown = data.debugContext;
    return {
      id: d.id,
      type: KNOWN_TYPES.includes(rawType) ? rawType : "other",
      title: String(data.title ?? ""),
      description: String(data.description ?? ""),
      status,
      severity: String(data.severity ?? "low"),
      screen: String(data.screen ?? ""),
      reporterUid: String(data.reporterUid ?? ""),
      locale: String(data.locale ?? "en"),
      debugContext:
        typeof debugContext === "object" && debugContext !== null
          ? (debugContext as Record<string, unknown>)
          : null,
      screenshotUrl: typeof data.screenshotUrl === "string" ? data.screenshotUrl : null,
      screenshotPath:
        typeof data.screenshotPath === "string" ? data.screenshotPath : null,
      issueUrl: typeof data.issueUrl === "string" ? data.issueUrl : null,
      issueNumber: typeof data.issueNumber === "number" ? data.issueNumber : null,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
    };
  });
}

/**
 * Cascade-delete SPENT bug reports (admin only) — the IO half of the inbox's
 * GitHub-mirror reconciliation (`reconcileBugReports` decides WHICH; this deletes).
 * Per report: the Storage screenshot FIRST, then the Firestore doc — so a partial
 * failure can never orphan a file with no doc pointing at it (a surviving doc means
 * the next inbox load retries; the whole cascade is idempotent by construction).
 * A per-report failure logs and skips — it never blocks the rest of the batch.
 */
export async function purgeBugReports(
  reports: ReadonlyArray<Pick<AdminBugReport, "id" | "screenshotPath">>
): Promise<number> {
  if (DEV_BYPASS_AUTH) return 0; // fixture inbox — nothing real to delete
  let purged = 0;
  for (const report of reports) {
    try {
      if (report.screenshotPath) await deleteBugReportScreenshot(report.screenshotPath);
      await deleteDoc(doc(db, "bug_reports", report.id));
      purged++;
    } catch (err) {
      console.warn("bug-report purge failed (retried on next load):", report.id, err);
    }
  }
  return purged;
}
