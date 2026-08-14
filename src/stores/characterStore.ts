/**
 * Character Store
 *
 * Manages the currently-active character document in memory.
 * Single source of truth for HP, spell slots, trackers, conditions, etc.
 * Shared across all pages (Combat, Spells, Features, Equipment).
 */

import { create } from "zustand";
import type {
  CharacterDoc,
  LogEntry,
  SessionDefenseKind,
  SessionState,
  TrackerState,
} from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";
import type {
  CombatState,
  CombatPersistence,
  PendingConcentrationSave,
  RecentAttack,
} from "@/types/combat-state";
import {
  applyCombatToSession,
  sessionToCombatState,
  pushRecentAttack,
} from "@/lib/combat-state";
import type { StoredConcentration } from "@/types/ids";
import { saveLogToIDB, clearLogFromIDB } from "@/lib/log-persistence";
import {
  equipmentAfterLongRest,
  getShortRestRecoveries,
  gainsHeroicInspirationOnLongRest,
  applyShortRestExhaustion,
  getInitiativeTrackerTopUps,
  getSpellSlotTrackerRecovery,
  resolvePerTurnRecoveryTrackerIds,
  resolveActiveTimedEffects,
  resolveActiveBoundaryEffects,
  resolveActiveStatesEndingOn,
  resolveActiveStatesEndingOnRest,
  advanceEffectTimers as advanceEffectTimersEngine,
  resolveTrackers,
  potionDurationRounds,
  potionTimerKey,
} from "@/lib/smart-tracker";
import { totalLevel } from "@/lib/classes";
import {
  polymorphBuildPatch,
  polymorphPriorSnapshot,
  revertBuildFromPrior,
} from "@/lib/polymorph";
import { getBeast } from "@/data/beasts";
import { FIND_FAMILIAR_SPELL_ID, type FamiliarCreatureType } from "@/lib/familiar-ids";
import { concentrationValue } from "@/lib/concentration";
import { concentrationSaveDc } from "@/lib/compute";
import {
  aggregateCharacterGrants,
  activeKeysForConcentration,
  effectiveAC,
  effectiveMaxHp,
} from "@/lib/aggregate-character";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import { conditionBreaksConcentration } from "@/lib/condition-effects";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { evaluateGrants } from "@/lib/grants";
import { slotUsageKey } from "@/lib/cast-options";
import { applyHealing as healHp, clampHp, clampTemp } from "@/lib/combat-hp";
import { reducePcDamage } from "@/lib/combat-transition";
import {
  allBundleSpellIds,
  getAlwaysPreparedFromGrants,
  injectExpandedSpells,
} from "@/lib/expanded-spells";
import { useToastStore } from "@/stores/toastStore";
import { registerUndoableToast, useUndoStore } from "@/stores/undoStore";
import { useCombatStore } from "@/stores/combatStore";
import type {
  ActiveCombatEffect,
  CombatantRef,
  CombatEffectOp,
} from "@/types/combat-effect";
import {
  conformCombatEffectOps,
  endedEffectSuccessor,
  foldCombatEffectOps,
  isEffectActiveAtEncounterPosition,
  mergeActiveCombatEffects,
} from "@/lib/combat-effects";
import {
  applyResourceOperation,
  isValidItemInstanceId,
  type ItemResourceOperation,
  type ResourceApplyResult,
  type ResourceItemBinding,
  type ResourceItemSpec,
} from "@/lib/resources";
import {
  simulateItemResourceOperations,
  type ItemResourceOperationBatchResult,
  type ItemResourceOperationEntry,
} from "@/lib/item-resource-boundaries";
import {
  applyMechanicsPlanToCharacter,
  type MechanicsPlan,
  type MechanicsReceipt,
} from "@/lib/mechanics-command";
import {
  boundaryCommitFacts,
  characterWorldState,
  commitCharacterAction,
  engineConcentrationHandle,
  persistedWorldUid,
  planEngineConcentrationEnd,
  undoCharacterAction,
} from "@/lib/mechanics-world-store";
import {
  canCharacterRest,
  DEATH_FAIL_LIMIT,
  DEATH_SUCCESS_LIMIT,
  isCharacterAlive,
  stabilisedInPlay,
} from "@/lib/character-status";
import {
  concentrationSaveD20Context,
  resolveCharacterConcentrationSave,
  resolveCharacterDeathSave,
  type CharacterEnteredD20Result,
} from "@/lib/character-d20-tests";
import { parsePersistedPlayStateV1 } from "@/lib/session-state-codec";

export type MechanicsPlanCommitResult =
  | { status: "applied"; receipt: MechanicsReceipt }
  | {
      status: "rejected";
      reason:
        | "readonly"
        | "character-missing"
        | "character-mismatch"
        | "owner-missing"
        | "stale-plan"
        | "invalid-plan";
    };

/** Result of one entered-D20 command. Its inverse is a whole-command CAS: it
 * restores exactly this command's state, or fails closed after any later edit. */
export interface D20TestCommitResult {
  result: CharacterEnteredD20Result;
  undo: () => boolean;
}

/**
 * Hard cap on the PERSISTED/synced log array. The log is append-only and never
 * auto-cleared (only the manual trash button empties it), and the whole
 * `session.logEntries` array ships to Firestore on every auto-save + mirrors to
 * IndexedDB — so an uncapped log grows monotonically for a character's lifetime
 * and inflates every sync payload. Cap at write time (keep the last MAX_LOG); the
 * UI window (`ActionLog maxEntries`) is a smaller VIEW slice on top of this bound.
 */
export const MAX_LOG = 200;

/**
 * Restore a tracker entry to its prior value, or REMOVE it (rebuild without the
 * key) when it had none before — the undo helper for the S4 apply actions. Pure;
 * never mutates (a missing entry === `used: 0`, so an absent key is the canonical
 * "unspent" state). Avoids a dynamic `delete` (lint-clean, immutable).
 */
function restoreTrackerEntry(
  trackers: Record<string, TrackerState>,
  trackerId: string,
  prior: TrackerState | undefined
): Record<string, TrackerState> {
  if (prior !== undefined) return { ...trackers, [trackerId]: prior };
  const next: Record<string, TrackerState> = {};
  for (const [k, v] of Object.entries(trackers)) {
    if (k !== trackerId) next[k] = v;
  }
  return next;
}

function trackerStateEquals(a: TrackerState | undefined, b: TrackerState): boolean {
  if (!a || a.used !== b.used) return false;
  const aRolls = a.rolls ?? [];
  const bRolls = b.rolls ?? [];
  return (
    aRolls.length === bRolls.length &&
    aRolls.every((roll, index) => roll === bRolls[index])
  );
}

