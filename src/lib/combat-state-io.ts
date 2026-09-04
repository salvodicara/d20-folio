/**
 * combat-state-io — Firestore IO for the per-character `combat/state` subdoc.
 *
 * The combat-mutable slice (HP / conditions / held dice / initiative / death saves) is persisted
 * to `users/{uid}/characters/{charId}/combat/state` instead of the parent character
 * doc, so the cockpit sheet AND the in-hub encounter row read+write ONE document and
 * stay aligned by construction. See `src/types/combat-state.ts`.
 *
 * Thin + always-eager-safe: a tiny JSON subdoc, no lazy codec, no SRD. The pure
 * model + conversions live in `src/lib/combat-state.ts`, and the sanctioned write ENCODER in
 * `src/lib/combat-state-writeback.ts` (re-exported below); THIS module is the only combat-state
 * seam that binds the app's Firestore INSTANCE.
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
 * The subdoc is MULTI-WRITER (owner, campaign DM/admin, and current table members — the
 * authority derives LIVE from the campaign doc via the parent char's
 * `attachedCampaignId`, never a stored grant). Manual owner/DM corrections still use the
 * full offline-queueable writer and are whole-object last-write-wins. A reviewed action
 * against a peer does NOT use that path: `campaign-io.applyDeclaredCombatEffects` fresh-
 * reads and transactionally merges only HP/temp/conditions/held-die/death-save fields. Therefore
 * the acting device must be online to commit the shared action, but the target client does
 * not need to be online and an unrelated field cannot be clobbered.
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
 * `devBypassEnabled()` routes the SAME document contract through the versioned local
 * replica (`dev-document-store`): optimistic echoes, reload survival, and cross-tab
 * snapshots stay testable without touching Firebase.
 */
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEV_BYPASS_AUTH as IMPORTED_DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import {
  subscribeDevDocument,
  updateDevDocument,
  writeDevDocument,
} from "@/lib/dev-document-store";
import type { CombatState } from "@/types/combat-state";
import { parseCombatState } from "@/lib/combat-state-codec";
import { combatStateWriteData } from "@/lib/combat-state-writeback";
import { diagnosticsLog } from "@/lib/diagnostics";

// The stored-shape DECODER now lives in the pure `combat-state-codec.ts`, so the
// one-off admin migrations can reuse the exact same parser without pulling Firebase.
// Re-exported here unchanged: this module stays the app's single combat-state seam.
export { parseCombatState, type CombatStateParseResult } from "@/lib/combat-state-codec";

// The sanctioned write ENCODER lives in the pure-enough `combat-state-writeback.ts` (its only
// Firebase dependency is the `serverTimestamp` sentinel), so the table lease and the rules lane
// can reach it without this module's `db` singleton. Re-exported here unchanged: this module
// stays the app's single combat-state IO seam.
export {
  combatStateWriteData,
  type LegacyCombatStateWrite,
} from "@/lib/combat-state-writeback";

const DEV_COMBAT_COLLECTION = "combat-state";

// Tests can still mock the canonical flag; production receives a compile-time false
// and therefore does not ship the local replica used only by auth-bypass previews.
function devBypassEnabled(): boolean {
  return import.meta.env.PROD ? false : IMPORTED_DEV_BYPASS_AUTH;
}

function devCombatId(uid: string, charId: string): string {
  return `${uid}/${charId}`;
}

/** Ref to the per-character combat-state subdoc. */
export function combatStateRef(uid: string, charId: string) {
  return doc(db, "users", uid, "characters", charId, "combat", "state");
}

/** The dev replica stores the same canonical optional collection, without a
 * Firestore timestamp sentinel. */
function combatStateForDevWrite(state: CombatState): CombatState {
  const { updatedAt: _updatedAt, ...canonical } = combatStateWriteData(state);
  void _updatedAt;
  return canonical as unknown as CombatState;
}

function parsedCombatState(data: unknown): CombatState {
  const result = parseCombatState(data);
  if (!result.ok) throw new TypeError(`Invalid combat state: ${result.reason}`);
  return result.state;
}

