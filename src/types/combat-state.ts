/**
 * CombatState — the per-character COMBAT-MUTABLE state that gets ONE model home.
 *
 * HP (current/temp), conditions, initiative, and death saves are the facts that
 * change moment-to-moment in play and must stay aligned across every surface that
 * shows them (the cockpit sheet today; the in-hub encounter row in a later chunk).
 * They live in a dedicated per-character Firestore SUBDOC at
 * `users/{uid}/characters/{charId}/combat/state` — NOT on the parent character doc
 * — so both surfaces read+write THAT one document and are aligned by construction.
 *
 * This is the CANONICAL shape of that subdoc. It is deliberately small + JSON-plain
 * (no SRD coupling, no localized strings — ids/numbers only) so the always-eager
 * persistence layer never weighs the SRD onto the bundle.
 *
 * Note the reconciliations against the in-memory {@link SessionState}:
 *  - the initiative ROLL is the character's SOLO-play raw d20 (`number | null`,
 *    `null` = unrolled). NEVER the total — every consumer derives `total = roll +
 *    initiativeBonus` at the display/sort edge (the bonus is engine-computed, override
 *    first). The cockpit's `session.initiative` is the same raw roll as a typed STRING
 *    (`""` = blank); the conversion happens at the IO seam (`src/lib/combat-state.ts`).
 *    In a CAMPAIGN ENCOUNTER a PC's roll does NOT live here — it lives in the
 *    campaign's `encounterInit` table (`CampaignDoc.encounterInit[uid]`, the
 *    initiative SSOT), which the DM and the owning player both write on the ONE
 *    campaign doc. (The old `initiativeEpoch` per-encounter stamp that used to
 *    dual-purpose this field is deleted; a stray persisted `initiativeEpoch` on a
 *    live subdoc is inert residue the defensive parse drops.)
 *  - death saves are a single nested `{ successes, failures }` object here, vs the
 *    two flat `deathSucc` / `deathFail` siblings on `SessionState`.
 *  - the SOLO turn `round` lives here too — its SOLE persisted home. In a campaign
 *    encounter the round lives on the shared `encounter` doc (the `useTurnState` seam);
 *    SOLO, this is the number the turn engine (`combatStore.round`) hydrates from and
 *    persists to. It is NOT on `SessionState` (deleted): the turn engine is its only
 *    in-memory reader, so the parent-doc mirror was pure duplication (rule 6/10).
 */
import type { SessionState } from "@/types/character";

export interface CombatState {
  hp: { current: number; temp: number };
  conditions: string[];
  /** The SOLO-play raw d20 initiative ROLL the player typed (`null` = not yet rolled).
   *  NEVER the total — consumers add the engine initiative bonus at the edge. A campaign
   *  encounter's roll lives in `CampaignDoc.encounterInit` instead (the initiative SSOT). */
  initiativeRoll: number | null;
  deathSaves: { successes: number; failures: number };
  /** The SOLO combat round the turn engine (`combatStore.round`) hydrates from + persists
   *  to — this subdoc is its SOLE persisted home (an encounter uses the shared doc). `1`
   *  when combat has not advanced. */
  round: number;
}

/**
 * The session shape actually PERSISTED to the parent character doc: a full
 * {@link SessionState} MINUS the combat-mutable trio (HP / conditions / initiative /
 * death saves), which now lives only in the `combat/state` subdoc. Used by the
 * char-doc auto-save so the parent doc never carries the moved fields.
 *
 * Physically omitting them keeps the two homes from drifting: the parent doc can no
 * longer encode an HP/conditions/initiative/death-save value at all.
 */
export type PersistedSession = Omit<
  SessionState,
  "hp" | "conditions" | "initiative" | "deathSucc" | "deathFail"
>;

/**
 * The `(uid, charId)`-bound combat-state persistence seam INJECTED into the character
 * store, so a store mutator can route its optimistic in-memory change to Firestore
 * WITHOUT the store importing `firebase` (keeps it unit-testable + `DEV_BYPASS`-clean).
 * `useCharacterSubscription` binds it to the offline-safe `writeCombatState` and injects
 * it on subscribe; `null` (the default, and dev/bypass) means optimistic-store-only — no
 * persistence — so dev + e2e never touch the network and the 6 fixtures stay byte-identical.
 *
 * ONE method: the store already computes the optimistic NEXT {@link CombatState} for every
 * op (HP damage/heal · temp · condition · death save · initiative · Long Rest · at-0-HP
 * interrupt), so it persists THAT whole object — a single computation feeds both the UI and
 * the durable write, and `writeCombatState` (`setDoc(merge)`) queues it offline. Concurrency
 * is whole-object last-write-wins (see `combat-state-io.ts`); no per-op split is needed
 * because a fresh subscription-hydrated base makes different-field / different-time edits
 * compose anyway.
 */
export interface CombatPersistence {
  /** Persist the whole optimistically-computed next combat state (offline-safe). */
  write(state: CombatState): void;
}