function omitStateKeys<T>(
  record: Record<string, T> | undefined,
  keys: ReadonlySet<string>
): Record<string, T> | undefined {
  if (!record || keys.size === 0) return record;
  const kept = Object.entries(record).filter(([key]) => !keys.has(key));
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

interface CharacterState {
  /** The active character document (null if none loaded) */
  character: CharacterDoc | null;
  /** Whether the character is loading from Firestore */
  loading: boolean;
  /** Error message if loading failed */
  error: string | null;
  /**
   * T4 — read-only mode: the loaded sheet belongs to someone else (a DM viewing a
   * party member's character). EVERY mutation below short-circuits, and
   * `patchCharacter` no-ops, so there is no write path and no auto-save — a
   * defense-in-depth backstop behind the UI hiding its edit affordances. Set via
   * `loadReadonly()`; cleared by `setCharacter()` (the normal owner-edit path).
   */
  readonly: boolean;
  /**
   * The (uid, charId)-bound combat-state persistence seam, INJECTED by
   * `useCharacterSubscription` once a real subscription opens (`null` until then, and
   * `null` under DEV_BYPASS — optimistic-store-only, no network). Every combat-trio
   * mutator below applies its optimistic in-memory change AND, when set, persists the
   * WHOLE resulting {@link CombatState} through this seam (`writeCombatState` →
   * offline-queueable `setDoc(merge)`), so a damage / heal / condition / death-save taken
   * OFFLINE is durably queued and replayed on reconnect. Keeping it an injected interface
   * (not a direct `combat-state-io` import) is what lets the store stay Firebase-free and
   * unit-testable. See {@link CombatPersistence}.
   */
  combatPersistence: CombatPersistence | null;
  /** Flush the already-scheduled parent-character save after a play-resource mutation.
   * Injected by the subscription so this store remains Firebase-free. */
  parentPersistenceFlush: (() => void) | null;
  /**
   * The SOLO combat `round` hydrated from the `combat/state` subdoc — the round's
   * in-store mirror (the parallel of {@link combatEpoch}). The SESSION no longer carries
   * round (it moved to the subdoc as its sole persisted home); the turn engine
   * (`combatStore.round`) is its live in-memory home, and this is the value a combat write
   * persists back. Kept in sync by `hydrateCombatState` (inbound) and `persistCombatRound`
   * (a local turn advance), so every whole-object combat write carries the current round.
   */
  combatRound: number;
  /**
   * The player's declared in-encounter attacks ({@link RecentAttack}) — the in-store
   * mirror of the `combat/state` subdoc's `recentActions` ring. Held here (like
   * {@link combatRound}) so EVERY whole-object combat write (an HP tap, a condition
   * toggle) carries the ring along and the last-write-wins OVERWRITE never clobbers a
   * just-declared attack. Hydrated inbound by `hydrateCombatState`; appended by
   * {@link declareAttack}. Empty outside a live encounter.
   */
  combatRecentActions: RecentAttack[];
  /** Effective local effects consumed by the sheet: legacy occurrences plus the
   * authored ledger fold. This derived array is never persisted as a whole. */
  combatActiveEffects: ActiveCombatEffect[];
  /** Legacy source-owned occurrences persisted in `CombatState.activeEffects`. */
  combatLegacyActiveEffects: ActiveCombatEffect[];
  /** Authored program occurrence ledger persisted in `CombatState.effectOps`. */
  combatEffectOps: CombatEffectOp[];
  /** Exact authored program cursors persisted beside the local occurrence ledger. */
  combatEffectLifecycles: NonNullable<CombatState["effectLifecycles"]>;
  /** Outer action CAS facts. These are physical-document metadata, not SessionState,
   * and every ordinary whole play-state write must preserve them byte-for-byte. */
  combatActionRevision: number;
  combatActionHead: string | null;
  combatActionLifecycles: NonNullable<CombatState["actionLifecycles"]>;
  combatAppliedEncounterEffects: CombatState["appliedEncounterEffects"];
  combatTurnEconomy: CombatState["turnEconomy"];
  /** Durable FIFO of one unresolved save per landed damage packet. */
  combatPendingConcentrationSaves: PendingConcentrationSave[];
  /** Campaign-owned effects currently projected onto one character id. */
  encounterEffectProjection: {
    characterId: string;
    effects: ReadonlyArray<ActiveCombatEffect>;
  } | null;

  // Actions
  setCharacter: (doc: CharacterDoc | null) => void;
  /** Project campaign-owned effects without adding them to character persistence. */
  setEncounterEffects: (
    characterId: string | null,
    effects?: ReadonlyArray<ActiveCombatEffect>
  ) => void;
  /** Apply source-owned SOLO effects and return their exact inverse. */
  applySoloCombatEffects: (
    effects: ReadonlyArray<ActiveCombatEffect>
  ) => (() => void) | null;
  /** Atomically replace the authored ledger and its derived effective projection.
   * Returns false when read-only, unloaded, or causally malformed. */
  replaceCombatEffectOps: (effectOps: ReadonlyArray<CombatEffectOp>) => boolean;
  /** Inject (or clear) the combat-state persistence seam — the subscription lifecycle. */
  setCombatPersistence: (persistence: CombatPersistence | null) => void;
  /** Persist the current complete play owner through the injected seam. */
  persistPlayState: () => void;
  setParentPersistenceFlush: (flush: (() => void) | null) => void;
  /** T4 — load a sheet in read-only mode (DM viewing a member's character). */
  loadReadonly: (doc: CharacterDoc | null) => void;
  /** Atomically publish one parent + play-state pair. Marked v1 parents are never
   * exposed to consumers before their complete child has passed hydration. */
  loadCharacterWithCombat: (
    doc: CharacterDoc,
    combat: CombatState | null,
    readonly: boolean
  ) => boolean;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  /**
   * Hydrate the combat-mutable trio (HP / conditions / initiative / death saves)
   * from the `combat/state` subdoc into the in-memory session, so EVERY existing
   * reader (compute, use-hp-controls, rest, level-up) sees the live values without
   * changing. `combat === null` (subdoc ABSENT — a fresh / not-yet-migrated
   * character) defaults to FULL effective HP, no conditions, blank initiative, and
   * cleared death saves — never 0 HP. SRD-aware only for the effective-max clamp.
   *
   * This applies the trio WITHOUT touching any other session field and WITHOUT
   * side effects (no log, no toast) — the subscription hook wraps it behind a
   * from-combat guard so it never echoes back out as a save.
   */
  hydrateCombatState: (combat: CombatState | null) => void;
  // Session state mutations (immediate, used outside combat)
  updateSession: (partial: Partial<SessionState>) => void;
  /** Set the held Heroic Inspiration token in the combat-state SSOT. */
  setHeroicInspiration: (held: boolean) => void;
  /** Replace/clear the held Bardic Inspiration die in the combat-state SSOT. */
  setBardicInspirationDie: (die: string) => void;
  /**
   * Set current HP to an exact value (rest / undo / level-up / heal-from-0 reset).
   * `opts.persist: false` applies the optimistic in-memory change ONLY — used by
   * {@link applyHealing}, whose persistence must be the heal DELTA (composes with a
   * concurrent writer), not this ABSOLUTE write (which would clobber it). Defaults to
   * persisting via the absolute-HP combat-state write.
   */
  setHP: (current: number, opts?: { persist?: boolean }) => void;
  /**
   * Persist the in-memory `session.initiative` — the SOLO raw d20 roll — to the
   * `combat/state` subdoc (an ABSOLUTE last-writer-wins write). The cockpit keeps
   * initiative in `combatStore` and mirrors it onto the session via `updateSession`;
   * this routes that slice to the subdoc. SOLO ONLY: a campaign encounter's roll is a
   * campaign-doc write (`setEncounterInitiative`) the turn meter routes directly — it
   * never passes through here. A no-op without an injected persistence.
   */
  persistInitiative: () => void;
  /**
   * Persist a SOLO turn-round advance to the `combat/state` subdoc — its sole home. The
   * turn engine (`combatStore.round`) advances in memory; `TurnEconomyProvider` mirrors the
   * new round here (optimistic `combatRound` update) and this whole-object write lands it.
   * A no-op without an injected persistence.
   */
  persistCombatRound: (round: number) => void;
  /** Persist the current turn's spent economy together with its solo-round mirror. */
  persistCombatTurnState: (
    round: number,
    turnEconomy: NonNullable<CombatState["turnEconomy"]>
  ) => void;
  /**
   * Record a player-DECLARED in-encounter attack (target(s) + the HIT/MISS tapped after
   * rolling) into the `recentActions` ring and persist the whole combat state — the
   * budget-safe channel the DM's correlation reads. Rides the EXISTING combat-state
   * write (no new doc/subscription). The sheet gates this on being in a live encounter,
   * so SOLO never calls it. A no-op without an injected persistence (dev/bypass). */
  declareAttack: (entry: Omit<RecentAttack, "id">) => void;
  setTempHP: (temp: number) => void;
  /**
   * Apply incoming damage: temp HP absorbs first, then current HP. The
   * concentration-save DC is computed from the **total** incoming damage
   * (including the portion absorbed by temp), not just the current-HP
   * delta — RAW 2024 PHB.
   *
   * `amount` is the damage TAKEN (the caller resolves the character's own
   * defenses first — `lib/damage-intake.ts`). The 0-HP rules apply here
   * (SRD "Death Saving Throws" / "Instant Death" — RA-03/RA-10):
   *  - **Dropping to 0** resets the dying track to 0/0 (a fresh knockout),
   *    applies the Unconscious condition, and — when the remainder past 0
   *    reaches the effective max — is massive-damage instant death (3 fails).
   *  - **Damage while already at 0** never lowers HP further; it adds one
   *    death-save failure (`opts.crit` → two), ends a Stable state (the saves
   *    restart), and is instant death when it reaches the effective max.
   *    A no-op once dead (3 failures).
   *  - The explicit `setHP` override can clear the track and Unconscious condition;
   *    ordinary healing cannot revive a dead character.
   * Returns a causal whole-owner inverse when a positive safe-integer packet
   * commits; the inverse rejects any intervening character/combat-state change.
   */
  applyDamage: (
    amount: number,
    opts?: {
      crit?: boolean;
      hit?: { attacker: CombatantRef | null; attackMode?: "melee" | "ranged" };
    }
  ) => (() => boolean) | null;
  /**
   * Apply healing: raise current HP by `amount` (clamped to max). The dedicated
   * healing seam (mirror of {@link applyDamage}) — used by the HP control's heal
   * action so the combat log gets ONE structured `hp-heal` event from the store,
   * not a low-level `setHP` (which also serves rest/undo/level-up and must stay
   * log-free). No-op for a non-positive amount or a dead character. */
  applyHealing: (amount: number) => void;
  /**
   * Gain temporary HP: set the temp pool to `max(current, amount)` (temp HP don't
   * stack) and log ONE structured `temp-hp-gain` event. The dedicated temp-gain
   * seam, so `setTempHP` (rest/undo/USE-APPLIES) stays log-free. No-op for a
   * non-positive amount. */
  gainTempHp: (amount: number) => void;
  /** Apply the current hero's reviewed combat consequences as one reversible unit.
   * The caller composes the returned inverse with the action/resource inverse. */
  applyResolvedCombatEffects: (effects: {
    damage?: number;
    /** Ordered hit/ray/missile packets. Each packet crosses the 0-HP and
     * concentration seams independently. */
    damagePackets?: ReadonlyArray<{
      amount: number;
      crit?: boolean;
      hit?: { attacker: CombatantRef | null; attackMode?: "melee" | "ranged" };
    }>;
    healing?: number;
    tempHp?: number;
    addConditions?: string[];
    addConcentrationConditions?: string[];
    removeConditions?: string[];
    bardicInspirationDie?: string;
    heroicInspiration?: boolean;
    stabilize?: boolean;
  }) => (() => void) | null;
  /**
   * Expend one spell slot at `level`. `pactMagic` selects the Warlock Pact-Magic
   * pool (which can co-exist with a normal pool at the same level — Sorlock); it
   * defaults to the normal/shared pool. Both pools route through one
   * {@link slotUsageKey} so they NEVER share a usage counter (B3).
   */
  useSpellSlot: (level: number, pactMagic?: boolean) => void;
  restoreSpellSlot: (level: number, pactMagic?: boolean) => void;
  useTracker: (trackerId: string, amount?: number) => void;
  restoreTracker: (trackerId: string, amount?: number) => void;
  /** Commit one preflighted mechanics plan as a single whole-character CAS. */
  applyMechanicsPlan: (plan: MechanicsPlan) => MechanicsPlanCommitResult;
  /** Record or clear one table-rolled value in an available tracker slot. */
  setTrackerRoll: (trackerId: string, index: number, value: number | null) => void;
  /** Spend one exact recorded value and return an inverse restoring it. */
  spendTrackerRoll: (trackerId: string, index: number) => (() => void) | null;
  /** Restore a tracker to a remaining-use floor and return an exact, stale-safe undo. */
  topUpTracker: (trackerId: string, upTo: number | "full") => (() => void) | null;
  /** Refresh every pool scoped to a newly-started active state; returns exact undo. */
  refreshTrackersOnActivation: (activeKey: string) => (() => void) | null;
  /**
   * Apply one typed item-resource whole-state CAS. The caller supplies the exact
   * catalogue spec, physical binding, and planned operation; the store owns only
   * the resulting session state and never resolves mechanics from prose or ids.
   */
  applyItemResourceOperation: (
    item: ResourceItemSpec,
    binding: ResourceItemBinding,
    operation: ItemResourceOperation
  ) => ResourceApplyResult;
  /** Validate and commit a prepared item-resource batch as one whole-state CAS. */
  applyItemResourceOperations: (
    entries: readonly ItemResourceOperationEntry[]
  ) => ItemResourceOperationBatchResult;
  /** Remove one physical equipment ref and its whole resource state atomically. */
  removeItemResourceInstance: (instanceId: string) => boolean;
  /** Decrement a tracked equipment item by 1; removes the entry entirely when quantity hits 0. */
  useEquipmentItem: (equipmentKey: string) => void;
  /**
   * RA-14 — adjust an SRD equipment row's quantity by `delta`, clamped at 0 and
   * KEEPING the row at 0 (ammunition semantics: an empty quiver stays visible —
   * distinct from `useEquipmentItem`'s drop-at-0 consumables). Returns whether a
   * row changed (false = no matching row / no stock to debit / readonly), so the
   * attack-commit seam can debit-if-tracked and register the exact inverse on
   * undo. Inverse-op by design — never a snapshot that could stomp later edits.
   */
  adjustEquipmentQuantity: (srdId: string, delta: number) => boolean;
  setConcentration: (
    spell: StoredConcentration,
    opts?: {
      undoable?: boolean;
      castLevel?: number;
      silent?: boolean;
      /** Internal damage path: a depleted form restores this resolved Temp HP. */
      retractedFormTempHp?: number;
    }
  ) => string[];
  addCondition: (
    condition: string,
    opts?: { registerConcentrationUndo?: boolean }
  ) => void;
  removeCondition: (condition: string) => void;
  /**
   * RA-19 — drop a condition WITHOUT its own toast, returning the EXACT reverse
   * applier (or `null` when nothing was removed / read-only), so a composite
   * caller (the movement-meter Stand action) bundles the clear with its other
   * effect under ONE undo. The shared mutation core `removeCondition` delegates
   * to (which wraps it in the standard `condition-removed` undo toast).
   */
  removeConditionSilent: (condition: string) => (() => void) | null;
  /**
   * RA-12 — apply a SUCCESSFUL Hide check's outcome in one undoable unit (SRD
   * 5.2.1 "Hide [Action]"): gain the Invisible condition and remember the check
   * TOTAL as `session.hiddenDc` (the DC for a creature to find you). Logs the
   * one `condition-gain` story beat. Returns the reverse applier (prior
   * conditions + prior find-DC + the log line restored) for the caller to
   * register on the session undo stack, or `null` when nothing changed
   * (readonly / no character). Override-first: the Invisible chip stays
   * hand-removable like any condition (`removeCondition` clears the find-DC).
   */
  applyHiddenState: (findDc: number) => (() => void) | null;
  /**
   * Restore the simple HP-mutation snapshot an undo captured — current/temp HP, the
   * dying track, and the conditions list — EXACTLY, in one set + one durable
   * combat-state write. Log-free by design (an undo must not mint story beats)
   * and clamp-free (the values came from this same store). The single reverse
   * seam for simple healing/override undo paths, closing the
   * persistence hole a raw `updateSession` restore left (the trio lives in the
   * `combat/state` subdoc, which `updateSession` never writes).
   */
  restoreHpSnapshot: (snap: {
    current: number;
    temp: number;
    deathSucc: number;
    deathFail: number;
    conditions: string[];
  }) => void;
  /**
   * Set the death-saving-throw track (successes + failures). The dedicated
   * death-save seam: when a NEW mark is added (a track count rises) it logs ONE
   * structured `death-save` story event with the resulting tally. Lowering a count
   * (clearing the top pip) or resetting both to 0 is bookkeeping — it never logs.
   * Replaces the raw `updateSession({ deathSucc/deathFail })` so the event has a
   * single emission point. */
  setDeathSaves: (successes: number, failures: number) => void;
  /** Commit a physical Death Save through the universal D20 kernel. Live rules
   * facts are resolved only after every eligibility check at this boundary. */
  commitDeathSave: (faces: ReadonlyArray<number>) => D20TestCommitResult | null;
  /** Resolve the current FIFO Concentration prompt. A stale spell, queue head,
   * damage/DC pair, or character state is rejected without mutation. */
  commitPendingConcentrationSave: (
    pending: PendingConcentrationSave,
    faces: ReadonlyArray<number>
  ) => D20TestCommitResult | null;
  /**
   * Surface the RAW damage-while-concentrating consequence for damage the
   * DETERMINISTIC ENGINE already landed on this character (its journal commit
   * mirrored the HP itself, so this never touches HP): queue the entered-d20
   * Concentration save at the usual DC, or — when the commit left the
   * character at 0 HP — break concentration outright through the one
   * authoritative teardown. No-op when nothing is being concentrated on.
   */
  queueConcentrationSaveForDamage: (damage: number) => void;
  /**
   * PLAY-NO-EDIT — add a SESSION defense (a resistance/immunity/vulnerability/
   * condition-immunity gained in play: a potion, a spell, a curse). Layers over
   * the build's permanent defenses without touching them — the play-time mirror
   * of `addCondition`.
   */
  addSessionDefense: (kind: SessionDefenseKind, id: string) => void;
  /** Remove a session defense when its effect ends (immediate-commit + undo). */
  removeSessionDefense: (kind: SessionDefenseKind, id: string) => void;
  longRest: () => void;
  shortRest: () => void;
  togglePinnedAction: (actionId: string, defaultPinned?: boolean) => void;
  /** L11 — toggle an activatable feature (Bladesong, Innate Sorcery, Rage, …) on/off. */
  toggleActiveFeature: (key: string) => void;
  /**
   * Set an activatable feature's state EXPLICITLY (idempotent — a no-op when it
   * already matches). The combat commit loop uses this to auto-light a state
   * its action establishes (Rage → "barbarian-rage") and to clear it on undo
   * WITHOUT ever flipping a state the player set by hand.
   */
  setActiveFeature: (key: string, active: boolean) => void;
  setActiveSpellCastLevel: (key: string, level?: number) => void;
  /** Arm/replace one deterministic round timer and return its exact inverse. */
  armEffectTimer: (key: string, rounds: number) => (() => void) | null;
  /** Persist an exact future owner-turn boundary and return its surgical inverse. */
  armEffectBoundary: (
    key: string,
    boundary: { round: number; phase: "turn-start" | "turn-end" }
  ) => (() => void) | null;
  /** Drop every active state whose persisted boundary has been reached. */
  expireEffectBoundaries: (position: {
    round: number;
    phase: "turn-start" | "turn-end";
  }) => {
    expired: ReadonlyArray<{ activeKey: string; sourceId: string }>;
    restore: () => void;
  };
  /**
   * FRONTIER-S3 — reset every `recovery: "per-turn"` tracker with a spent use
   * (Sneak Attack) to full, run at the owner's turn start (the End-Turn seam).
   * Returns an undo applier restoring the exact prior tracker state (`null` when
   * nothing needed resetting — no toast). Override-first: the pip stays editable;
   * this only refills it once per turn.
   */
  recoverPerTurnTrackers: () => (() => void) | null;
  /**
   * S9 — drinking a CONSUMED buff potion (Potion of Speed / Giant Strength / …)
   * arms its self-sustaining `potion:<itemId>` round countdown in
   * `session.effectTimers` (reusing the A2 cadence map), so its remaining
   * duration counts down at each End Turn and auto-expires. A no-op for an
   * instant potion (no `durationRounds`). Returns an undo applier restoring the
   * exact prior timers (folded into the drink action's undo), or `null` when
   * nothing was armed. Override-first — the engine never auto-drinks and never
   * auto-applies the buff's stats; the duration is informational + editable.
   */
  consumePotionBuff: (itemId: string) => (() => void) | null;
  /**
   * FRONTIER-S3 — the turn/round-engine countdown step, run at the End-Turn seam:
   * decrement every active `maxRounds` state's timer and AUTO-DROP the ones that
   * reach 0 (clear their `activeFeatures` toggle + log an `effect-expired` event).
   * Returns the dropped states + an undo applier restoring the prior timers,
   * toggles, and log lines, so Undo-End-Turn reverts the whole step atomically.
   */
  advanceEffectTimers: () => {
    expired: ReadonlyArray<{ activeKey: string; sourceId: string }>;
    restore: () => void;
  };
  /**
   * L12 — pick an option for a single-select `choice-grant-bundle` (Circle of
   * the Land terrain). Reconciles always-prepared spells: strips the bundle's
   * previously-injected variant spells and injects the new selection's spells
   * up to the character's level.
   */
  setGrantBundleChoice: (bundleKey: string, optionId: string) => void;
  /**
   * S7 — Polymorph SELF-transformation: assume a Beast `form` (`beastId`) cast via
   * `spellId` (`polymorph` / `true-polymorph`). Stamps the Beast's AC / speeds /
   * ability scores into the OVERRIDE fields (override-first — each stays
   * hand-editable), engages concentration by spell id, and applies Temporary HP =
   * the Beast's HP (max-wins). Stores the form + a snapshot of the caster's own
   * fields on the session so {@link dropPolymorphForm} restores the body exactly.
   * Returns an undo applier restoring the pre-form state, or `null` when the beast
   * id is unknown / already transformed. Override-first + fully undoable.
   */
  assumePolymorphForm: (beastId: string, spellId?: string) => (() => void) | null;
  /**
   * S7 — drop the active Polymorph form: restore the caster's own AC / speeds /
   * scores / temp HP from the stored snapshot, clear the form's concentration, and
   * remove the session form field. Returns an undo applier re-assuming the form, or
   * `null` when not transformed.
   */
  dropPolymorphForm: () => (() => void) | null;
  /** Set a summoned companion's current HP (Steel Defender / Eldritch Cannon). */
  setCompanionHp: (featureId: string, current: number) => void;
  /**
   * Pick a Beast Master companion's stat-block variant (Beast of the Land / Sea /
   * Sky), keyed by the granting feature id. Switching variants RESETS that
   * companion's `companionHp` entry — a different beast is a different HP pool, and
   * clamping the old current-HP would silently misreport (override-first). Returns
   * an undo restoring the prior variant + HP entry, or `null` (readonly / no char).
   */
  setCompanionVariant: (featureId: string, variantId: string) => (() => void) | null;
  /**
   * Summon a Find Familiar of `monsterId` as the chosen `creatureType` (the 2024
   * type swap). Seeds `companionHp["find-familiar"]` to `maxHp` (the CALLER resolves
   * the form's max HP from the corpus — the store stays corpus-free) and clears any
   * `dismissed` flag. Re-casting with a familiar active adopts the new form (RAW
   * "One Familiar Only"). Returns an undo restoring the prior familiar + HP entry,
   * or `null` (readonly / no character).
   */
  summonFamiliar: (
    monsterId: string,
    creatureType: FamiliarCreatureType,
    maxHp: number
  ) => (() => void) | null;
  /** Toggle the familiar's pocket-dimension chip (the Magic-action dismiss/recall
   *  pair — informational, no action-economy enforcement). No-op with no familiar. */
  setFamiliarDismissed: (dismissed: boolean) => void;
  /**
   * Dismiss the familiar forever: delete `session.familiar` AND its
   * `companionHp["find-familiar"]` entry. Returns an undo restoring both, or `null`
   * (readonly / no familiar). Used by "Dismiss forever" and the 0-HP "disappears"
   * affordance (the player confirms — the app never destroys unconfirmed state).
   */
  dismissFamiliar: () => (() => void) | null;
  /**
   * S4 — on rolling Initiative, apply every `initiative-tracker-topup`
   * (Persistent Rage, the maneuver subclass's Relentless, Superior Inspiration, Archdruid,
   * Perfect Focus). Sets each affected tracker's `used` to the consumer's target
   * and returns `{ sourceIds, restore }`: the provenance ids (for the toast) +
   * an undo applier that restores the exact prior tracker state. Empty
   * `sourceIds` ⇒ nothing was owed (no toast). Override-first — the player can
   * re-spend the tracker after, and `restore()` reverts it.
   */
  applyInitiativeTrackerTopUps: () => { sourceIds: string[]; restore: () => void };
  /**
   * S4 — Font of Inspiration: expend a spell slot to regain a tracker use
   * (Bard's Bardic Inspiration). Spends the lowest available slot and restores
   * `usesPerSlot` uses of the tracker, returning an undo applier. No-op (returns
   * `null`) when no conversion is available (no expended use, or no slot).
   */
  recoverTrackerFromSpellSlot: (trackerId: string) => (() => void) | null;
  /**
   * S6 — alternate recovery: restore ONE exhausted use of `trackerId` by paying
   * `amount` units from the funding pool `fromTracker` (a Sorcerer metamagic /
   * Fighter maneuver re-activated from Sorcery Points / the funding pool). Spends
   * the pool, restores one use of the target, and returns an undo applier
   * restoring both. No-op (returns `null`) when the pool can't afford the cost or
   * the target has uses left. Override-first — the tap IS the explicit commit.
   */
  recoverTrackerByAltCost: (
    trackerId: string,
    fromTracker: string,
    amount: number
  ) => (() => void) | null;
  /**
   * S6 (slot-funded) — alternate recovery: restore ONE exhausted use of
   * `trackerId` by EXPENDING a spell slot of level ≥ `minLevel` (Cleric Divine
   * Foreknowledge → 6, Ranger Persistent Wrath → 4). Spends the cheapest
   * eligible unspent slot, restores one use of the target, and returns an undo
   * applier restoring both. No-op (returns `null`) when no eligible slot exists
   * or the target has uses left. Override-first — the tap IS the explicit commit.
   */
  recoverTrackerByMinSlot: (trackerId: string, minLevel: number) => (() => void) | null;
  /**
   * S4 — at-0-HP interrupt (Relentless Endurance / Undying Sentinel / Boon of
   * Misty Escape): set current HP to 1 and debit the interrupt's tracker by 1,
   * returning an undo applier that restores the prior HP + tracker. The UI gates
   * the offer on an unspent interrupt; this performs the apply.
   */
  applyAtZeroHpInterrupt: (trackerId: string) => () => void;
  /**
   * S4 — Arcane Recovery: restore the chosen expended spell slots (validated by
   * the caller against the ⌈level/2⌉ cap) and debit the feature's 1/LR tracker.
   * Returns an undo applier restoring the prior slots + tracker.
   */
  applyArcaneRecovery: (
    slotLevels: ReadonlyArray<number>,
    trackerId: string
  ) => () => void;

  /**
   * Events-as-data combat log — append a STRUCTURED {@link CombatEvent} (ids +
   * numbers, never a localized line) to `session.logEntries`. Returns the new
   * entry's stable id so a caller (e.g. an undo closure) can later remove EXACTLY
   * this line via {@link CharacterState.removeLogEntry}. Caps the stored array at
   * {@link MAX_LOG} and mirrors to IndexedDB. Returns `null` (appends nothing)
   * when there is no active character. The SINGLE emission path: the store-side
   * state-seams (HP / condition / concentration / rest / death-save) and the
   * cockpit commit loop both append through here; the presenter localizes at
   * render. */
  logEvent: (event: CombatEvent) => string | null;
  /** Remove EXACTLY one log entry by its stable id (the inverse of one `logEvent`). */
  removeLogEntry: (id: string | null) => void;
  /** Clear all log entries (the manual trash button + log persistence reset). */
  clearLog: () => void;
}

/**
 * Persist the WHOLE optimistically-computed combat state (offline-safe) after a trio
 * mutation. Projects the (already-updated) session trio onto the canonical CombatState.
 * ONE computation feeds both the UI (the session `set`) and the
 * durable write — no re-reduce, no double clamp (the session is already clamped; the read
 * boundary `applyCombatToSession` re-clamps). A no-op with no character / no seam.
 */
/**
 * The Unconscious condition id (RA-10) — auto-applied by `applyDamage` when a
 * character drops to 0 HP (SRD "Falling Unconscious") and auto-shed by the
 * heal-from-0 seam in `setHP` / the at-zero "drop to 1 instead" interrupt. The
 * chip stays hand-removable like any condition (override-first).
 */
const UNCONSCIOUS_CONDITION_ID = "unconscious";

function legacyCombatEffects(
  effects: ReadonlyArray<ActiveCombatEffect>
): ActiveCombatEffect[] {
  return effects.filter((effect) => effect.programOwner === undefined);
}

function effectiveCombatEffects(
  legacy: ReadonlyArray<ActiveCombatEffect>,
  effectOps: ReadonlyArray<CombatEffectOp>
): ActiveCombatEffect[] {
  return mergeActiveCombatEffects(legacy, foldCombatEffectOps(effectOps));
}

function persistCombat(get: () => CharacterState): void {
  const cur = get().character;
  if (!cur) return;
  get().combatPersistence?.write(
    sessionToCombatState(
      cur.session,
      get().combatRound,
      get().combatRecentActions,
      get().combatAppliedEncounterEffects,
      get().combatTurnEconomy,
      get().combatLegacyActiveEffects,
      get().combatPendingConcentrationSaves,
      get().combatEffectLifecycles,
      get().combatEffectOps,
      {
        actionRevision: get().combatActionRevision,
        actionHead: get().combatActionHead,
        actionLifecycles: get().combatActionLifecycles,
      }
    )
  );
}

/** Resource mutations schedule the ordinary parent autosave synchronously through the
 * store subscriber. Flush it in a microtask so a composite cast can finish every
 * slot/tracker/concentration/log mutation first, then persist the final snapshot once. */
let parentFlushQueued = false;
function flushParentPersistence(get: () => CharacterState): void {
  if (parentFlushQueued) return;
  parentFlushQueued = true;
  queueMicrotask(() => {
    parentFlushQueued = false;
    get().parentPersistenceFlush?.();
  });
}

function attachEncounterEffects(
  character: CharacterDoc,
  projection: CharacterState["encounterEffectProjection"],
  localEffects: ReadonlyArray<ActiveCombatEffect>
): void {
  const effects = [
    ...localEffects,
    ...(projection && projection.characterId === character.id ? projection.effects : []),
  ];
  Object.defineProperty(character.session, "encounterEffects", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: effects.length > 0 ? effects : undefined,
  });
}

