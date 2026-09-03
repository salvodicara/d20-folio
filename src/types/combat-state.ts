/**
 * CombatState — the per-character COMBAT-MUTABLE state that gets ONE model home.
 *
 * HP (current/temp), conditions, held dice, initiative, and death saves are the facts that
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
import type { LocText } from "@/lib/loc-text";
import type { EconomyActionCategory } from "@/lib/combat-economy";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import type { CombatOutcomeReceipt } from "@/types/combat-outcome";
import type { ConcentrationRef } from "@/types/ids";
import type { PersistedPlayStateV1 } from "@/lib/session-state-codec";

/**
 * A player-DECLARED attack in a live campaign encounter — the target(s) the player
 * chose on their sheet plus the HIT/MISS they tapped after rolling at the table. This
 * is the cross-user channel the DM's correlation layer (`combat-reconcile.ts`) fuses
 * with the observed HP deltas into CONFIRMED chronicle lines: a declared HIT + a
 * matching monster HP drop ⇒ an auto-attributed hit line, a declared MISS ⇒ a certain
 * miss line. The app NEVER fabricates one — it is written only by the player's explicit
 * HIT/MISS tap.
 *
 * IDS + NUMBERS ONLY (golden rule 7): the target(s) are ENCOUNTER combatant ids
 * (`monster-<n>`), never a display name; the attacker is the owning PC (`pc-<uid>`),
 * derived at read time from the subdoc's uid (not stored here). SOLO play never writes
 * one (the sheet gates the target/HIT-MISS UI on being in a live encounter).
 */
export interface RecentAttack {
  /** Stable, monotonically-increasing id within the ring (the max existing id + 1 —
   *  deterministic, no RNG; survives the ring so a de-dup handle never repeats). */
  id: string;
  /** The encounter combatant ids the player targeted (`monster-<n>`). One for a
   *  single-target swing; the SET the player struck for a multi-target action (Phase 2 —
   *  Magic Missile's darts, Scorching Ray's rays across several foes). */
  targetIds: string[];
  /** The outcome the player tapped after rolling — the fact the app never infers. */
  outcome: "hit" | "miss";
  /** The encounter round the attack was declared in — the correlation window key. */
  round: number;
  /** The exact action used, as a stable localizable reference. */
  action?: LocText;
  /**
   * The action's multi-instance DROP BOUND — how many separate damage instances the
   * declared action creates (Magic Missile 3, Scorching Ray 3), so the DM-side
   * correlation caps how many observed HP drops it may fuse. Present ONLY for a
   * multi-target declaration; ABSENT for a single-target swing (bound = 1 by shape).
   */
  instances?: number;
  /**
   * S13 — the declared action is an AREA SAVE-for-half spell (Fireball class). The
   * DM's correlation treats this specially: a declared target with a real HP drop
   * took the DM's number (half or full — the number is the truth), and a declared
   * target the DM left un-dropped RESISTED (full save, no damage) — the outcome is a
   * SAVE, not an attack-roll hit/miss (which is why `outcome` is always `"hit"` here,
   * meaning "cast/resolved"). Present ONLY for an area save declaration; absent for a
   * weapon swing or a multi-instance attack (Magic Missile). See the feature-layer
   * `chronicle-reconcile` correlation.
   */
  save?: boolean;
  /**
   * S13 — the stable CONDITION ids this action applies on a hit as a RIDER (a weapon
   * Mastery's Topple → `["prone"]`, a spell's rider). The DM-side correlation binds a
   * DM-applied `condition-gain` on a declared target THIS round to the declaring PC
   * when the gained condition id is in this set — the confident "who applied it"
   * provenance (never guessed from mere co-occurrence). Absent when the action carries
   * no modelled condition rider. Ids only (golden rule 7).
   */
  riders?: string[];
}

/** Durable identity of one action-economy occupant for the current turn. */
export interface PersistedTurnAction {
  id: string;
  name: LocText;
  slot: "action" | "bonus" | "free";
  isAttackGroup?: boolean;
  economyCategory?: EconomyActionCategory;
  triggerEvents?: ReadonlyArray<"attack" | "bonus-extend">;
  /** Exact reviewed occurrence owned by this economy occupant. */
  outcomeOccurrenceId?: string;
}

export interface PersistedAttackSwing {
  actionId: string;
  /** Exact reviewed occurrence owned by this one swing. */
  outcomeOccurrenceId?: string;
}

/**
 * The transient-looking turn facts that must nevertheless survive route changes and
 * reloads. `key` binds the snapshot to one exact encounter pointer (or solo round), so
 * a stale spent Action can never leak into a later turn while the sheet was unmounted.
 * Budgets stay derived from grants and are intentionally absent.
 */
export interface PersistedTurnEconomy {
  key: string;
  selected: {
    action: PersistedTurnAction[];
    bonus: PersistedTurnAction[];
    free: PersistedTurnAction[];
  };
  attacksUsed: number;
  attackSwings: PersistedAttackSwing[];
  /** Monotonic allocator cursor for reviewed occurrences in this exact turn. */
  outcomeOrdinal: number;
  /** Reviewed per-instance/per-target facts produced this turn. Occurrence ids
   * keep repeated uses of the same action distinct across hydration and undo. */
  outcomeReceipts: CombatOutcomeReceipt[];
  reactionUsed: boolean;
  reactionUsedId: string | null;
  reactionOutcomeOccurrenceId: string | null;
  movementUsedFt: number;
  dashesThisTurn: number;
  spellSlotCastsThisTurn: number;
  /** Additive global-turn identity for the hard one-slot-expenditure gate. A
   * legacy snapshot without it binds a non-zero count to this snapshot's `key`. */
  spellSlotCastTurnKey?: string | null;
  damageTakenThisRound: boolean;
  /** Optional for additive compatibility with turn snapshots written before this field. */
  nextAttackAdvantage?: boolean;
  movementLocked?: boolean;
}