/**
 * Subscribe to the live `combat/state` subdoc. `cb(null)` when the doc is ABSENT — the
 * child is the SOLE play owner, so every caller on the Firestore path treats that as an
 * integrity failure (`missing-combat-state`) rather than a fresh character. Returns an
 * unsubscribe. Dev bypass uses the local document replica.
 */
export function subscribeCombatState(
  uid: string,
  charId: string,
  cb: (state: CombatState | null, meta: { hasPendingWrites: boolean }) => void,
  onError?: (err: Error) => void
): () => void {
  if (devBypassEnabled()) {
    return subscribeDevDocument<Record<string, unknown>>(
      DEV_COMBAT_COLLECTION,
      devCombatId(uid, charId),
      (state) => {
        if (!state) {
          cb(null, { hasPendingWrites: false });
          return;
        }
        const parsed = parseCombatState(state);
        if (!parsed.ok) {
          diagnosticsLog("error", "combat-state.invalid", { reason: parsed.reason });
          onError?.(new TypeError(`Invalid combat state: ${parsed.reason}`));
          return;
        }
        cb(parsed.state, { hasPendingWrites: false });
      }
    );
  }
  return onSnapshot(
    combatStateRef(uid, charId),
    // The metadata-only local-echo → server-confirmed transition must re-invoke the
    // callback: it is what acknowledges a pending child write in the reconciler.
    { includeMetadataChanges: true },
    (snap) => {
      // `hasPendingWrites` distinguishes a LOCAL optimistic echo (true) from a
      // SERVER-originated update (false) — the own-sheet undo stack's remote fence
      // reads it so a snapshot-leg undo never clobbers another writer's edit.
      if (!snap.exists()) {
        cb(null, { hasPendingWrites: snap.metadata.hasPendingWrites });
        return;
      }
      const parsed = parseCombatState(snap.data());
      if (!parsed.ok) {
        diagnosticsLog("error", "combat-state.invalid", { reason: parsed.reason });
        onError?.(new TypeError(`Invalid combat state: ${parsed.reason}`));
        return;
      }
      cb(parsed.state, { hasPendingWrites: snap.metadata.hasPendingWrites });
    },
    (err) => onError?.(err)
  );
}

/**
 * Persist the combat-state subdoc (last-write-wins OVERWRITE — creates the doc if
 * absent, drops any stray/legacy key). Dev bypass writes the equivalent local document;
 * production stamps `updatedAt` server-side.
 */
export async function writeCombatState(
  uid: string,
  charId: string,
  state: CombatState
): Promise<void> {
  if (devBypassEnabled()) {
    writeDevDocument(
      DEV_COMBAT_COLLECTION,
      devCombatId(uid, charId),
      combatStateForDevWrite(state)
    );
    return;
  }
  // OVERWRITE (not merge): `combatStateWriteData` ALWAYS emits the COMPLETE CombatState,
  // so there is nothing to merge onto; the overwrite also sheds stray/legacy keys (an
  // old-schema field, a half-run migration residue) on every write. Still
  // offline-queueable (`setDoc` durably caches + replays).
  await setDoc(combatStateRef(uid, charId), combatStateWriteData(state));
}

/**
 * Fresh-read mutation for the auth-bypass replica. Campaign transactions use this
 * instead of reducing a dialog snapshot, so local previews exercise the same
 * no-stale-write contract as Firestore.
 */
export function updateDevCombatState(
  uid: string,
  charId: string,
  fallback: CombatState,
  update: (current: CombatState) => CombatState
): CombatState {
  if (!devBypassEnabled()) throw new Error("Dev combat-state update outside auth bypass");
  return updateDevDocument(
    DEV_COMBAT_COLLECTION,
    devCombatId(uid, charId),
    combatStateForDevWrite(fallback),
    (current) =>
      combatStateForDevWrite(
        update(parsedCombatState(current as unknown as Record<string, unknown>))
      )
  );
}