type CombatHydrationPatch = Pick<
  CharacterState,
  | "character"
  | "combatRound"
  | "combatRecentActions"
  | "combatActiveEffects"
  | "combatLegacyActiveEffects"
  | "combatEffectOps"
  | "combatEffectLifecycles"
  | "combatActionRevision"
  | "combatActionHead"
  | "combatActionLifecycles"
  | "combatAppliedEncounterEffects"
  | "combatTurnEconomy"
  | "combatPendingConcentrationSaves"
>;

/** Build one complete inbound play-state projection without publishing an
 * intermediate parent-only character. */
function projectCombatHydration(
  character: CharacterDoc,
  combat: CombatState | null,
  encounterEffectProjection: CharacterState["encounterEffectProjection"]
): CombatHydrationPatch | null {
  const legacyActiveEffects = legacyCombatEffects(combat?.activeEffects ?? []);
  const effectOps = combat?.effectOps ?? [];
  const activeEffects = effectiveCombatEffects(legacyActiveEffects, effectOps);
  const projected = { ...character, session: { ...character.session } };
  attachEncounterEffects(projected, encounterEffectProjection, activeEffects);
  let maxSession = projected.session;
  if (projected.playStateVersion === 1) {
    if (!combat?.playState) return null;
    const parsed = parsePersistedPlayStateV1(combat.playState);
    if (!parsed.ok) return null;
    maxSession = parsed.session;
    if (projected.session.encounterEffects) {
      Object.defineProperty(maxSession, "encounterEffects", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: projected.session.encounterEffects,
      });
    }
  }
  const max = effectiveMaxHp(projected.character, maxSession);
  const hydration = applyCombatToSession(
    projected.session,
    combat,
    max,
    projected.playStateVersion === 1 ? 1 : "legacy"
  );
  if (!hydration.ok) return null;
  const hydrated = {
    ...projected,
    character: {
      ...projected.character,
      ac: effectiveAC(projected.character, hydration.session),
    },
    session: hydration.session,
  };
  const hydratedConcentration = hydrated.session.concentration;
  const pendingConcentrationSaves =
    hydrated.session.hp.current > 0 &&
    isCharacterAlive(hydrated.status, hydrated.session) &&
    hydratedConcentration !== ""
      ? (combat?.pendingConcentrationSaves ?? []).filter(
          (pending) => pending.spell === hydratedConcentration
        )
      : [];
  return {
    character: hydrated,
    combatRound: combat?.round ?? 1,
    combatRecentActions: combat?.recentActions ?? [],
    combatActiveEffects: activeEffects,
    combatLegacyActiveEffects: legacyActiveEffects,
    combatEffectOps: effectOps,
    combatEffectLifecycles: combat?.effectLifecycles ?? [],
    combatActionRevision: combat?.actionRevision ?? 0,
    combatActionHead: combat?.actionHead ?? null,
    combatActionLifecycles: combat?.actionLifecycles ?? {},
    combatAppliedEncounterEffects: combat?.appliedEncounterEffects,
    combatTurnEconomy: combat?.turnEconomy,
    combatPendingConcentrationSaves: pendingConcentrationSaves,
  };
}

interface D20CommandSnapshot {
  character: CharacterDoc;
  legacyActiveEffects: ActiveCombatEffect[];
  effectOps: CombatEffectOp[];
  pendingConcentrationSaves: PendingConcentrationSave[];
  encounterEffectProjection: CharacterState["encounterEffectProjection"];
  damageTakenThisRound: boolean;
}

function captureD20Command(state: CharacterState): D20CommandSnapshot | null {
  if (!state.character) return null;
  return {
    character: structuredClone(state.character),
    legacyActiveEffects: structuredClone(state.combatLegacyActiveEffects),
    effectOps: structuredClone(state.combatEffectOps),
    pendingConcentrationSaves: structuredClone(state.combatPendingConcentrationSaves),
    encounterEffectProjection: structuredClone(state.encounterEffectProjection),
    damageTakenThisRound: useCombatStore.getState().damageTakenThisRound,
  };
}

function sameD20CommandSnapshot(
  left: D20CommandSnapshot | null,
  right: D20CommandSnapshot
): boolean {
  return left !== null && JSON.stringify(left) === JSON.stringify(right);
}

/** Restore one exact owner-combat receipt only while its post-state is still current. */
function causalD20CommandUndo(
  before: D20CommandSnapshot,
  after: D20CommandSnapshot,
  get: () => CharacterState
): () => boolean {
  return () => {
    if (!sameD20CommandSnapshot(captureD20Command(get()), after)) return false;
    const restoredCharacter = structuredClone(before.character);
    const restoredLegacyEffects = structuredClone(before.legacyActiveEffects);
    const restoredEffectOps = structuredClone(before.effectOps);
    const restoredEffects = effectiveCombatEffects(
      restoredLegacyEffects,
      restoredEffectOps
    );
    const restoredProjection = structuredClone(before.encounterEffectProjection);
    attachEncounterEffects(restoredCharacter, restoredProjection, restoredEffects);
    useCharacterStore.setState({
      character: restoredCharacter,
      combatActiveEffects: restoredEffects,
      combatLegacyActiveEffects: restoredLegacyEffects,
      combatEffectOps: restoredEffectOps,
      combatPendingConcentrationSaves: structuredClone(before.pendingConcentrationSaves),
      encounterEffectProjection: restoredProjection,
    });
    useCombatStore.setState({ damageTakenThisRound: before.damageTakenThisRound });
    persistCombat(get);
    flushParentPersistence(get);
    void saveLogToIDB(restoredCharacter.id, restoredCharacter.session.logEntries);
    return true;
  };
}

/**
 * End the ENGINE-held concentration occurrence when the legacy authority drops
 * the same spell — the world-side twin of `setConcentration`'s teardown. The
 * end runs through the canonical kernel machinery (`planEngineConcentrationEnd`:
 * one end request over the owning program root; dependents — the concentration
 * effect and every standing buff it sourced — end in the same wave), committed
 * as one journal action whose mirror keeps `session.concentration` coherent.
 * After it, neither the world nor the session holds the spell (no re-mirror
 * zombie). Reads the world's own persisted uid, so this store stays
 * Firebase-free. Returns the committed action id (the undo pairing) or null
 * when the world holds no matching engine concentration — the legacy teardown
 * alone is then complete.
 */
function endEngineConcentrationWorld(
  get: () => CharacterState,
  droppedSpell: string
): string | null {
  const doc = get().character;
  if (!doc || doc.session.world === undefined) return null;
  const uid = persistedWorldUid(doc.session.world);
  if (uid === null) return null;
  const world = characterWorldState(doc, uid, doc.character.hp.max);
  if (!world) return null;
  const handle = engineConcentrationHandle(world);
  if (
    !handle ||
    handle.spellId === null ||
    concentrationValue(handle.spellId) !== droppedSpell
  ) {
    return null;
  }
  const actionId = `concentration-break-${crypto.randomUUID()}`;
  const action = planEngineConcentrationEnd(doc, uid, world, actionId);
  if (!action) return null;
  const committed = commitCharacterAction(
    doc,
    uid,
    world,
    action,
    boundaryCommitFacts(action)
  );
  if (!committed) return null;
  useCharacterStore.setState({ character: { ...doc, session: committed.session } });
  return actionId;
}

/** Exactly reverse one committed engine concentration end (the undo pairing of
 * {@link endEngineConcentrationWorld}) through the canonical journal reverse;
 * a conflicting or already-reversed action is a silent no-op (the legacy field
 * restore still lands — a legacy-held concentration, never a zombie). */
function undoEngineConcentrationEnd(get: () => CharacterState, actionId: string): void {
  const doc = get().character;
  if (!doc || doc.session.world === undefined) return;
  const uid = persistedWorldUid(doc.session.world);
  if (uid === null) return;
  const world = characterWorldState(doc, uid, doc.character.hp.max);
  if (!world) return;
  const undone = undoCharacterAction(doc, uid, world, actionId);
  if (!undone) return;
  useCharacterStore.setState({ character: { ...doc, session: undone.session } });
}

