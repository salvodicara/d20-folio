/**
 * combat-state-io — Firestore IO for the per-character `combat/state` subdoc.
 *
 * The combat-mutable trio (HP / conditions / initiative / death saves) is persisted
 * to `users/{uid}/characters/{charId}/combat/state` instead of the parent character
 * doc, so the cockpit sheet AND the in-hub encounter row read+write ONE document and
 * stay aligned by construction. See `src/types/combat-state.ts`.
 *
 * Thin + always-eager-safe: a tiny JSON subdoc, no lazy codec, no SRD. The pure
 * model + conversions live in `src/lib/combat-state.ts`; THIS module is the only
 * combat-state seam that touches `firebase/firestore`.
 *
 * OFFLINE-FIRST WRITES. Every mutation persists through {@link writeCombatState} — a plain
 * `setDoc` (OVERWRITE, no `merge`) of the FULL CombatState. `setDoc` is
 * offline-queueable: Firestore durably records it in the local cache and replays it on
 * reconnect, so a damage / heal / condition / death-save taken OFFLINE is never lost. (The
 * prior `runTransaction` read-modify-write REQUIRED a live server round-trip and REJECTED
 * offline — the swallowed rejection silently dropped the edit; that is the bug this module
 * removes.) OVERWRITE, not `merge`: the payload is ALWAYS the complete state, so there is
 * nothing to merge onto, and the overwrite sheds stray/legacy keys (e.g. the retired
 * `initiativeEpoch`) as a side effect. The rules validate ONLY AUTHORIZATION on this
 * subdoc — never the shape (the old `isValidCombatState` field-lock rejected every combat
 * write whenever the deployed rules lagged the client payload by one field — the
 * "initiative never saves" outage; see `firestore.rules`); {@link parseCombatState}
 * reads defensively, so shape tolerance lives at the read edge.
 *
 * The subdoc is MULTI-WRITER (owning player AND campaign DM/admin — the DM's authority
 * derives LIVE from the campaign doc via the parent char's `attachedCampaignId`, never a
 * stored grant). Concurrency is whole-object last-write-wins: because each writer reduces
 * over its LATEST subscription-hydrated state, DIFFERENT-field / different-time edits both
 * land; only an EXACTLY-simultaneous same-field write loses one — the accepted,
 * DM-correctable tradeoff.
 *
 * The op helpers ({@link applyHpDelta} / {@link tickDeathSave} / {@link setCombatCondition}
 * / {@link setCombatTempHp}) are conveniences for the writers that hold the CURRENT state
 * as a value (the DM encounter row): they reduce that `base` (seeding
 * {@link defaultCombatState} when the subdoc is absent) and persist the result. The
 * cockpit store persists its already-reduced optimistic state directly through
 * {@link writeCombatState} (no double-reduce). INITIATIVE in a campaign encounter is NOT
 * written here — it lives in the campaign's `encounterInit` table
 * (`campaign-io.setEncounterInitiative`, the initiative SSOT); the subdoc's
 * `initiativeRoll` is the SOLO cockpit roll, persisted by the store like the round.
 *
 * `DEV_BYPASS_AUTH` makes every read/write/listener a no-op (mirrors
 * `firestore.ts`), so dev runs on the store's optimistic in-memory update alone.
 */
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import {
  defaultCombatState,
  reduceCondition,
  reduceDeathSave,
  reduceHpDelta,
  setTempAbsolute,
} from "@/lib/combat-state";
import type { CombatState } from "@/types/combat-state";

/** Ref to the per-character combat-state subdoc. */
export function combatStateRef(uid: string, charId: string) {
  return doc(db, "users", uid, "characters", charId, "combat", "state");
}

/** The COMPLETE persisted shape, stamped server-side. One source so the two write
 *  paths can't drift. */
function combatStateWriteData(state: CombatState): Record<string, unknown> {
  return {
    hp: { current: state.hp.current, temp: state.hp.temp },
    conditions: state.conditions,
    initiativeRoll: state.initiativeRoll,
    deathSaves: {
      successes: state.deathSaves.successes,
      failures: state.deathSaves.failures,
    },
    round: state.round,
    updatedAt: serverTimestamp(),
  };
}

/** Defensively parse a stored combat-state doc (our own write, but never trust IO). */
function parseCombatState(data: Record<string, unknown>): CombatState {
  const hp = (typeof data.hp === "object" && data.hp !== null ? data.hp : {}) as Record<
    string,
    unknown
  >;
  const ds = (
    typeof data.deathSaves === "object" && data.deathSaves !== null ? data.deathSaves : {}
  ) as Record<string, unknown>;
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    hp: { current: num(hp.current, 0), temp: num(hp.temp, 0) },
    conditions: Array.isArray(data.conditions)
      ? data.conditions.filter((c): c is string => typeof c === "string")
      : [],
    initiativeRoll: typeof data.initiativeRoll === "number" ? data.initiativeRoll : null,
    deathSaves: { successes: num(ds.successes, 0), failures: num(ds.failures, 0) },
    // Absence-safe: a subdoc written before `round` moved here (or a fresh one) reads as
    // round 1 — a natural default, never a permanent read-shim (rule 10).
    round: num(data.round, 1),
  };
}