/**
 * One unresolved Constitution save caused by one distinct damage instance while
 * concentrating. It deliberately stores only the trigger facts: the character's
 * modifier, Exhaustion, and Advantage/Disadvantage are re-resolved from the live
 * character at commit time through the universal entered-D20 kernel.
 */
export interface PendingConcentrationSave {
  /** Unique command identity. Separate hits always receive separate ids. */
  id: string;
  /** Exact stable spell ref held when this damage instance landed. */
  spell: ConcentrationRef;
  /** Total damage taken by this instance, including Temporary Hit Points. */
  damage: number;
  /** Capped Concentration DC derived from {@link damage}. */
  difficultyClass: number;
}

export interface CombatState {
  hp: { current: number; temp: number };
  conditions: string[];
  /** Held Bardic Inspiration die. Optional distinguishes a legacy subdoc from an
   * explicit empty-string clear during the additive state migration. */
  bardicInspirationDie?: string;
  /** Held Heroic Inspiration. Optional preserves a legacy parent-doc value until
   * the first combat-state write crosses the additive migration boundary. */
  heroicInspiration?: boolean;
  /** The SOLO-play raw d20 initiative ROLL the player typed (`null` = not yet rolled).
   *  NEVER the total — consumers add the engine initiative bonus at the edge. A campaign
   *  encounter's roll lives in `CampaignDoc.encounterInit` instead (the initiative SSOT). */
  initiativeRoll: number | null;
  deathSaves: { successes: number; failures: number };
  /** The SOLO combat round the turn engine (`combatStore.round`) hydrates from + persists
   *  to — this subdoc is its SOLE persisted home (an encounter uses the shared doc). `1`
   *  when combat has not advanced. */
  round: number;
  /**
   * The capped ring of the player's recently-DECLARED in-encounter attacks
   * ({@link RecentAttack}) — the budget-safe cross-user channel the DM's correlation
   * layer reads to auto-attribute hits + emit miss lines. Rides the EXISTING debounced
   * `writeCombatState` (NO new doc, NO new subscription — the DM already subscribes to
   * this subdoc), so an attack declaration costs ~one turn-frequency write. Absent /
   * `[]` outside an encounter (SOLO never declares).
   */
  recentActions: RecentAttack[];
  /** Source-owned effects applied to this character outside a campaign encounter.
   * They use the same occurrence model and lifetime algebra as shared encounters.
   * (A branch-era `effectOps` mirror ledger existed here briefly; it never had a
   * production writer, so the codec now ignores the stored field fail-safe.) */
  activeEffects?: ActiveCombatEffect[];
  /** Idempotency receipt for PC-targeted effects delivered through the current
   * campaign encounter. A new encounter epoch replaces the receipt. */
  appliedEncounterEffects?: { epoch: number; ids: string[] };
  /** Current-turn economy, fenced by an exact encounter/solo turn key. */
  turnEconomy?: PersistedTurnEconomy;
  /** FIFO of unresolved, per-authored-packet Concentration saves. Optional keeps combat docs
   * written before this additive field backward-safe; absence means an empty queue. */
  pendingConcentrationSaves?: PendingConcentrationSave[];
  /**
   * Versioned owner for every remaining mutable session fact. Optional only for
   * combat documents written before the play-state ownership migration.
   */
  playState?: PersistedPlayStateV1;
}

/**
 * The session shape actually PERSISTED to the parent character doc: a full
 * {@link SessionState} MINUS the combat-mutable slice (HP / conditions / held dice /
 * initiative / death saves), which now lives only in the `combat/state` subdoc. Used by the
 * char-doc auto-save so the parent doc never carries the moved fields.
 *
 * Physically omitting them keeps the two homes from drifting: the parent doc can no
 * longer encode an HP/conditions/held-die/initiative/death-save value at all.
 */
export type PersistedSession = Omit<
  SessionState,
  | "hp"
  | "conditions"
  | "initiative"
  | "deathSucc"
  | "deathFail"
  | "bardicInspirationDie"
  | "inspiration"
>;

/**
 * The `(uid, charId)`-bound combat-state persistence seam INJECTED into the character
 * store, so a store mutator can route its optimistic in-memory change to Firestore
 * WITHOUT the store importing `firebase` (keeps it unit-testable + `DEV_BYPASS`-clean).
 * `useCharacterSubscription` binds it to the offline-safe `writeCombatState` and injects
 * it on subscribe; `null` (the default, and dev/bypass) means optimistic-store-only — no
 * persistence — so dev + e2e never touch the network and the 6 fixtures stay byte-identical.
 *
 * The store computes the optimistic NEXT {@link CombatState} for EVERY play mutation —
 * the turn budget included — and routes it through the ONE `write`, which the hook
 * coalesces into a single complete child write per microtask.
 */
export interface CombatPersistence {
  /** Persist the whole optimistically-computed next combat state (offline-safe). */
  write(state: CombatState): void;
}