export const useCharacterStore = create<CharacterState>()((set, get) => ({
  character: null,
  loading: false,
  error: null,
  readonly: false,
  combatPersistence: null,
  parentPersistenceFlush: null,
  combatRound: 1,
  combatRecentActions: [],
  combatActiveEffects: [],
  combatLegacyActiveEffects: [],
  combatEffectOps: [],
  combatEffectLifecycles: [],
  combatActionRevision: 0,
  combatActionHead: null,
  combatActionLifecycles: {},
  combatAppliedEncounterEffects: undefined,
  combatTurnEconomy: undefined,
  combatPendingConcentrationSaves: [],
  encounterEffectProjection: null,

  // The normal owner-edit load path — always clears read-only (so re-entering a
  // sheet you own after viewing someone else's is fully editable again).
  setCharacter: (doc) =>
    set({
      character: doc,
      error: null,
      readonly: false,
      combatActiveEffects: [],
      combatLegacyActiveEffects: [],
      combatEffectOps: [],
      combatEffectLifecycles: [],
      combatActionRevision: 0,
      combatActionHead: null,
      combatActionLifecycles: {},
      combatPendingConcentrationSaves: [],
    }),
  setEncounterEffects: (characterId, effects = []) => {
    const projection = characterId ? { characterId, effects } : null;
    const { character } = get();
    set({
      encounterEffectProjection: projection,
      ...(character ? { character: { ...character } } : {}),
    });
  },
  applySoloCombatEffects: (effects) => {
    if (get().readonly || effects.length === 0) return null;
    const character = get().character;
    if (!character) return null;
    const additions = legacyCombatEffects(effects);
    if (additions.length === 0) return null;
    const previous = get().combatLegacyActiveEffects;
    const nextLegacy = mergeActiveCombatEffects(previous, additions);
    const next = effectiveCombatEffects(nextLegacy, get().combatEffectOps);
    set({
      combatActiveEffects: next,
      combatLegacyActiveEffects: nextLegacy,
      character: { ...character },
    });
    persistCombat(get);
    return () => {
      const current = get().character;
      if (!current) return;
      set({
        combatActiveEffects: effectiveCombatEffects(previous, get().combatEffectOps),
        combatLegacyActiveEffects: previous,
        character: { ...current },
      });
      persistCombat(get);
    };
  },
  replaceCombatEffectOps: (effectOps) => {
    if (get().readonly || !get().character) return false;
    const canonical = conformCombatEffectOps(effectOps);
    if (canonical.length !== effectOps.length) return false;
    const character = get().character;
    if (!character) return false;
    set({
      combatEffectOps: canonical,
      combatActiveEffects: effectiveCombatEffects(
        get().combatLegacyActiveEffects,
        canonical
      ),
      character: { ...character },
    });
    persistCombat(get);
    return true;
  },
  loadReadonly: (doc) =>
    set({
      character: doc,
      error: null,
      readonly: true,
      combatActiveEffects: [],
      combatLegacyActiveEffects: [],
      combatEffectOps: [],
      combatEffectLifecycles: [],
      combatActionRevision: 0,
      combatActionHead: null,
      combatActionLifecycles: {},
      combatPendingConcentrationSaves: [],
    }),
  loadCharacterWithCombat: (doc, combat, readonly) => {
    const projection = projectCombatHydration(
      doc,
      combat,
      get().encounterEffectProjection
    );
    if (!projection) {
      set({
        error:
          doc.playStateVersion === 1
            ? combat
              ? "Invalid play state: invalid-v1-play-state"
              : "Invalid play state: missing-v1-combat-state"
            : "Invalid combat state",
      });
      return false;
    }
    set({ ...projection, error: null, readonly });
    return true;
  },
  setCombatPersistence: (persistence) => set({ combatPersistence: persistence }),
  persistPlayState: () => persistCombat(get),
  setParentPersistenceFlush: (flush) => set({ parentPersistenceFlush: flush }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  hydrateCombatState: (combat) => {
    const { character } = get();
    if (!character) return;
    // Clamp the hydrated HP against the EFFECTIVE max (stored base + hp-flat boons +
    // Aid), the same ceiling every write path uses (rule 6 — one source for max).
    // The trio-merge math itself lives ONCE in `applyCombatToSession` (reused by the
    // in-hub party/encounter live read).
    const projection = projectCombatHydration(
      character,
      combat,
      get().encounterEffectProjection
    );
    // Once the parent advertises v1 ownership, absence or a malformed play payload is
    // an integrity failure—not a fresh/full-HP character. Leave the last proven store
    // state untouched so auto-save cannot write a fabricated replacement.
    if (!projection) {
      set({
        error:
          character.playStateVersion === 1
            ? combat
              ? "Invalid play state: invalid-v1-play-state"
              : "Invalid play state: missing-v1-combat-state"
            : "Invalid combat state",
      });
      return;
    }
    set({ ...projection, error: null });
  },

  updateSession: (partial) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    set({
      character: {
        ...character,
        session: { ...character.session, ...partial },
      },
    });
  },

  setHeroicInspiration: (held) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character || character.session.inspiration === held) return;
    set({
      character: {
        ...character,
        session: { ...character.session, inspiration: held },
      },
    });
    persistCombat(get);
  },

  setBardicInspirationDie: (die) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character || (character.session.bardicInspirationDie ?? "") === die) return;
    set({
      character: {
        ...character,
        session: { ...character.session, bardicInspirationDie: die },
      },
    });
    persistCombat(get);
  },

  setHP: (current, opts) => {
    // Note: callers applying *damage* must use `applyDamage(amount)` instead
    // — that path computes concentration-save DCs from the **total** incoming
    // damage (incl. the slice absorbed by temp HP). `setHP` is a low-level
    // setter used by rest / undo / level-up / heal where the change isn't a hit.
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    // D1 — clamp against the EFFECTIVE max (stored base + hp-flat boons + Aid), not
    // the by-the-book stored base, so a Draconic Sorcerer / Boon-of-Fortitude / Aided
    // character can hold their correct higher HP (rule 6 — one source for max).
    const max = effectiveMaxHp(character.character, character.session);
    const clamped = clampHp(current, max);
    const prevCurrent = character.session.hp.current;
    // RAW 2024 PHB: "If you regain any hit points, your Death Saving Throws
    // are reset." Trigger: any transition from 0 → positive HP.
    // Bug fix (2026-05-28): previously deathSucc / deathFail kept their
    // values across a heal, so a character revived after 2 failed saves
    // would re-enter combat already mid-death-throw on the next knockout.
    const healingFromZero = prevCurrent === 0 && clamped > 0;
    const deathReset = healingFromZero ? { deathSucc: 0, deathFail: 0 } : {};
    // RA-10 — SRD "Falling Unconscious": the condition lasts "until you regain
    // any Hit Points", so the SAME 0 → positive transition that resets the dying
    // track sheds it. Log-free like the rest of `setHP` (an undo restoring HP
    // must not mint story beats); `applyHealing` logs the story-side
    // `condition-loss` for a real heal.
    const sheddingUnconscious =
      healingFromZero && character.session.conditions.includes(UNCONSCIOUS_CONDITION_ID);
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          hp: { ...character.session.hp, current: clamped },
          ...deathReset,
          ...(sheddingUnconscious
            ? {
                conditions: character.session.conditions.filter(
                  (c) => c !== UNCONSCIOUS_CONDITION_ID
                ),
              }
            : {}),
        },
      },
    });
    // Persist the whole resulting combat state (offline-safe). `persist: false` skips it
    // for `applyHealing`, which persists once after its own optimistic update.
    if (opts?.persist !== false) persistCombat(get);
  },

  setTempHP: (temp) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const clampedTemp = clampTemp(temp);
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          hp: { ...character.session.hp, temp: clampedTemp },
        },
      },
    });
    persistCombat(get);
  },

  applyDamage: (amount, opts) => {
    if (!Number.isSafeInteger(amount) || amount <= 0) return null;
    if (get().readonly) return null;
    const { character } = get();
    if (!character) return null;
    const before = captureD20Command(get());
    if (!before) return null;
    const finishDamage = (): (() => boolean) | null => {
      const after = captureD20Command(get());
      return after ? causalD20CommandUndo(before, after, get) : null;
    };
    const { current, temp } = character.session.hp;
    const max = effectiveMaxHp(character.character, character.session);
    const aggregate = aggregateCharacterGrants(character.character, character.session);
    const persistentEffects = character.session.encounterEffects ?? [];
    const stateFloorByKey = new Map(
      aggregate.zeroHpFloors.map((floor) => [
        floor.activeKey,
        { stateKey: floor.activeKey, hitPoints: floor.hitPoints },
      ])
    );
    const transition = reducePcDamage({
      state: {
        hp: { current, temp, max },
        conditions: character.session.conditions,
        deathSaves: {
          successes: character.session.deathSucc,
          failures: character.session.deathFail,
        },
      },
      intake: { stage: "resolved", amount },
      ...(opts?.crit ? { crit: true } : {}),
      ...(opts?.hit ? { hit: opts.hit } : {}),
      persistentEffects,
      stateZeroHpFloors: [...stateFloorByKey.values()],
    });
    if (!transition.changed) return null;

    const consumedEffectIds = new Set(transition.consumedEffectIds);
    const consumedActiveKeys = new Set([
      ...transition.consumedStateKeys,
      ...persistentEffects.flatMap((effect) =>
        consumedEffectIds.has(effect.id) &&
        (effect.payload.kind === "grant-group" || effect.payload.kind === "target-mark")
          ? [effect.payload.activeKey]
          : []
      ),
    ]);
    const nextLegacyEffects = get().combatLegacyActiveEffects.filter(
      (effect) => !consumedEffectIds.has(effect.id)
    );
    const nextLocalEffects = effectiveCombatEffects(
      nextLegacyEffects,
      get().combatEffectOps
    );
    const nextEncounterEffects = persistentEffects.filter(
      (effect) => !consumedEffectIds.has(effect.id)
    );
    const encounterProjection = get().encounterEffectProjection;
    const nextEncounterEffectProjection =
      consumedEffectIds.size > 0 && encounterProjection?.characterId === character.id
        ? {
            ...encounterProjection,
            effects: encounterProjection.effects.filter(
              (effect) => !consumedEffectIds.has(effect.id)
            ),
          }
        : encounterProjection;
    const logTransitionEvents = (): void => {
      for (const event of transition.events) {
        if (event.kind === "hp-damage") {
          get().logEvent({
            kind: event.kind,
            amount: event.incoming,
            current: event.current,
            max: event.max,
          });
        } else if (event.kind === "condition-gain" || event.kind === "condition-loss") {
          get().logEvent(event);
        } else if (event.kind === "death-save") {
          get().logEvent(event);
        }
      }
    };

    if (current === 0) {
      set({
        combatActiveEffects: nextLocalEffects,
        combatLegacyActiveEffects: nextLegacyEffects,
        // A creature taking damage at 0 cannot still maintain Concentration;
        // any legacy/stale queued prompts are therefore ineligible.
        combatPendingConcentrationSaves: [],
        encounterEffectProjection: nextEncounterEffectProjection,
        character: {
          ...character,
          session: {
            ...character.session,
            hp: {
              ...character.session.hp,
              current: transition.state.hp.current,
              temp: transition.state.hp.temp,
            },
            conditions: [...transition.state.conditions],
            deathSucc: transition.state.deathSaves.successes,
            deathFail: transition.state.deathSaves.failures,
            ...(consumedEffectIds.size > 0
              ? { encounterEffects: nextEncounterEffects }
              : {}),
            ...(consumedActiveKeys.size > 0
              ? {
                  activeFeatures: (character.session.activeFeatures ?? []).filter(
                    (key) => !consumedActiveKeys.has(key)
                  ),
                }
              : {}),
          },
        },
      });
      logTransitionEvents();
      persistCombat(get);
      return finishDamage();
    }

    // USE-APPLIES (Task 2, RAGE-MAINTAIN) — "taking damage" MAINTAINS a Rage-style
    // state for another round (2024 RAW). This is the real HP-reduction path (the
    // manual HP control delegates here), so flag it on the per-round combat state;
    // the End-Turn maintenance check then treats a hit round as maintained — no
    // banner, zero extra taps. Per-round flag resets in `combatStore.endTurn`.
    useCombatStore.getState().noteDamageTaken();
    const newCurrent = transition.state.hp.current;
    const newTemp = transition.state.hp.temp;

    // S7 — a Polymorph SELF-form ends the moment its Temporary Hit Points are
    // depleted (2024 RAW's PRIMARY end-trigger: "the spell ends early on the
    // target if it has no Temporary Hit Points left"). Because Temp HP absorbs
    // first, `newTemp === 0` SUBSUMES the caster-hits-0-HP case. When the form
    // ends this way the spell ends OUTRIGHT — no Concentration maintenance save
    // is offered (below), and the Beast build is retracted (further below).
    const activeForm = character.session.polymorphForm;
    const formEnds = activeForm !== undefined && newTemp === 0;

    // Concentration save uses the TOTAL damage taken — including the slice
    // absorbed by temp. 2024 PHB: "If you take damage while concentrating,
    // you make a Constitution save…" — the trigger is "take damage", not
    // "take damage to current HP". And per RAW: "If you drop to 0 Hit
    // Points, your Concentration is broken" — that's an automatic loss, no
    // save. Both rules surface as a single concentration state-clear when
    // current = 0.
    const concentrating = character.session.concentration;
    let nextPendingConcentrationSaves = get().combatPendingConcentrationSaves;
    const concentrationBreaks = concentrating !== "" && (newCurrent === 0 || formEnds);
    if (concentrating !== "") {
      if (concentrationBreaks) {
        // Concentration ends OUTRIGHT — no maintenance save is offered — when the
        // caster drops to 0 HP (broken by RAW) OR when a Polymorph form's Temp HP
        // is depleted (S7: the spell ends, taking its Concentration with it). Both
        // surface as the single `concentration-dropped` beat.
        nextPendingConcentrationSaves = [];
        useToastStore.getState().showToast({
          intent: { kind: "concentration-dropped", spell: concentrating },
          duration: 5000,
        });
      } else {
        const dc = concentrationSaveDc(amount);
        const pending: PendingConcentrationSave = {
          id: crypto.randomUUID(),
          spell: concentrating,
          damage: amount,
          difficultyClass: dc,
        };
        nextPendingConcentrationSaves = [...nextPendingConcentrationSaves, pending];
        // Keep the shipped short notice, but the prompt is no longer ephemeral:
        // the durable FIFO above remains reachable until the entered roll commits.
        // Its display facts come from the same live kernel context as resolution.
        const context = concentrationSaveD20Context(character, pending);
        const saveBonus = context.modifierTerms.reduce(
          (sum, term) => sum + term.value,
          0
        );
        const advantage =
          context.advantageSourceIds.length > 0 &&
          context.disadvantageSourceIds.length === 0;
        useToastStore.getState().showToast({
          intent: {
            kind: "concentration-save",
            spell: concentrating,
            dc,
            saveBonus,
            advantage,
          },
          duration: 5000,
        });
      }
    }

    set({
      combatActiveEffects: nextLocalEffects,
      combatLegacyActiveEffects: nextLegacyEffects,
      combatPendingConcentrationSaves: nextPendingConcentrationSaves,
      encounterEffectProjection: nextEncounterEffectProjection,
      character: {
        ...character,
        session: {
          ...character.session,
          hp: { ...character.session.hp, current: newCurrent, temp: newTemp },
          conditions: [...transition.state.conditions],
          deathSucc: transition.state.deathSaves.successes,
          deathFail: transition.state.deathSaves.failures,
          ...(consumedEffectIds.size > 0
            ? { encounterEffects: nextEncounterEffects }
            : {}),
          ...(consumedActiveKeys.size > 0
            ? {
                activeFeatures: (character.session.activeFeatures ?? []).filter(
                  (key) => !consumedActiveKeys.has(key)
                ),
              }
            : {}),
        },
      },
    });
    logTransitionEvents();
    if (concentrationBreaks) {
      // ONE authoritative teardown owns every concentration-bound fact. Keep the
      // already-resolved depleted-form Temp HP instead of restoring its prior pool.
      get().setConcentration("", {
        undoable: false,
        ...(formEnds ? { retractedFormTempHp: newTemp } : {}),
      });
    } else {
      // Persist the whole resulting combat state (offline-safe, durably queued).
      persistCombat(get);
    }
    return finishDamage();
  },

  applyHealing: (amount) => {
    if (amount <= 0) return;
    if (get().readonly) return;
    const { character } = get();
    if (!character || !isCharacterAlive(character.status, character.session)) return;
    // D1 — heal up to the effective max (stored base + hp-flat boons + Aid).
    const max = effectiveMaxHp(character.character, character.session);
    const prevCurrent = character.session.hp.current;
    const newCurrent = healHp(prevCurrent, amount, max);
    if (newCurrent === prevCurrent) return;
    // Reuse setHP for the OPTIMISTIC in-memory update so the heal-from-0 death-save
    // reset + Unconscious shed (RAW 2024) stay in ONE place — but `persist: false`,
    // so we persist ONCE here (the whole resulting state). setHP never logs.
    const wasUnconsciousAtZero =
      prevCurrent === 0 &&
      character.session.conditions.includes(UNCONSCIOUS_CONDITION_ID);
    get().setHP(newCurrent, { persist: false });
    get().logEvent({ kind: "hp-heal", amount, current: newCurrent, max });
    // RA-10 — a real heal off 0 is the story beat that ends Unconscious (the
    // low-level `setHP` shed it silently above).
    if (wasUnconsciousAtZero) {
      get().logEvent({ kind: "condition-loss", conditionId: UNCONSCIOUS_CONDITION_ID });
    }
    persistCombat(get);
  },

  gainTempHp: (amount) => {
    if (amount <= 0) return;
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const prevTemp = character.session.hp.temp;
    const newTemp = Math.max(prevTemp, amount); // temp HP don't stack
    if (newTemp === prevTemp) return;
    get().setTempHP(newTemp);
    get().logEvent({ kind: "temp-hp-gain", amount: newTemp });
  },

  applyResolvedCombatEffects: (effects) => {
    if (get().readonly) return null;
    const before = get().character;
    if (!before) return null;
    const legacyActiveEffectsBefore = get().combatLegacyActiveEffects;
    const effectOpsBefore = get().combatEffectOps;
    const pendingConcentrationSavesBefore = get().combatPendingConcentrationSaves;
    const healingBlocked = aggregateCharacterGrants(
      before.character,
      before.session
    ).healingBlocked;
    const damageTakenBefore = useCombatStore.getState().damageTakenThisRound;
    if (effects.damagePackets) {
      for (const packet of effects.damagePackets) {
        get().applyDamage(packet.amount, {
          ...(packet.crit ? { crit: true } : {}),
          ...(packet.hit ? { hit: packet.hit } : {}),
        });
      }
    } else if (effects.damage) {
      get().applyDamage(effects.damage);
    }
    if (effects.healing && !healingBlocked) get().applyHealing(effects.healing);
    if (effects.tempHp) get().gainTempHp(effects.tempHp);
    if (effects.bardicInspirationDie !== undefined)
      get().setBardicInspirationDie(effects.bardicInspirationDie);
    if (effects.heroicInspiration !== undefined)
      get().setHeroicInspiration(effects.heroicInspiration);
    if (effects.stabilize) {
      const current = get().character;
      if (
        current?.session.hp.current === 0 &&
        isCharacterAlive(current.status, current.session)
      ) {
        get().setDeathSaves(3, 0);
      }
    }
    if (effects.addConcentrationConditions?.length) {
      const current = get().character;
      if (current)
        set({
          character: {
            ...current,
            session: {
              ...current.session,
              concentrationConditions: effects.addConcentrationConditions,
            },
          },
        });
    }
    for (const condition of effects.addConditions ?? [])
      get().addCondition(condition, { registerConcentrationUndo: false });
    for (const condition of effects.removeConditions ?? []) {
      get().removeConditionSilent(condition);
    }
    if (effects.addConcentrationConditions?.length || effects.removeConditions?.length)
      flushParentPersistence(get);
    return () => {
      set({
        character: before,
        combatActiveEffects: effectiveCombatEffects(
          legacyActiveEffectsBefore,
          effectOpsBefore
        ),
        combatLegacyActiveEffects: legacyActiveEffectsBefore,
        combatEffectOps: effectOpsBefore,
        combatPendingConcentrationSaves: pendingConcentrationSavesBefore,
      });
      useCombatStore.setState({ damageTakenThisRound: damageTakenBefore });
      persistCombat(get);
      flushParentPersistence(get);
    };
  },

  useSpellSlot: (level, pactMagic = false) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const key = slotUsageKey({ level, pactMagic });
    const current = character.session.spellSlots[key]?.used ?? 0;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          spellSlots: {
            ...character.session.spellSlots,
            [key]: { used: current + 1 },
          },
        },
      },
    });
    flushParentPersistence(get);
  },

  restoreSpellSlot: (level, pactMagic = false) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const key = slotUsageKey({ level, pactMagic });
    const current = character.session.spellSlots[key]?.used ?? 0;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          spellSlots: {
            ...character.session.spellSlots,
            [key]: { used: Math.max(0, current - 1) },
          },
        },
      },
    });
    flushParentPersistence(get);
  },

  useTracker: (trackerId, amount = 1) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const entry = character.session.trackers[trackerId];
    const current = entry?.used ?? 0;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          trackers: {
            ...character.session.trackers,
            [trackerId]: { ...entry, used: current + amount },
          },
        },
      },
    });
    flushParentPersistence(get);
  },

  restoreTracker: (trackerId, amount = 1) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const entry = character.session.trackers[trackerId];
    const current = entry?.used ?? 0;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          trackers: {
            ...character.session.trackers,
            [trackerId]: { ...entry, used: Math.max(0, current - amount) },
          },
        },
      },
    });
    flushParentPersistence(get);
  },

  applyMechanicsPlan: (plan) => {
    if (get().readonly) return { status: "rejected", reason: "readonly" };
    if (!get().character) {
      return { status: "rejected", reason: "character-missing" };
    }
    let receipt: MechanicsReceipt | undefined;
    let rejection: Extract<MechanicsPlanCommitResult, { status: "rejected" }>["reason"] =
      "invalid-plan";
    set((state) => {
      if (!state.character) {
        rejection = "character-missing";
        return state;
      }
      const applied = applyMechanicsPlanToCharacter(state.character, plan);
      if (applied.status === "rejected") {
        rejection =
          applied.reason === "source-unavailable" ? "stale-plan" : applied.reason;
        return state;
      }
      receipt = applied.receipt;
      return { ...state, character: applied.character };
    });
    if (!receipt) return { status: "rejected", reason: rejection };
    flushParentPersistence(get);
    return { status: "applied", receipt };
  },

  setTrackerRoll: (trackerId, index, value) => {
    if (get().readonly || index < 0 || !Number.isInteger(index)) return;
    const character = get().character;
    if (!character) return;
    const tracker = resolveTrackers(character).find((entry) => entry.id === trackerId);
    if (!tracker?.recordedRolls) return;
    const available = Math.max(0, tracker.total - tracker.used);
    if (index >= available) return;
    const normalized =
      value === null || !Number.isFinite(value)
        ? null
        : Math.min(
            tracker.recordedRolls.max,
            Math.max(tracker.recordedRolls.min, Math.round(value))
          );
    const prior = character.session.trackers[trackerId];
    const rolls = Array.from({ length: available }, (_, slot): number | null =>
      slot === index ? normalized : (prior?.rolls?.[slot] ?? null)
    );
    const used = prior?.used ?? 0;
    const nextEntry: TrackerState | undefined = rolls.some(
      (roll): roll is number => typeof roll === "number"
    )
      ? { used, rolls }
      : used > 0
        ? { used }
        : undefined;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          trackers: restoreTrackerEntry(character.session.trackers, trackerId, nextEntry),
        },
      },
    });
    flushParentPersistence(get);
  },

  spendTrackerRoll: (trackerId, index) => {
    if (get().readonly || index < 0 || !Number.isInteger(index)) return null;
    const character = get().character;
    if (!character) return null;
    const tracker = resolveTrackers(character).find((entry) => entry.id === trackerId);
    const prior = character.session.trackers[trackerId];
    if (
      !tracker?.recordedRolls ||
      !prior ||
      prior.used >= tracker.total ||
      index >= tracker.total - prior.used ||
      typeof prior.rolls?.[index] !== "number"
    ) {
      return null;
    }
    const rolls = [...prior.rolls];
    rolls.splice(index, 1);
    const next: TrackerState = {
      used: Math.min(tracker.total, prior.used + 1),
      ...(rolls.length > 0 ? { rolls } : {}),
    };
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          trackers: { ...character.session.trackers, [trackerId]: next },
        },
      },
    });
    flushParentPersistence(get);
    return () => {
      const live = get().character;
      if (!live || !trackerStateEquals(live.session.trackers[trackerId], next)) return;
      set({
        character: {
          ...live,
          session: {
            ...live.session,
            trackers: restoreTrackerEntry(live.session.trackers, trackerId, prior),
          },
        },
      });
      flushParentPersistence(get);
    };
  },

  topUpTracker: (trackerId, upTo) => {
    if (get().readonly) return null;
    const character = get().character;
    if (!character) return null;
    const tracker = resolveTrackers(character).find((entry) => entry.id === trackerId);
    if (!tracker) return null;
    const floor =
      upTo === "full" ? tracker.total : Math.min(tracker.total, Math.max(0, upTo));
    const appliedUsed = tracker.total - floor;
    const prior = character.session.trackers[trackerId];
    if ((prior?.used ?? 0) <= appliedUsed) return () => {};
    const trackers =
      appliedUsed === 0
        ? restoreTrackerEntry(character.session.trackers, trackerId, undefined)
        : {
            ...character.session.trackers,
            [trackerId]: { used: appliedUsed },
          };
    set({
      character: {
        ...character,
        session: { ...character.session, trackers },
      },
    });
    flushParentPersistence(get);
    return () => {
      const live = get().character;
      if (!live || (live.session.trackers[trackerId]?.used ?? 0) !== appliedUsed) return;
      set({
        character: {
          ...live,
          session: {
            ...live.session,
            trackers: restoreTrackerEntry(live.session.trackers, trackerId, prior),
          },
        },
      });
      flushParentPersistence(get);
    };
  },

  refreshTrackersOnActivation: (activeKey) => {
    if (get().readonly) return null;
    const character = get().character;
    if (!character) return null;
    const restores = resolveTrackers(character)
      .filter((tracker) => tracker.refreshOnActivationOf === activeKey)
      .map((tracker) => get().topUpTracker(tracker.id, "full"))
      .filter((restore): restore is () => void => restore != null);
    if (restores.length === 0) return null;
    return () => {
      for (const restore of restores.toReversed()) restore();
    };
  },

  applyItemResourceOperation: (item, binding, operation) => {
    const character = get().character;
    const instanceId = binding.instanceId;
    const current =
      typeof instanceId === "string"
        ? character?.session.itemResources?.[instanceId]
        : undefined;
    if (get().readonly || !character) {
      return {
        status: "rejected",
        ...(current ? { state: structuredClone(current) } : {}),
      };
    }
    const owners = character.character.equipment.filter(
      (ref) =>
        !("custom" in ref) &&
        ref.srdId === item.itemId &&
        ref.srdId === binding.srdId &&
        ref.instanceId === instanceId
    );
    if (owners.length !== 1) {
      return {
        status: "rejected",
        ...(current ? { state: structuredClone(current) } : {}),
      };
    }
    const result = applyResourceOperation(item, binding, current, operation);
    if (result.status !== "applied") return result;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          itemResources: {
            ...character.session.itemResources,
            [result.state.instanceId]: result.state,
          },
        },
      },
    });
    flushParentPersistence(get);
    return result;
  },

  applyItemResourceOperations: (entries) => {
    const character = get().character;
    if (get().readonly || !character) return { status: "rejected" };
    for (const entry of entries) {
      const instanceId = entry.binding.instanceId;
      if (typeof instanceId !== "string") return { status: "rejected" };
      const owners = character.character.equipment.filter(
        (ref) => !("custom" in ref) && ref.instanceId === instanceId
      );
      const owner = owners[0];
      if (
        owners.length !== 1 ||
        !owner ||
        "custom" in owner ||
        owner.srdId !== entry.item.itemId ||
        entry.binding.srdId !== entry.item.itemId
      ) {
        return { status: "rejected" };
      }
    }
    const result = simulateItemResourceOperations(
      character.session.itemResources,
      entries
    );
    if (result.status !== "applied") return result;
    set({
      character: {
        ...character,
        session: { ...character.session, itemResources: result.itemResources },
      },
    });
    flushParentPersistence(get);
    return result;
  },

  removeItemResourceInstance: (instanceId) => {
    if (get().readonly || !isValidItemInstanceId(instanceId)) return false;
    const character = get().character;
    if (!character) return false;
    const matches = character.character.equipment.flatMap((ref, index) =>
      !("custom" in ref) && ref.instanceId === instanceId ? [index] : []
    );
    if (matches.length !== 1) return false;
    const removeIndex = matches[0];
    if (removeIndex === undefined) return false;
    const itemResources = omitStateKeys(
      character.session.itemResources,
      new Set([instanceId])
    );
    set({
      character: {
        ...character,
        character: {
          ...character.character,
          equipment: character.character.equipment.filter(
            (_ref, index) => index !== removeIndex
          ),
        },
        session: { ...character.session, itemResources },
      },
    });
    flushParentPersistence(get);
    return true;
  },

  useEquipmentItem: (equipmentKey) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const newEquipment = character.character.equipment
      .map((ref) => {
        const key = "custom" in ref ? `custom-${ref.name}` : ref.srdId;
        if (key !== equipmentKey) return ref;
        return { ...ref, quantity: Math.max(0, (ref.quantity ?? 1) - 1) };
      })
      .filter((ref) => {
        // Remove tracked items that have reached 0
        const key = "custom" in ref ? `custom-${ref.name}` : ref.srdId;
        if (key !== equipmentKey) return true;
        return (ref.quantity ?? 1) > 0;
      });
    set({
      character: {
        ...character,
        character: { ...character.character, equipment: newEquipment },
      },
    });
  },

  adjustEquipmentQuantity: (srdId, delta) => {
    if (get().readonly) return false;
    const { character } = get();
    if (!character) return false;
    // Debit targets the first row with stock; credit targets the first matching
    // row. The row is KEPT at 0 (unlike `useEquipmentItem`'s drop-at-0
    // consumables): an empty quiver stays visible in the inventory — "you're
    // out" is information, and refilling it is a quantity edit, not a re-add.
    const idx = character.character.equipment.findIndex(
      (ref) =>
        !("custom" in ref) &&
        ref.srdId === srdId &&
        (delta > 0 || (ref.quantity ?? 1) > 0)
    );
    if (idx === -1) return false;
    const equipment = [...character.character.equipment];
    const ref = equipment[idx];
    if (!ref || "custom" in ref) return false;
    equipment[idx] = { ...ref, quantity: Math.max(0, (ref.quantity ?? 1) + delta) };
    set({
      character: {
        ...character,
        character: { ...character.character, equipment },
      },
    });
    return true;
  },

  setConcentration: (
    spell,
    opts?: {
      undoable?: boolean;
      castLevel?: number;
      silent?: boolean;
      retractedFormTempHp?: number;
    }
  ) => {
    if (get().readonly) return [];
    const { character } = get();
    if (!character) return [];
    const prev = character.session.concentration;
    // Snapshot the WHOLE prior doc — the clear-case undo target when this
    // concentration change also retracts a Polymorph form (below).
    const before = character;
    // S7 — a Polymorph SELF-form is sustained by its spell's Concentration, so
    // ENDING or SWAPPING that concentration ends the form: restore the caster's own
    // AC/speeds/scores (the `prior` snapshot) + retract the Beast Temp HP + drop the
    // form, all in the SAME `set` (mirrors the while-active retract seam below).
    // Fires only when the dropped spell IS the active form's spell (a swap into a
    // DIFFERENT spell, or a manual clear); `assumePolymorphForm` calls this BEFORE
    // stamping `polymorphForm`, so a self-assume never trips it.
    const form = character.session.polymorphForm;
    const retractForm = form !== undefined && prev === form.spellId && prev !== spell;
    const revertBuild = retractForm ? revertBuildFromPrior(form.prior) : undefined;
    // S1 — when concentration ENDS or SWAPS, the dropped (old) spell's while-active
    // chips (Fly, Haste, Mage Armor…) must clear from `activeFeatures`. Resolved
    // from the dropped spell's STABLE ref (golden rule 7), snapshotting the
    // FULL prior array for an atomic undo (mirrors `advanceEffectTimers`). On a
    // swap we strip ONLY the OLD spell's keys — the NEW spell's chip stays the
    // player's own manual act, mirroring the cast path. [] for a non-buff /
    // homebrew / no-change ref ⇒ activeFeatures untouched.
    const priorActive = character.session.activeFeatures ?? [];
    const droppedActiveKeys =
      prev && prev !== spell
        ? activeKeysForConcentration(character.character, character.session, prev)
        : [];
    const nextActive =
      droppedActiveKeys.length > 0
        ? priorActive.filter((k) => !droppedActiveKeys.includes(k))
        : priorActive;
    const priorActiveSpellCastLevels = character.session.activeSpellCastLevels;
    const droppedActiveKeySet = new Set(droppedActiveKeys);
    const nextActiveSpellCastLevels = droppedActiveKeys.reduce<
      Record<string, number> | undefined
    >((levels, key) => {
      if (!levels || !(key in levels)) return levels;
      const next = Object.fromEntries(
        Object.entries(levels).filter(([entryKey]) => entryKey !== key)
      );
      return Object.keys(next).length > 0 ? next : undefined;
    }, priorActiveSpellCastLevels);
    const priorEffectTimers = character.session.effectTimers;
    const nextEffectTimers = omitStateKeys(priorEffectTimers, droppedActiveKeySet);
    const priorEffectBoundaries = character.session.effectBoundaries;
    const nextEffectBoundaries = omitStateKeys(
      priorEffectBoundaries,
      droppedActiveKeySet
    );
    const priorConcentrationConditions = character.session.concentrationConditions;
    const nextConcentrationConditions =
      prev && prev !== spell ? undefined : priorConcentrationConditions;
    const priorPendingConcentrationSaves = get().combatPendingConcentrationSaves;
    const nextPendingConcentrationSaves =
      prev !== spell ? [] : priorPendingConcentrationSaves;
    const priorLocalEffects = get().combatLegacyActiveEffects;
    const endedLocalEffects =
      prev && prev !== spell
        ? priorLocalEffects.filter(
            (effect) =>
              effect.duration.kind === "concentration" && effect.source.id === prev
          )
        : [];
    const soloPosition = {
      round: get().combatRound,
      currentCombatantId: "self",
      phase: "turn-start" as const,
      order: ["self"],
    };
    const nextLegacyEffects = mergeActiveCombatEffects(
      priorLocalEffects.filter(
        (effect) => !endedLocalEffects.some((ended) => ended.id === effect.id)
      ),
      endedLocalEffects.flatMap((effect) => {
        const successor = endedEffectSuccessor(effect, soloPosition);
        return successor ? [successor] : [];
      })
    );
    const nextLocalEffects = effectiveCombatEffects(
      nextLegacyEffects,
      get().combatEffectOps
    );
    // RAW 2024 (PHB p.235): when you start casting another spell that
    // requires Concentration, your existing concentration ends. We
    // perform the swap silently in the store (the caller already knows
    // they're starting a new concentration spell) but surface a toast so
    // the player isn't blindsided by losing the previous one.
    if (prev && spell && prev !== spell && !opts?.silent) {
      useToastStore.getState().showToast({
        intent: { kind: "concentration-replaced", previous: prev, next: spell },
        duration: 5000,
      });
    }
    // Apply the concentration change (set / swap / clear) + its events-as-data story
    // beats: starting (or swapping into) a concentration spell, or ending one. A pure
    // swap (prev → spell) logs the END of the old + the START of the new. Wrapped so the
    // CLEAR case can run it inside an undo-stack `execute` (redo re-applies it).
    // When the dropped spell is ENGINE-held (an engine cast set it through the
    // world mirror), the same motion ends the world's concentration occurrence
    // through the canonical kernel end machinery — the failed-save, 0-HP-break,
    // manual-stop, and legacy-swap paths all converge here, so no path can
    // leave a world-side zombie whose standings keep buffing the sheet.
    let engineEndActionId: string | null = null;
    const applyChange = (): string[] => {
      set({
        combatActiveEffects: nextLocalEffects,
        combatLegacyActiveEffects: nextLegacyEffects,
        combatPendingConcentrationSaves: nextPendingConcentrationSaves,
        character: {
          ...character,
          // S7 — fold the body-restore patch when the form is retracted.
          ...(revertBuild
            ? { character: { ...character.character, ...revertBuild } }
            : {}),
          session: {
            ...character.session,
            concentration: spell,
            concentrationCastLevel:
              spell && opts?.castLevel && opts.castLevel > 0
                ? Math.round(opts.castLevel)
                : undefined,
            activeFeatures: nextActive,
            activeSpellCastLevels: nextActiveSpellCastLevels,
            effectTimers: nextEffectTimers,
            effectBoundaries: nextEffectBoundaries,
            concentrationConditions: nextConcentrationConditions,
            // S7 — drop the form + retract the Beast Temp HP to the caster's own.
            ...(retractForm
              ? {
                  polymorphForm: undefined,
                  hp: {
                    ...character.session.hp,
                    temp: opts?.retractedFormTempHp ?? form.prior.tempHp,
                  },
                }
              : {}),
          },
        },
      });
      // The engine twin of the teardown (fresh read: it composes ONTO the doc
      // the set above just wrote, so the legacy field changes are never lost).
      if (prev && prev !== spell) {
        engineEndActionId = endEngineConcentrationWorld(get, prev) ?? engineEndActionId;
      }
      persistCombat(get);
      flushParentPersistence(get);
      if (opts?.silent) return [];
      const loggedIds: string[] = [];
      if (prev && prev !== spell) {
        const id = get().logEvent({ kind: "concentration-end", spell: prev });
        if (id) loggedIds.push(id);
      }
      if (spell && spell !== prev) {
        const id = get().logEvent({ kind: "concentration-start", spell });
        if (id) loggedIds.push(id);
      }
      return loggedIds;
    };
    // CLEARING concentration (empty spell) is destructive — a mis-tap silently ends an
    // in-combat spell. Route it onto the session undo stack (mirrors the tracker/HP/cast
    // pattern) so every caller — rail, combat, mobile drawer — inherits recovery + redo
    // for free, generalising the undo contract to ALL destructive actions.
    if (prev && !spell && opts?.undoable !== false && !opts?.silent) {
      let loggedIds: string[] = [];
      registerUndoableToast(
        { intent: { kind: "stopped-concentrating", spell: prev } },
        () => {
          loggedIds = applyChange();
          return () => {
            // Reverse the ENGINE end first (the exact journal reverse restores
            // the world occurrence and re-mirrors the spell), so the legacy
            // field restores below compose onto the already-restored world.
            if (engineEndActionId !== null) {
              undoEngineConcentrationEnd(get, engineEndActionId);
            }
            const cur = get().character;
            if (!cur) return;
            // When clearing also retracted a Polymorph form, the whole prior doc
            // (Beast build + Temp HP + form) is the atomic undo target — a partial
            // concentration-only restore would leave the reverted body behind.
            if (retractForm) {
              set({
                character: before,
                combatActiveEffects: effectiveCombatEffects(
                  priorLocalEffects,
                  get().combatEffectOps
                ),
                combatLegacyActiveEffects: priorLocalEffects,
                combatPendingConcentrationSaves: priorPendingConcentrationSaves,
              });
              persistCombat(get);
              flushParentPersistence(get);
              return;
            }
            set({
              combatActiveEffects: effectiveCombatEffects(
                priorLocalEffects,
                get().combatEffectOps
              ),
              combatLegacyActiveEffects: priorLocalEffects,
              combatPendingConcentrationSaves: priorPendingConcentrationSaves,
              character: {
                ...cur,
                session: {
                  ...cur.session,
                  concentration: prev,
                  concentrationCastLevel: character.session.concentrationCastLevel,
                  // Restore the EXACT prior active toggles alongside concentration,
                  // so the chip re-lights atomically with the spell (mirrors the
                  // cast-undo + `advanceEffectTimers` revert).
                  activeFeatures: priorActive,
                  activeSpellCastLevels: priorActiveSpellCastLevels,
                  effectTimers: priorEffectTimers,
                  effectBoundaries: priorEffectBoundaries,
                  concentrationConditions: priorConcentrationConditions,
                },
              },
            });
            persistCombat(get);
            flushParentPersistence(get);
          };
        },
        { turnScoped: false }
      );
      return loggedIds;
    } else {
      return applyChange();
    }
  },

  addCondition: (condition, opts) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    if (character.session.conditions.includes(condition)) return;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          conditions: [...character.session.conditions, condition],
        },
      },
    });
    // Events-as-data: a gained condition is a story beat (the condition id is
    // stable; the presenter resolves its localized name).
    get().logEvent({ kind: "condition-gain", conditionId: condition });
    // RA-06 — SRD 5.2.1 "Concentration": Concentration ends when you gain the
    // Incapacitated condition (the Incapacitated family: Incapacitated / Stunned /
    // Paralyzed / Petrified / Unconscious). If this new condition breaks
    // concentration and one is held, drop it through the EXISTING
    // `setConcentration("")` beat — which registers the standard undoable toast
    // (the reversal contract: undo restores the spell AND its while-active chips),
    // so a mis-tapped condition is recoverable. Runs AFTER the condition is set so
    // `setConcentration` reads the post-add character. A condition with no held
    // concentration, or a non-incapacitating one, drops nothing.
    if (
      conditionBreaksConcentration(condition) &&
      get().character?.session.concentration
    ) {
      get().setConcentration("", {
        undoable: opts?.registerConcentrationUndo !== false,
      });
    }
    // Active states use the same data-owned immediate-drop vocabulary. The
    // Incapacitated family ends Rage (and any future state declaring the same
    // trigger) at the condition mutation seam — never in a feature-id branch.
    if (conditionBreaksConcentration(condition)) {
      const current = get().character;
      if (current) {
        for (const key of resolveActiveStatesEndingOn(current, "incapacitated")) {
          get().setActiveFeature(key, false);
        }
      }
    }
    // Persist the whole resulting combat state (offline-safe).
    persistCombat(get);
  },

  applyHiddenState: (findDc) => {
    if (get().readonly) return null;
    const { character } = get();
    if (!character) return null;
    const prevConditions = character.session.conditions;
    const prevHiddenDc = character.session.hiddenDc;
    const alreadyInvisible = prevConditions.includes("invisible");
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          conditions: alreadyInvisible
            ? prevConditions
            : [...prevConditions, "invisible"],
          hiddenDc: findDc,
        },
      },
    });
    // One story beat for the gained condition (skipped when re-hiding while
    // already Invisible — only the find-DC moved, no new state).
    const gainLogId = alreadyInvisible
      ? null
      : get().logEvent({ kind: "condition-gain", conditionId: "invisible" });
    persistCombat(get);
    return () => {
      const cur = get().character;
      if (!cur) return;
      set({
        character: {
          ...cur,
          session: {
            ...cur.session,
            conditions: prevConditions,
            hiddenDc: prevHiddenDc,
          },
        },
      });
      if (gainLogId != null) get().removeLogEntry(gainLogId);
      persistCombat(get);
    };
  },

  removeConditionSilent: (condition) => {
    if (get().readonly) return null;
    const { character } = get();
    if (!character) return null;
    if (!effectiveSessionConditions(character.session).includes(condition)) return null;
    const prevConditions = character.session.conditions;
    const prevConcentrationConditions = character.session.concentrationConditions;
    const prevLocalEffects = get().combatLegacyActiveEffects;
    const nextLegacyEffects = prevLocalEffects.filter(
      (effect) =>
        effect.payload.kind !== "condition" || effect.payload.conditionId !== condition
    );
    const nextLocalEffects = effectiveCombatEffects(
      nextLegacyEffects,
      get().combatEffectOps
    );
    // RA-12 — dropping Invisible ends the hidden state: the remembered find-DC
    // goes with it (and comes back on undo).
    const prevHiddenDc = character.session.hiddenDc;
    const clearsHiddenDc = condition === "invisible" && prevHiddenDc !== undefined;
    set({
      combatActiveEffects: nextLocalEffects,
      combatLegacyActiveEffects: nextLegacyEffects,
      character: {
        ...character,
        session: {
          ...character.session,
          conditions: prevConditions.filter((c) => c !== condition),
          concentrationConditions: prevConcentrationConditions?.filter(
            (id) => id !== condition
          ),
          ...(clearsHiddenDc ? { hiddenDc: undefined } : {}),
        },
      },
    });
    // Events-as-data: a lost condition is a story beat. Capture the id so the
    // reverse removes EXACTLY this line (a mis-tapped removal restores both the
    // condition AND the log).
    const lossLogId = get().logEvent({
      kind: "condition-loss",
      conditionId: condition,
    });
    // Persist the whole resulting combat state (offline-safe).
    persistCombat(get);
    flushParentPersistence(get);
    return () => {
      const cur = get().character;
      if (!cur) return;
      set({
        combatActiveEffects: effectiveCombatEffects(
          prevLocalEffects,
          get().combatEffectOps
        ),
        combatLegacyActiveEffects: prevLocalEffects,
        character: {
          ...cur,
          session: {
            ...cur.session,
            conditions: prevConditions,
            concentrationConditions: prevConcentrationConditions,
            ...(clearsHiddenDc ? { hiddenDc: prevHiddenDc } : {}),
          },
        },
      });
      get().removeLogEntry(lossLogId);
      // Re-persist the restored trio so the subdoc converges with the undo.
      persistCombat(get);
      flushParentPersistence(get);
    };
  },

  removeCondition: (condition) => {
    // Immediate-commit WITH 5s undo, routed onto the session undo stack — removing
    // a condition is destructive (a mis-tap wipes a high-stakes state with no
    // recovery). The store emits the condition ID only; the view resolves its
    // localized name (toasts-as-data, §3.2). The drop runs INSIDE `execute`
    // (`removeConditionSilent`) so redo re-applies it; when nothing is removed
    // (absent / read-only) the silent core returns null → registerUndoableToast
    // bails with no toast, exactly like the old presence + readonly guards.
    registerUndoableToast(
      { intent: { kind: "condition-removed", conditionId: condition } },
      () => get().removeConditionSilent(condition),
      { turnScoped: false }
    );
  },

  restoreHpSnapshot: (snap) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          hp: { ...character.session.hp, current: snap.current, temp: snap.temp },
          deathSucc: snap.deathSucc,
          deathFail: snap.deathFail,
          conditions: snap.conditions,
        },
      },
    });
    persistCombat(get);
  },

  setDeathSaves: (successes, failures) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const succ = Math.max(0, Math.min(3, Math.round(successes)));
    const fail = Math.max(0, Math.min(3, Math.round(failures)));
    const prevSucc = character.session.deathSucc;
    const prevFail = character.session.deathFail;
    if (succ === prevSucc && fail === prevFail) return;
    set({
      character: {
        ...character,
        session: { ...character.session, deathSucc: succ, deathFail: fail },
      },
    });
    // Events-as-data: log ONLY when a NEW mark was added (a count rose) — clearing
    // a pip or resetting the track is bookkeeping, not a story beat.
    if (succ > prevSucc || fail > prevFail) {
      get().logEvent({
        kind: "death-save",
        outcome: succ > prevSucc ? "success" : "failure",
        successes: succ,
        failures: fail,
      });
    }
    // Persist the whole resulting combat state (offline-safe, whole-object LWW).
    persistCombat(get);
  },

  commitDeathSave: (faces) => {
    if (get().readonly) return null;
    const live = get().character;
    if (
      !live ||
      live.session.hp.current !== 0 ||
      !isCharacterAlive(live.status, live.session) ||
      stabilisedInPlay(live.session)
    ) {
      return null;
    }
    const before = captureD20Command(get());
    if (!before) return null;
    let result: CharacterEnteredD20Result;
    try {
      // The builder reads the live aggregate here, at the mutation boundary:
      // all-save bonuses, Exhaustion, threshold, and net roll mode cannot stale.
      result = resolveCharacterDeathSave(live, faces);
    } catch {
      return null;
    }
    const outcome = result.reviewedOutcome.deathSave;
    if (!outcome) return null;
    if (outcome.hitPointsRegained > 0) {
      get().applyHealing(outcome.hitPointsRegained);
    } else {
      get().setDeathSaves(
        Math.min(DEATH_SUCCESS_LIMIT, live.session.deathSucc + outcome.successes),
        Math.min(DEATH_FAIL_LIMIT, live.session.deathFail + outcome.failures)
      );
    }
    const after = captureD20Command(get());
    if (!after) return null;
    return {
      result,
      undo: causalD20CommandUndo(before, after, get),
    };
  },

  commitPendingConcentrationSave: (pending, faces) => {
    if (get().readonly) return null;
    const live = get().character;
    const head = get().combatPendingConcentrationSaves[0];
    if (
      !live ||
      !head ||
      head.id !== pending.id ||
      head.spell !== pending.spell ||
      head.damage !== pending.damage ||
      head.difficultyClass !== pending.difficultyClass ||
      live.session.hp.current <= 0 ||
      !isCharacterAlive(live.status, live.session) ||
      live.session.concentration !== pending.spell
    ) {
      return null;
    }
    const before = captureD20Command(get());
    if (!before) return null;
    let result: CharacterEnteredD20Result;
    try {
      result = resolveCharacterConcentrationSave(live, pending, faces);
    } catch {
      return null;
    }
    if (result.reviewedOutcome.status === "success") {
      set({
        combatPendingConcentrationSaves: get().combatPendingConcentrationSaves.slice(1),
      });
      persistCombat(get);
    } else if (result.reviewedOutcome.status === "failure") {
      // The authoritative teardown owns the spell, active keys, timers,
      // Polymorph body, target conditions, effects, event log, and queue clear.
      get().setConcentration("", { undoable: false });
    } else {
      return null;
    }
    const after = captureD20Command(get());
    if (!after) return null;
    return {
      result,
      undo: causalD20CommandUndo(before, after, get),
    };
  },

  queueConcentrationSaveForDamage: (damage) => {
    if (get().readonly || !Number.isSafeInteger(damage) || damage <= 0) return;
    const { character } = get();
    const concentrating = character?.session.concentration ?? "";
    if (!character || concentrating === "") return;
    // 2024 RAW: dropping to 0 HP breaks Concentration outright — no save. The
    // authoritative teardown owns the spell, active keys, timers, target
    // conditions, effects, event log, and the pending-save queue clear.
    if (character.session.hp.current === 0) {
      get().setConcentration("", { undoable: false });
      useToastStore.getState().showToast({
        intent: { kind: "concentration-dropped", spell: concentrating },
        duration: 5000,
      });
      return;
    }
    const dc = concentrationSaveDc(damage);
    const pending: PendingConcentrationSave = {
      id: crypto.randomUUID(),
      spell: concentrating,
      damage,
      difficultyClass: dc,
    };
    set({
      combatPendingConcentrationSaves: [
        ...get().combatPendingConcentrationSaves,
        pending,
      ],
    });
    // The same durable prompt + short notice the legacy damage seam surfaces
    // (one semantic unit, one intent — the banner carries the entered roll).
    const context = concentrationSaveD20Context(character, pending);
    const saveBonus = context.modifierTerms.reduce((sum, term) => sum + term.value, 0);
    const advantage =
      context.advantageSourceIds.length > 0 && context.disadvantageSourceIds.length === 0;
    useToastStore.getState().showToast({
      intent: {
        kind: "concentration-save",
        spell: concentrating,
        dc,
        saveBonus,
        advantage,
      },
      duration: 5000,
    });
    persistCombat(get);
  },

  persistInitiative: () => {
    if (get().readonly) return;
    const { character, combatPersistence } = get();
    if (!character || !combatPersistence) return;
    // `session.initiative` is the SOLO raw d20 ROLL (never the total).
    persistCombat(get);
  },

  persistCombatRound: (round) => {
    if (get().readonly) return;
    if (!get().character) return;
    // Mirror the new round onto `combatRound` UNCONDITIONALLY (even with no injected
    // persistence): it is the in-store round the reconcile path reads, so a subsequent
    // `[character]` resync sees the advanced round and never clobbers it back. The durable
    // write then rides `persistCombat` (a no-op `?.write` when there is no persistence).
    set({ combatRound: round });
    persistCombat(get);
  },

  persistCombatTurnState: (round, turnEconomy) => {
    if (get().readonly || !get().character) return;
    set({ combatRound: round, combatTurnEconomy: turnEconomy });
    // A marked play owner is already coalesced as one complete child write; keep the
    // update-only patch solely for legacy documents whose noncombat session remains
    // parent-owned.
    if (get().character?.playStateVersion === 1) persistCombat(get);
    else get().combatPersistence?.writeTurnEconomy(round, turnEconomy);
  },

  declareAttack: (entry) => {
    if (get().readonly) return;
    const character = get().character;
    if (!character) return;
    // Append to the ring (id stamped by the pure reducer) and mirror it in-store so the
    // whole-object combat write carries it; the durable write rides `persistCombat` (a
    // no-op when there is no injected persistence — dev/bypass optimistic-only).
    const base = sessionToCombatState(
      character.session,
      get().combatRound,
      get().combatRecentActions,
      get().combatAppliedEncounterEffects,
      get().combatTurnEconomy,
      get().combatLegacyActiveEffects,
      get().combatPendingConcentrationSaves,
      undefined,
      get().combatEffectOps,
      {
        actionRevision: get().combatActionRevision,
        actionHead: get().combatActionHead,
        actionLifecycles: get().combatActionLifecycles,
      }
    );
    set({ combatRecentActions: pushRecentAttack(base, entry).recentActions });
    persistCombat(get);
  },

  // COMBAT-DUP — dedicated setRound / setInitiative remain absent on this
  // store; round + initiative live in `combatStore` (in-memory). The Combat
  // page now (1) hydrates the combat store from the `combat/state` subdoc's round +
  // the reconciled `session.initiative` on mount and (2) persists changes back via
  // `persistCombatRound` / `persistInitiative`. So those live values ARE used — they
  // just don't need a parallel mutator here.

  addSessionDefense: (kind, id) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const current = character.session.sessionDefenses?.[kind] ?? [];
    if (current.includes(id)) return;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          sessionDefenses: {
            ...character.session.sessionDefenses,
            [kind]: [...current, id],
          },
        },
      },
    });
  },

  removeSessionDefense: (kind, id) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const prev = character.session.sessionDefenses;
    const current = prev?.[kind] ?? [];
    if (!current.includes(id)) return;
    // Immediate-commit WITH 5s undo (mirrors removeCondition), now routed onto the
    // session undo stack: a mis-tap would silently drop an active magical protection.
    // The store emits stable ids only; the view localizes (toasts-as-data, §3.2). The
    // removal runs INSIDE `execute` so redo re-applies it; the reverse restores the
    // exact prior session-defense map.
    registerUndoableToast(
      { intent: { kind: "defense-removed", defenseKind: kind, defenseId: id } },
      () => {
        set({
          character: {
            ...character,
            session: {
              ...character.session,
              sessionDefenses: { ...prev, [kind]: current.filter((d) => d !== id) },
            },
          },
        });
        return () => {
          const cur = get().character;
          if (!cur) return;
          set({
            character: {
              ...cur,
              session: { ...cur.session, sessionDefenses: prev },
            },
          });
        };
      },
      { turnScoped: false }
    );
  },

  longRest: () => {
    if (get().readonly) return;
    const beforeRest = get().character;
    if (!beforeRest || !canCharacterRest(beforeRest.status, beforeRest.session)) return;
    // Sleep ends Concentration. Route through the ONE concentration teardown so
    // its active grants, cast-level provenance, target conditions, and a possible
    // self-Polymorph form are retracted atomically before the rest baseline is
    // rebuilt. Silent + non-undoable because the rest itself is the undo fence.
    if (get().character?.session.concentration) {
      get().setConcentration("", { undoable: false, silent: true });
    }
    const { character } = get();
    if (!character) return;
    // D1 — a Long Rest restores HP to the EFFECTIVE max (stored base + hp-flat boons
    // + any standing Aid), so an Aided / Draconic / Boon character wakes at full.
    const max = effectiveMaxHp(character.character, character.session);
    // RA-01 — 2024 RAW (SRD 5.2.1 Rules Glossary "Long Rest"): a Long Rest
    // restores HP, ends 1 level of Exhaustion, and regains ALL spent Hit Point
    // Dice ("you regain all lost Hit Points and all spent Hit Point Dice"). The
    // 2014 half-rule (`max(1, floor(level/2))`) is GONE. It does NOT automatically
    // clear every condition — Petrified / Diseased / persistent effects can
    // outlast a rest. Conditions are left alone here; players remove them
    // manually as the underlying cause resolves. Death saves DO reset.
    //
    // Bug fix (2026-05-28): hit-dice regain was previously missing entirely.
    // RA-01 (2026-07-11): switched from the 2014 half-rule to the 2024 all-dice
    // rule. Regression tests in character-store-rest.test.ts.
    const newHitDiceUsed = 0;
    // Exhaustion removed on a Long Rest = 1 + any `exhaustion-recovery` grant
    // (Monk Self-Restoration removes 2 instead of 1).
    const exhaustionRemoved =
      1 +
      evaluateGrants(
        resolveAllGrantSources(character.character, character.session.itemResources)
      ).exhaustionRecoveryBonus;
    // Magic-item charges with `recovery: "long-rest"` (and "dawn") restore to
    // max through the ONE shared law (`equipmentAfterLongRest`, smart-tracker),
    // the same map the canonical rest boundary applies, so the engine path and
    // this fail-closed degradation can never drift.
    const newEquipment = equipmentAfterLongRest(character.character.equipment);
    // S4 — Human's Resourceful: finishing a Long Rest auto-grants Heroic
    // Inspiration. The consumer (`gainsHeroicInspirationOnLongRest`) decides the
    // default only; override-first — the player can still toggle the chip off
    // afterward (a Long Rest never CLEARS an existing Inspiration either).
    const gainsInspiration =
      gainsHeroicInspirationOnLongRest(character) || character.session.inspiration;
    // A `manual` tracker represents a table/clock/die outcome the app cannot
    // infer (Wings of Flying's 1d12-hour cooldown, homebrew counters). A Long
    // Rest recovers every rest-based resource, but must not fabricate that
    // external event. Preserve only those spent entries; missing stays the
    // canonical zero-used state for every recoverable tracker.
    const recoveryByTracker = new Map(
      resolveTrackers(character).map((tracker) => [tracker.id, tracker] as const)
    );
    const trackers: typeof character.session.trackers = {};
    for (const [id, spent] of Object.entries(character.session.trackers)) {
      const tracker = recoveryByTracker.get(id);
      if (tracker?.recovery === "manual" || tracker?.autoRecover === false) {
        trackers[id] = spent;
        continue;
      }
      if (tracker?.longRestRecovery !== undefined) {
        const used = Math.max(0, spent.used - tracker.longRestRecovery);
        if (used > 0) trackers[id] = { used };
      }
    }
    const endedActiveKeys = new Set(resolveActiveStatesEndingOnRest(character, "long"));
    set({
      combatPendingConcentrationSaves: [],
      character: {
        ...character,
        character: { ...character.character, equipment: newEquipment },
        session: {
          ...character.session,
          hp: { current: max, temp: 0 },
          hitDice: { used: newHitDiceUsed },
          spellSlots: {},
          trackers,
          concentration: "",
          concentrationCastLevel: undefined,
          concentrationConditions: undefined,
          activeFeatures: (character.session.activeFeatures ?? []).filter(
            (key) => !endedActiveKeys.has(key)
          ),
          activeSpellCastLevels: omitStateKeys(
            character.session.activeSpellCastLevels,
            endedActiveKeys
          ),
          effectTimers: omitStateKeys(character.session.effectTimers, endedActiveKeys),
          effectBoundaries: omitStateKeys(
            character.session.effectBoundaries,
            endedActiveKeys
          ),
          exhaustion: Math.max(0, character.session.exhaustion - exhaustionRemoved),
          inspiration: gainsInspiration,
          // A Bardic Inspiration die lasts at most 1 hour; a Long Rest always
          // outlasts it, so the combat-state SSOT clears deterministically.
          bardicInspirationDie: "",
          deathSucc: 0,
          deathFail: 0,
        },
      },
    });
    // Events-as-data: a Long Rest is a story beat (the log survives the rest —
    // `logEntries` is untouched above). Logged AFTER the set so it lands on the
    // post-rest character.
    get().logEvent({ kind: "rest", restKind: "long" });
    // Wholesale trio replacement (HP → full, death saves → 0): persist the whole
    // resulting combat state (offline-safe, last-write-wins).
    persistCombat(get);
    // Undo-stack FENCE (§5.4 case 9): a rest rewrites the whole resource baseline
    // (slots/trackers/HP/death saves), so a pre-rest reverse-applier would restore a
    // stale spend against the new baseline. Drop the stack (dismissing its toasts).
    useUndoStore.getState().clear();
  },

  shortRest: () => {
    if (get().readonly) return;
    const beforeRest = get().character;
    if (!beforeRest || !canCharacterRest(beforeRest.status, beforeRest.session)) return;
    const initiallyEndedKeys = new Set(
      resolveActiveStatesEndingOnRest(beforeRest, "short")
    );
    const concentrationKeys = beforeRest.session.concentration
      ? activeKeysForConcentration(
          beforeRest.character,
          beforeRest.session,
          beforeRest.session.concentration
        )
      : [];
    if (concentrationKeys.some((key) => initiallyEndedKeys.has(key))) {
      get().setConcentration("", { undoable: false, silent: true });
    }
    const { character } = get();
    if (!character) return;

    // Determine which trackers recover on short rest and by how much
    const recoveries = getShortRestRecoveries(character);
    const oldTrackers = character.session.trackers;

    // Build new trackers object without mutation or dynamic delete
    const newTrackers: typeof oldTrackers = {};
    for (const [key, data] of Object.entries(oldTrackers)) {
      const recovery = recoveries.get(key);
      if (recovery === "all") {
        // Full recovery: omit the entry (missing === used:0)
      } else if (typeof recovery === "number") {
        // Partial recovery: reduce used by N
        const newUsed = Math.max(0, data.used - recovery);
        if (newUsed > 0) newTrackers[key] = { used: newUsed };
        // else: omit (used:0)
      } else {
        // No short-rest recovery: keep as-is
        newTrackers[key] = data;
      }
    }

    // Pact Magic slots recover on a short rest — and ONLY them. Pact slots now key
    // distinctly (`pact-<level>` via {@link slotUsageKey}), so a Short Rest restores
    // them WITHOUT touching the normal/shared pool (the B3 collision previously
    // forced a wipe of EVERY slot whenever any pact slot existed — a Sorlock's
    // normal slots came back for free on a short rest).
    const newSpellSlots = Object.fromEntries(
      Object.entries(character.session.spellSlots).filter(
        ([key]) => !key.startsWith("pact-")
      )
    );

    // S4 — Ranger's Tireless: a Short Rest reduces Exhaustion by 1 (any source
    // carrying a `recovery: "short-rest"` exhaustion grant). `applyShortRestExhaustion`
    // returns the post-rest level (current minus the recovery, floored at 0); a
    // character without the grant is unchanged.
    const newExhaustion = applyShortRestExhaustion(character);
    const endedActiveKeys = new Set(resolveActiveStatesEndingOnRest(character, "short"));

    // RAW 2024 (PHB p.235): concentration ends only on
    //   • casting another concentration spell
    //   • failing a CON save after damage
    //   • being incapacitated
    //   • dying
    // A Short Rest is light activity while awake — none of those triggers
    // fire automatically, so concentration MUST persist. (Long Rest is
    // different: sleep = incapacitated → concentration drops; that path
    // already clears it in longRest above.) Previously this branch unset
    // session.concentration which silently broke active concentration
    // spells whose duration outlasts an hour (Find Familiar, Hex,
    // Tiny Hut, etc.).
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          trackers: newTrackers,
          spellSlots: newSpellSlots,
          exhaustion: newExhaustion,
          activeFeatures: (character.session.activeFeatures ?? []).filter(
            (key) => !endedActiveKeys.has(key)
          ),
          activeSpellCastLevels: omitStateKeys(
            character.session.activeSpellCastLevels,
            endedActiveKeys
          ),
          effectTimers: omitStateKeys(character.session.effectTimers, endedActiveKeys),
          effectBoundaries: omitStateKeys(
            character.session.effectBoundaries,
            endedActiveKeys
          ),
          // A Short Rest lasts 1 hour, exhausting the held die's maximum duration.
          bardicInspirationDie: "",
        },
      },
    });
    // Events-as-data: a Short Rest is a story beat.
    get().logEvent({ kind: "rest", restKind: "short" });
    persistCombat(get);
    // Undo-stack FENCE (§5.4 case 9): a rest rewrites the resource baseline (pact
    // slots + short-rest trackers + exhaustion), so a pre-rest reverse-applier would
    // restore a stale spend against the new baseline. Drop the stack.
    useUndoStore.getState().clear();
  },

  togglePinnedAction: (actionId, defaultPinned = false) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;

    if (defaultPinned) {
      // Default-pinned item (e.g. weapon): toggle in unpinnedActions blacklist
      const unpinned = character.session.unpinnedActions ?? [];
      const newUnpinned = unpinned.includes(actionId)
        ? unpinned.filter((id) => id !== actionId)
        : [...unpinned, actionId];
      set({
        character: {
          ...character,
          session: { ...character.session, unpinnedActions: newUnpinned },
        },
      });
    } else {
      // Default-unpinned item (spell/feature): toggle in pinnedActions whitelist
      const pinned = character.session.pinnedActions;
      const newPinned = pinned.includes(actionId)
        ? pinned.filter((id) => id !== actionId)
        : [...pinned, actionId];
      set({
        character: {
          ...character,
          session: { ...character.session, pinnedActions: newPinned },
        },
      });
    }
  },

  toggleActiveFeature: (key) => {
    const active = get().character?.session.activeFeatures ?? [];
    get().setActiveFeature(key, !active.includes(key));
  },

  setActiveFeature: (key, isActive) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const active = character.session.activeFeatures ?? [];
    if (active.includes(key) === isActive) return;
    const next = isActive ? [...active, key] : active.filter((k) => k !== key);
    const levels = isActive
      ? character.session.activeSpellCastLevels
      : Object.fromEntries(
          Object.entries(character.session.activeSpellCastLevels ?? {}).filter(
            ([entryKey]) => entryKey !== key
          )
        );
    const previousTimers = character.session.effectTimers ?? {};
    const timers = Object.fromEntries(
      Object.entries(previousTimers).filter(([timerKey]) => timerKey !== key)
    );
    const boundaries = Object.fromEntries(
      Object.entries(character.session.effectBoundaries ?? {}).filter(
        ([boundaryKey]) => boundaryKey !== key
      )
    );
    let updated: CharacterDoc = {
      ...character,
      session: {
        ...character.session,
        activeFeatures: next,
        activeSpellCastLevels:
          levels && Object.keys(levels).length > 0 ? levels : undefined,
        effectTimers: Object.keys(timers).length > 0 ? timers : undefined,
        effectBoundaries: Object.keys(boundaries).length > 0 ? boundaries : undefined,
      },
    };
    if (isActive) {
      const timed = resolveActiveTimedEffects(updated).find(
        (effect) => effect.activeKey === key
      );
      if (timed) {
        updated = {
          ...updated,
          session: {
            ...updated.session,
            effectTimers: {
              ...(updated.session.effectTimers ?? {}),
              [key]: { roundsLeft: timed.maxRounds },
            },
          },
        };
      }
    }
    set({ character: updated });
  },

  setActiveSpellCastLevel: (key, level) => {
    if (get().readonly) return;
    const character = get().character;
    if (!character) return;
    const previous = character.session.activeSpellCastLevels ?? {};
    const levels =
      level !== undefined && Number.isFinite(level) && level > 0
        ? { ...previous, [key]: Math.round(level) }
        : Object.fromEntries(
            Object.entries(previous).filter(([entryKey]) => entryKey !== key)
          );
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          activeSpellCastLevels: Object.keys(levels).length > 0 ? levels : undefined,
        },
      },
    });
  },

  recoverPerTurnTrackers: () => {
    if (get().readonly) return null;
    const character = get().character;
    if (!character) return null;
    const ids = resolvePerTurnRecoveryTrackerIds(character);
    if (ids.length === 0) return null;
    // Snapshot the prior entries for undo, then drop each (missing === used: 0,
    // the canonical "unspent" state — same convention `restoreTrackerEntry` uses).
    const prior = new Map<string, { used: number } | undefined>();
    let trackers = character.session.trackers;
    for (const id of ids) {
      prior.set(id, character.session.trackers[id]);
      trackers = restoreTrackerEntry(trackers, id, undefined);
    }
    set({
      character: {
        ...character,
        session: { ...character.session, trackers },
      },
    });
    return () => {
      const cur = get().character;
      if (!cur) return;
      let reverted = cur.session.trackers;
      for (const [id, prev] of prior) {
        reverted = restoreTrackerEntry(reverted, id, prev);
      }
      set({
        character: {
          ...cur,
          session: { ...cur.session, trackers: reverted },
        },
      });
    };
  },

  armEffectTimer: (key: string, rounds: number) => {
    if (get().readonly) return null;
    const character = get().character;
    if (!character) return null;
    if (!Number.isFinite(rounds) || rounds <= 0) return null;
    const previousTimer = character.session.effectTimers?.[key];
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          effectTimers: {
            ...(character.session.effectTimers ?? {}),
            [key]: { roundsLeft: rounds },
          },
        },
      },
    });
    // Restore only this key so undo cannot overwrite another effect started in
    // the meantime.
    return () => {
      const cur = get().character;
      if (!cur) return;
      const timers = previousTimer
        ? { ...(cur.session.effectTimers ?? {}), [key]: previousTimer }
        : Object.fromEntries(
            Object.entries(cur.session.effectTimers ?? {}).filter(
              ([timerKey]) => timerKey !== key
            )
          );
      set({
        character: {
          ...cur,
          session: {
            ...cur.session,
            effectTimers: Object.keys(timers).length > 0 ? timers : undefined,
          },
        },
      });
    };
  },

  armEffectBoundary: (key, boundary) => {
    if (get().readonly) return null;
    const character = get().character;
    if (!character || !Number.isFinite(boundary.round) || boundary.round < 1) return null;
    const previous = character.session.effectBoundaries?.[key];
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          effectBoundaries: {
            ...(character.session.effectBoundaries ?? {}),
            [key]: { round: Math.round(boundary.round), phase: boundary.phase },
          },
        },
      },
    });
    return () => {
      const current = get().character;
      if (!current) return;
      const boundaries = previous
        ? { ...(current.session.effectBoundaries ?? {}), [key]: previous }
        : Object.fromEntries(
            Object.entries(current.session.effectBoundaries ?? {}).filter(
              ([boundaryKey]) => boundaryKey !== key
            )
          );
      set({
        character: {
          ...current,
          session: {
            ...current.session,
            effectBoundaries: Object.keys(boundaries).length > 0 ? boundaries : undefined,
          },
        },
      });
    };
  },

  expireEffectBoundaries: (position) => {
    const noop = { expired: [] as ReadonlyArray<never>, restore: () => {} };
    if (get().readonly) return noop;
    const character = get().character;
    if (!character) return noop;
    const priorBoundaries = character.session.effectBoundaries;
    const priorLocalEffects = get().combatLegacyActiveEffects;
    const localPosition = {
      ...position,
      currentCombatantId: "self",
      order: ["self"],
    };
    const expiredLocalEffects = priorLocalEffects.filter(
      (effect) => !isEffectActiveAtEncounterPosition(effect, localPosition)
    );
    const survivingLocalEffects = priorLocalEffects.filter((effect) =>
      isEffectActiveAtEncounterPosition(effect, localPosition)
    );
    const nextLegacyEffects = mergeActiveCombatEffects(
      survivingLocalEffects,
      expiredLocalEffects.flatMap((effect) => {
        const successor = endedEffectSuccessor(effect, localPosition);
        return successor ? [successor] : [];
      })
    );
    const nextLocalEffects = effectiveCombatEffects(
      nextLegacyEffects,
      get().combatEffectOps
    );
    const sources = new Map(
      resolveActiveBoundaryEffects(character).map((effect) => [
        effect.activeKey,
        effect.sourceId,
      ])
    );
    const phaseIndex = position.phase === "turn-start" ? 0 : 1;
    const expired = Object.entries(priorBoundaries ?? {}).flatMap(
      ([activeKey, boundary]) =>
        position.round > boundary.round ||
        (position.round === boundary.round &&
          phaseIndex >= (boundary.phase === "turn-start" ? 0 : 1))
          ? [{ activeKey, sourceId: sources.get(activeKey) ?? activeKey }]
          : []
    );
    if (expired.length === 0 && expiredLocalEffects.length === 0) return noop;
    const expiredKeys = new Set(expired.map((effect) => effect.activeKey));
    const priorActive = character.session.activeFeatures ?? [];
    const priorCastLevels = character.session.activeSpellCastLevels;
    const priorConcentration = character.session.concentration;
    const priorConcentrationCastLevel = character.session.concentrationCastLevel;
    const priorConcentrationConditions = character.session.concentrationConditions;
    const concentrationActiveKeys = new Set(
      activeKeysForConcentration(
        character.character,
        character.session,
        priorConcentration
      )
    );
    const concentrationExpired =
      priorConcentration !== "" &&
      expired.some((effect) => concentrationActiveKeys.has(effect.activeKey));
    const boundaries = Object.fromEntries(
      Object.entries(priorBoundaries ?? {}).filter(([key]) => !expiredKeys.has(key))
    );
    const activeFeatures = priorActive.filter((key) => !expiredKeys.has(key));
    const castLevels = Object.fromEntries(
      Object.entries(priorCastLevels ?? {}).filter(([key]) => !expiredKeys.has(key))
    );
    set({
      combatActiveEffects: nextLocalEffects,
      combatLegacyActiveEffects: nextLegacyEffects,
      character: {
        ...character,
        session: {
          ...character.session,
          activeFeatures,
          activeSpellCastLevels:
            Object.keys(castLevels).length > 0 ? castLevels : undefined,
          effectBoundaries: Object.keys(boundaries).length > 0 ? boundaries : undefined,
        },
      },
    });
    const concentrationLogIds = concentrationExpired
      ? get().setConcentration("", { undoable: false })
      : [];
    const logIds = expired.map((effect) =>
      get().logEvent({ kind: "effect-expired", sourceId: effect.sourceId })
    );
    const localLogIds = expiredLocalEffects.map((effect) =>
      get().logEvent({ kind: "effect-expired", sourceId: effect.source.id })
    );
    persistCombat(get);
    return {
      expired: [
        ...expired,
        ...expiredLocalEffects.map((effect) => ({
          activeKey:
            effect.payload.kind === "condition"
              ? `condition:${effect.payload.conditionId}`
              : effect.payload.kind === "program-standing"
                ? `standing:${effect.payload.effectId}`
                : effect.payload.activeKey,
          sourceId: effect.source.id,
        })),
      ],
      restore: () => {
        concentrationLogIds.forEach((id) => get().removeLogEntry(id));
        logIds.forEach((id) => get().removeLogEntry(id));
        localLogIds.forEach((id) => get().removeLogEntry(id));
        const current = get().character;
        if (!current) return;
        set({
          combatActiveEffects: effectiveCombatEffects(
            priorLocalEffects,
            get().combatEffectOps
          ),
          combatLegacyActiveEffects: priorLocalEffects,
          character: {
            ...current,
            session: {
              ...current.session,
              activeFeatures: priorActive,
              activeSpellCastLevels: priorCastLevels,
              effectBoundaries: priorBoundaries,
              concentration: priorConcentration,
              concentrationCastLevel: priorConcentrationCastLevel,
              concentrationConditions: priorConcentrationConditions,
            },
          },
        });
        persistCombat(get);
      },
    };
  },

  consumePotionBuff: (itemId: string) => {
    const rounds = potionDurationRounds(itemId);
    if (rounds === undefined) return null; // instant potion — nothing to arm
    return get().armEffectTimer(potionTimerKey(itemId), rounds);
  },

  advanceEffectTimers: () => {
    const noop = { expired: [] as ReadonlyArray<never>, restore: () => {} };
    if (get().readonly) return noop;
    const character = get().character;
    if (!character) return noop;
    const { timers, expired } = advanceEffectTimersEngine(character);
    // Snapshot for undo BEFORE mutating: prior timers + active toggles/cast levels
    // + the log entries the expiry appends, so Undo-End-Turn reverts the whole step.
    const priorTimers = character.session.effectTimers;
    const priorActive = character.session.activeFeatures ?? [];
    const priorCastLevels = character.session.activeSpellCastLevels;
    const priorConcentration = character.session.concentration;
    const priorConcentrationCastLevel = character.session.concentrationCastLevel;
    const priorConcentrationConditions = character.session.concentrationConditions;
    const concentrationExpired =
      priorConcentration !== "" &&
      expired.some((effect) => effect.sourceId === priorConcentration);
    // Drop each expired state's toggle (every while-active grant retracts) and
    // emit its expiry log line.
    const expiredKeys = new Set(expired.map((effect) => effect.activeKey));
    const nextActive = priorActive.filter((key) => !expiredKeys.has(key));
    const nextCastLevels = Object.fromEntries(
      Object.entries(priorCastLevels ?? {}).filter(([key]) => !expiredKeys.has(key))
    );
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          effectTimers: timers,
          activeFeatures: nextActive,
          activeSpellCastLevels:
            Object.keys(nextCastLevels).length > 0 ? nextCastLevels : undefined,
        },
      },
    });
    const concentrationLogIds = concentrationExpired
      ? get().setConcentration("", { undoable: false })
      : [];
    const logIds: (string | null)[] = expired.map((e) =>
      get().logEvent({ kind: "effect-expired", sourceId: e.sourceId })
    );
    const restore = () => {
      // Remove the expiry log lines FIRST (each its own `set`), THEN read fresh
      // state for the timer/toggle restore — reading `cur` before `removeLogEntry`
      // and setting after would re-write the just-removed log line back.
      concentrationLogIds.forEach((id) => get().removeLogEntry(id));
      logIds.forEach((id) => get().removeLogEntry(id));
      const cur = get().character;
      if (!cur) return;
      set({
        character: {
          ...cur,
          session: {
            ...cur.session,
            // Restore the EXACT prior timers (undefined → drop the field), toggles,
            // and cast levels so the round-counter + state return identically.
            ...(priorTimers === undefined
              ? { effectTimers: undefined }
              : { effectTimers: priorTimers }),
            activeFeatures: priorActive,
            activeSpellCastLevels: priorCastLevels,
            concentration: priorConcentration,
            concentrationCastLevel: priorConcentrationCastLevel,
            concentrationConditions: priorConcentrationConditions,
          },
        },
      });
    };
    return { expired, restore };
  },

  setGrantBundleChoice: (bundleKey, optionId) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const charData = character.character;
    const sources = resolveAllGrantSources(charData, character.session.itemResources);
    // 1. Strip every variant spell this bundle could grant (any prior pick),
    //    keeping custom spells and any non-bundle / non-always-prepared refs.
    const bundleIds = allBundleSpellIds(sources, bundleKey);
    const kept = charData.spells.filter(
      (s) => "custom" in s || !(s.alwaysPrepared === true && bundleIds.has(s.srdId))
    );
    // 2. Inject the newly-selected option's spells (gated to the character's
    //    level). Other always-prepared spells already in `kept` are skipped by
    //    injectExpandedSpells' dedup.
    const choices = {
      ...(character.session.grantBundleChoices ?? {}),
      [bundleKey]: optionId,
    };
    const addEntries = getAlwaysPreparedFromGrants(sources, {
      level: totalLevel(charData),
      bundleChoices: new Map(Object.entries(choices)),
    });
    const spells = injectExpandedSpells(kept, addEntries);
    set({
      character: {
        ...character,
        character: { ...charData, spells },
        session: { ...character.session, grantBundleChoices: choices },
      },
    });
  },

  assumePolymorphForm: (beastId, spellId = "polymorph") => {
    if (get().readonly) return null;
    const { character } = get();
    if (!character) return null;
    if (character.session.polymorphForm) return null; // already transformed
    const beast = getBeast(beastId);
    if (!beast) return null;

    // Snapshot the caster's OWN fields for undo + drop-restore (the WHOLE prior
    // doc is the atomic undo target — nothing below mutates it in place).
    const before = character;
    const prior = polymorphPriorSnapshot(character);
    const buildPatch = polymorphBuildPatch(beast, prior);

    // Engage concentration by spell id THROUGH the store seam (clears any prior
    // spell's while-active chips + fires the swap toast, exactly like any cast).
    get().setConcentration(concentrationValue(spellId));

    const cur = get().character;
    if (!cur) return null;
    // Apply the Beast: stamp AC/speeds/scores into the overrides + Temp HP = the
    // Beast's HP (max-wins), and record the active form + snapshot on the session.
    const newTemp = Math.max(cur.session.hp.temp, beast.hp);
    set({
      character: {
        ...cur,
        character: { ...cur.character, ...buildPatch },
        session: {
          ...cur.session,
          hp: { ...cur.session.hp, temp: newTemp },
          polymorphForm: { beastId, spellId, prior },
        },
      },
    });
    get().logEvent({ kind: "temp-hp-gain", amount: newTemp });

    return () => set({ character: before });
  },

  dropPolymorphForm: () => {
    if (get().readonly) return null;
    const { character } = get();
    if (!character) return null;
    const form = character.session.polymorphForm;
    if (!form) return null;

    const before = character; // undo = re-assume the exact same form
    const pendingConcentrationSavesBefore = get().combatPendingConcentrationSaves;
    const revert = revertBuildFromPrior(form.prior);
    // Restore the body, retract the Beast Temp HP, drop the form. Clear the form's
    // concentration inline (only if it is still the form's spell — a prior swap
    // would already have retracted the form) so the drop is one atomic step.
    const clearConc = character.session.concentration === form.spellId;
    const { polymorphForm: _dropped, ...restSession } = character.session;
    void _dropped;
    set({
      ...(clearConc ? { combatPendingConcentrationSaves: [] } : {}),
      character: {
        ...character,
        character: { ...character.character, ...revert },
        session: {
          ...restSession,
          hp: { ...character.session.hp, temp: form.prior.tempHp },
          ...(clearConc ? { concentration: "" } : {}),
        },
      },
    });

    return () =>
      set({
        character: before,
        combatPendingConcentrationSaves: pendingConcentrationSavesBefore,
      });
  },

  setCompanionHp: (featureId, current) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          companionHp: {
            ...(character.session.companionHp ?? {}),
            [featureId]: { current: Math.max(0, current) },
          },
        },
      },
    });
  },

  setCompanionVariant: (featureId, variantId) => {
    if (get().readonly) return null;
    const { character } = get();
    if (!character) return null;
    const before = character; // undo = restore the prior variant pick + HP pool
    // A different variant is a different beast = a different HP pool; RESET the
    // companion's HP entry so a stale current can't misreport the new max.
    const { [featureId]: _dropped, ...restHp } = character.session.companionHp ?? {};
    void _dropped;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          companionVariant: {
            ...(character.session.companionVariant ?? {}),
            [featureId]: variantId,
          },
          companionHp: restHp,
        },
      },
    });
    return () => set({ character: before });
  },

  summonFamiliar: (monsterId, creatureType, maxHp) => {
    if (get().readonly) return null;
    const { character } = get();
    if (!character) return null;
    const before = character; // undo = restore the exact prior familiar + HP entry
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          familiar: { monsterId, creatureType },
          companionHp: {
            ...(character.session.companionHp ?? {}),
            [FIND_FAMILIAR_SPELL_ID]: { current: Math.max(1, maxHp) },
          },
        },
      },
    });
    return () => set({ character: before });
  },

  setFamiliarDismissed: (dismissed) => {
    if (get().readonly) return;
    const { character } = get();
    const familiar = character?.session.familiar;
    if (!character || !familiar) return;
    const { dismissed: _prev, ...rest } = familiar;
    void _prev;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          familiar: dismissed ? { ...rest, dismissed: true } : rest,
        },
      },
    });
  },

  dismissFamiliar: () => {
    if (get().readonly) return null;
    const { character } = get();
    if (!character?.session.familiar) return null;
    const before = character; // undo = re-summon the exact prior familiar + HP
    const { [FIND_FAMILIAR_SPELL_ID]: _hp, ...restHp } =
      character.session.companionHp ?? {};
    void _hp;
    const { familiar: _f, ...restSession } = character.session;
    void _f;
    set({
      character: {
        ...character,
        session: { ...restSession, companionHp: restHp },
      },
    });
    return () => set({ character: before });
  },

  applyInitiativeTrackerTopUps: () => {
    const noop = { sourceIds: [], restore: () => {} };
    if (get().readonly) return noop;
    const character = get().character;
    if (!character) return noop;
    const topUps = getInitiativeTrackerTopUps(character);
    if (topUps.size === 0) return noop;
    // Snapshot the affected trackers' prior state for undo, then set each to its
    // new `used` count. The consumer already clamped to the resolved total + only
    // returned trackers that were genuinely below the floor.
    const prior = new Map<string, { used: number } | undefined>();
    const nextTrackers = { ...character.session.trackers };
    const sourceIds: string[] = [];
    for (const [trackerId, newUsed] of topUps) {
      prior.set(trackerId, character.session.trackers[trackerId]);
      nextTrackers[trackerId] = { used: newUsed };
    }
    // Provenance for the toast: the source feature(s) granting the top-up.
    for (const c of evaluateGrants(
      resolveAllGrantSources(character.character, character.session.itemResources),
      new Set(character.session.activeFeatures ?? []),
      new Map(Object.entries(character.session.grantBundleChoices ?? {}))
    ).initiativeTrackerTopUps) {
      if (topUps.has(c.trackerId) && !sourceIds.includes(c.sourceId)) {
        sourceIds.push(c.sourceId);
      }
    }
    set({
      character: {
        ...character,
        session: { ...character.session, trackers: nextTrackers },
      },
    });
    const restore = () => {
      const cur = get().character;
      if (!cur) return;
      let reverted = cur.session.trackers;
      for (const [trackerId, prev] of prior) {
        reverted = restoreTrackerEntry(reverted, trackerId, prev);
      }
      set({
        character: { ...cur, session: { ...cur.session, trackers: reverted } },
      });
    };
    return { sourceIds, restore };
  },

  recoverTrackerFromSpellSlot: (trackerId) => {
    if (get().readonly) return null;
    const character = get().character;
    if (!character) return null;
    const option = getSpellSlotTrackerRecovery(character).get(trackerId);
    if (!option || option.availableSlotLevels.length === 0) return null;
    // Spend the LOWEST available slot (cheapest conversion) and restore the
    // tracker uses. Snapshot both for undo.
    const slotLevel = option.availableSlotLevels[0];
    if (slotLevel === undefined) return null;
    // The only grantor (Bard) has no Pact Magic, so the recovered slot is always
    // a normal slot (key = `String(level)` via slotUsageKey's normal branch).
    const slotKey = slotUsageKey({ level: slotLevel });
    const priorSlotUsed = character.session.spellSlots[slotKey]?.used ?? 0;
    const priorTracker = character.session.trackers[trackerId];
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          spellSlots: {
            ...character.session.spellSlots,
            [slotKey]: { used: priorSlotUsed + 1 },
          },
          trackers: {
            ...character.session.trackers,
            [trackerId]: { used: option.newUsed },
          },
        },
      },
    });
    return () => {
      const cur = get().character;
      if (!cur) return;
      const revertedTrackers = restoreTrackerEntry(
        cur.session.trackers,
        trackerId,
        priorTracker
      );
      set({
        character: {
          ...cur,
          session: {
            ...cur.session,
            spellSlots: {
              ...cur.session.spellSlots,
              [slotKey]: { used: priorSlotUsed },
            },
            trackers: revertedTrackers,
          },
        },
      });
    };
  },

  recoverTrackerByAltCost: (trackerId, fromTracker, amount) => {
    if (get().readonly) return null;
    const character = get().character;
    if (!character) return null;
    if (amount <= 0) return null;
    // Resolve both trackers' live totals/used (the engine is the single source).
    const resolved = new Map(resolveTrackers(character).map((tr) => [tr.id, tr]));
    const target = resolved.get(trackerId);
    const pool = resolved.get(fromTracker);
    if (!target || !pool) return null;
    // Only when the target is exhausted AND the pool can afford the cost.
    if (target.total - target.used > 0) return null;
    if (pool.total - pool.used < amount) return null;

    const priorTarget = character.session.trackers[trackerId];
    const priorPool = character.session.trackers[fromTracker];
    const priorPoolUsed = priorPool?.used ?? 0;
    // Restore one use of the target (used − 1, floored at 0); spend the pool.
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          trackers: {
            ...character.session.trackers,
            [trackerId]: { used: Math.max(0, target.used - 1) },
            [fromTracker]: { used: priorPoolUsed + amount },
          },
        },
      },
    });
    return () => {
      const cur = get().character;
      if (!cur) return;
      let reverted = restoreTrackerEntry(cur.session.trackers, trackerId, priorTarget);
      reverted = restoreTrackerEntry(reverted, fromTracker, priorPool);
      set({
        character: { ...cur, session: { ...cur.session, trackers: reverted } },
      });
    };
  },

  recoverTrackerByMinSlot: (trackerId, minLevel) => {
    if (get().readonly) return null;
    const character = get().character;
    if (!character) return null;
    // Only when the target tracker is exhausted (no normal uses left).
    const target = resolveTrackers(character).find((t) => t.id === trackerId);
    if (!target || target.total - target.used > 0) return null;
    // Cheapest UNSPENT slot of level ≥ minLevel (the slot-funded alt-recovery
    // requires a level N+ slot). The grantors (Cleric, Ranger) have no Pact
    // Magic, so every eligible slot is a normal slot (key = `String(level)`).
    const eligible = character.character.spellSlots
      .filter((s) => {
        const used = character.session.spellSlots[slotUsageKey(s)]?.used ?? 0;
        return s.level >= minLevel && s.total - used > 0;
      })
      .map((s) => s.level)
      .sort((a, b) => a - b);
    const slotLevel = eligible[0];
    if (slotLevel === undefined) return null;

    const slotKey = slotUsageKey({ level: slotLevel });
    const priorSlotUsed = character.session.spellSlots[slotKey]?.used ?? 0;
    const priorTracker = character.session.trackers[trackerId];
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          spellSlots: {
            ...character.session.spellSlots,
            [slotKey]: { used: priorSlotUsed + 1 },
          },
          trackers: {
            ...character.session.trackers,
            // Restore exactly ONE use (alt-recovery semantics).
            [trackerId]: { used: Math.max(0, target.used - 1) },
          },
        },
      },
    });
    return () => {
      const cur = get().character;
      if (!cur) return;
      const revertedTrackers = restoreTrackerEntry(
        cur.session.trackers,
        trackerId,
        priorTracker
      );
      set({
        character: {
          ...cur,
          session: {
            ...cur.session,
            spellSlots: {
              ...cur.session.spellSlots,
              [slotKey]: { used: priorSlotUsed },
            },
            trackers: revertedTrackers,
          },
        },
      });
    };
  },

  applyAtZeroHpInterrupt: (trackerId) => {
    if (get().readonly) return () => {};
    const character = get().character;
    if (
      !character ||
      character.session.hp.current !== 0 ||
      !isCharacterAlive(character.status, character.session)
    ) {
      return () => {};
    }
    const priorHp = character.session.hp;
    const priorTracker = character.session.trackers[trackerId];
    const priorUsed = priorTracker?.used ?? 0;
    const priorConditions = character.session.conditions;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          hp: { ...priorHp, current: 1 },
          trackers: {
            ...character.session.trackers,
            [trackerId]: { used: priorUsed + 1 },
          },
          // Standing back up from 0 HP clears any in-progress death saves.
          deathSucc: 0,
          deathFail: 0,
          // RA-10 — RAW the interrupt means the character never fell ("drop to 1
          // instead"), so the knockout's auto-applied Unconscious is retracted
          // with the rest of the dying state.
          conditions: priorConditions.filter((c) => c !== UNCONSCIOUS_CONDITION_ID),
        },
      },
    });
    // Compound trio change (HP → 1, death saves → 0): persist the whole resulting state.
    persistCombat(get);
    return () => {
      const cur = get().character;
      if (!cur) return;
      const reverted = restoreTrackerEntry(cur.session.trackers, trackerId, priorTracker);
      set({
        character: {
          ...cur,
          session: {
            ...cur.session,
            hp: priorHp,
            trackers: reverted,
            deathSucc: character.session.deathSucc,
            deathFail: character.session.deathFail,
            conditions: priorConditions,
          },
        },
      });
      // Re-persist the restored trio (HP + death saves back to their pre-interrupt
      // values) so the subdoc converges with the undo.
      persistCombat(get);
    };
  },

  applyArcaneRecovery: (slotLevels, trackerId) => {
    if (get().readonly) return () => {};
    const character = get().character;
    if (!character) return () => {};
    const priorSlots = character.session.spellSlots;
    const priorTracker = character.session.trackers[trackerId];
    // Restore one expended slot per chosen level (never below 0 used). Arcane
    // Recovery only ever restores NORMAL (non-pact) slots — the picker offers
    // `!pactMagic` levels — so each key is the normal-pool key.
    const nextSlots = { ...priorSlots };
    for (const lv of slotLevels) {
      const key = slotUsageKey({ level: lv });
      const used = nextSlots[key]?.used ?? 0;
      nextSlots[key] = { used: Math.max(0, used - 1) };
    }
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          spellSlots: nextSlots,
          trackers: {
            ...character.session.trackers,
            [trackerId]: { used: (priorTracker?.used ?? 0) + 1 },
          },
        },
      },
    });
    return () => {
      const cur = get().character;
      if (!cur) return;
      const reverted = restoreTrackerEntry(cur.session.trackers, trackerId, priorTracker);
      set({
        character: {
          ...cur,
          session: { ...cur.session, spellSlots: priorSlots, trackers: reverted },
        },
      });
    };
  },

  logEvent: (event) => {
    // The log records play history even from a read-only sheet's own mutations —
    // but every mutator above short-circuits under readonly, so nothing CALLS
    // logEvent there. Guard anyway: no character ⇒ nothing to append.
    const { character } = get();
    if (!character) return null;
    const id = crypto.randomUUID();
    const entry: LogEntry = { event, ts: Date.now(), id };
    // Cap at write time so the stored/synced array stays bounded (see MAX_LOG).
    const next = [...character.session.logEntries, entry].slice(-MAX_LOG);
    set({
      character: { ...character, session: { ...character.session, logEntries: next } },
    });
    void saveLogToIDB(character.id, next);
    return id;
  },

  removeLogEntry: (id) => {
    if (!id) return;
    const { character } = get();
    if (!character) return;
    const current = character.session.logEntries;
    if (!current.some((e) => e.id === id)) return;
    const next = current.filter((e) => e.id !== id);
    set({
      character: { ...character, session: { ...character.session, logEntries: next } },
    });
    void saveLogToIDB(character.id, next);
  },

  clearLog: () => {
    const { character } = get();
    if (!character) return;
    set({
      character: { ...character, session: { ...character.session, logEntries: [] } },
    });
    void clearLogFromIDB(character.id);
  },
}));

// Registered before UI/auto-save subscribers: every immutable session replacement is
// decorated for render without becoming enumerable/persistable. This also reattaches a
// projection after a same-character Firestore hydration.
useCharacterStore.subscribe((state, previous) => {
  if (
    state.character &&
    (state.character !== previous.character ||
      state.encounterEffectProjection !== previous.encounterEffectProjection)
  ) {
    attachEncounterEffects(
      state.character,
      state.encounterEffectProjection,
      state.combatActiveEffects
    );
  }
});