/**
 * Subscribe to the live `combat/state` subdoc. `cb(null)` when the doc is ABSENT
 * (a fresh / not-yet-migrated character) — the caller defaults to full HP. Returns
 * an unsubscribe; a no-op under DEV_BYPASS (no real listener).
 */
export function subscribeCombatState(
  uid: string,
  charId: string,
  cb: (state: CombatState | null, meta: { hasPendingWrites: boolean }) => void,
  onError?: (err: Error) => void
): () => void {
  if (DEV_BYPASS_AUTH) return () => {};
  return onSnapshot(
    combatStateRef(uid, charId),
    (snap) => {
      // `hasPendingWrites` distinguishes a LOCAL optimistic echo (true) from a
      // SERVER-originated update (false) — the own-sheet undo stack's remote fence
      // reads it so a snapshot-leg undo never clobbers another writer's edit.
      cb(snap.exists() ? parseCombatState(snap.data()) : null, {
        hasPendingWrites: snap.metadata.hasPendingWrites,
      });
    },
    (err) => onError?.(err)
  );
}

/**
 * Persist the combat-state subdoc (last-write-wins OVERWRITE — creates the doc if
 * absent, drops any stray/legacy key). A no-op under DEV_BYPASS. `updatedAt` is stamped
 * server-side.
 */
export async function writeCombatState(
  uid: string,
  charId: string,
  state: CombatState
): Promise<void> {
  if (DEV_BYPASS_AUTH) return;
  // OVERWRITE (not merge): `combatStateWriteData` ALWAYS emits the COMPLETE CombatState,
  // so there is nothing to merge onto; the overwrite also sheds stray/legacy keys (an
  // old-schema field, a half-run migration residue) on every write. Still
  // offline-queueable (`setDoc` durably caches + replays).
  await setDoc(combatStateRef(uid, charId), combatStateWriteData(state));
}

/**
 * The base a `base`-reducing op helper starts from: the caller's CURRENT
 * {@link CombatState} for this PC (its live subscription value), or, when the subdoc is
 * ABSENT (`null` — a fresh / not-yet-migrated PC), the full-HP {@link defaultCombatState}
 * at `effectiveMaxHp` — so the FIRST offline write of any op lands a rules-valid full
 * shape at the right HP ceiling (never a partial create, never a synthetic 0-HP seed).
 */
function baseOrDefault(base: CombatState | null, effectiveMaxHp: number): CombatState {
  return base ?? defaultCombatState(effectiveMaxHp);
}

/**
 * Apply an HP DELTA (damage / heal) over the caller's live `base` and persist the whole
 * result — offline-safe (`setDoc` overwrite, durably queued). `effectiveMaxHp` clamps healing
 * and seeds the absent-doc default. A no-op under DEV_BYPASS. Used by writers that hold the
 * current state as a value (the DM encounter row / topbar pip); the cockpit store persists
 * its own optimistic reduction via {@link writeCombatState}.
 */
export function applyHpDelta(
  uid: string,
  charId: string,
  base: CombatState | null,
  op: { kind: "damage" | "heal"; amount: number },
  effectiveMaxHp: number
): Promise<void> {
  return writeCombatState(
    uid,
    charId,
    reduceHpDelta(baseOrDefault(base, effectiveMaxHp), op, effectiveMaxHp)
  );
}

/** Tick a death save over `base` (NESTED `deathSaves`, capped `[0, 3]`) and persist. */
export function tickDeathSave(
  uid: string,
  charId: string,
  base: CombatState | null,
  outcome: "success" | "failure",
  effectiveMaxHp: number
): Promise<void> {
  return writeCombatState(
    uid,
    charId,
    reduceDeathSave(baseOrDefault(base, effectiveMaxHp), outcome)
  );
}

/** Add / remove a condition id over `base` (idempotent) and persist the result. */
export function setCombatCondition(
  uid: string,
  charId: string,
  base: CombatState | null,
  op: { kind: "add" | "remove"; conditionId: string },
  effectiveMaxHp: number
): Promise<void> {
  return writeCombatState(
    uid,
    charId,
    reduceCondition(baseOrDefault(base, effectiveMaxHp), op)
  );
}

/** Set temp HP to an exact value over `base` (floors at 0, leaves current) and persist. */
export function setCombatTempHp(
  uid: string,
  charId: string,
  base: CombatState | null,
  temp: number,
  effectiveMaxHp: number
): Promise<void> {
  return writeCombatState(
    uid,
    charId,
    setTempAbsolute(baseOrDefault(base, effectiveMaxHp), temp)
  );
}
