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
} from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";
import type { CombatState, CombatPersistence } from "@/types/combat-state";
import { applyCombatToSession, sessionToCombatState } from "@/lib/combat-state";
import type { StoredConcentration } from "@/types/ids";
import { saveLogToIDB, clearLogFromIDB } from "@/lib/log-persistence";
import {
  getShortRestRecoveries,
  gainsHeroicInspirationOnLongRest,
  applyShortRestExhaustion,
  getInitiativeTrackerTopUps,
  getSpellSlotTrackerRecovery,
  resolvePerTurnRecoveryTrackerIds,
  resolveActiveTimedEffects,
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
import { concentrationValue } from "@/lib/concentration";
import {
  concentrationSaveDc,
  effectiveAbilityScores,
  resolveConcentrationSaveBonus,
  resolveSaveBonus,
  savingThrowBonus,
} from "@/lib/compute";
import {
  aggregateCharacterGrants,
  activeKeysForConcentration,
  effectiveMaxHp,
} from "@/lib/aggregate-character";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import { conditionBreaksConcentration } from "@/lib/condition-effects";
import { evaluateGrants } from "@/lib/grants";
import { slotUsageKey } from "@/lib/cast-options";
import {
  applyDamage as damageHp,
  applyHealing as healHp,
  clampHp,
  clampTemp,
} from "@/lib/combat-hp";
import {
  deathSaveFailuresFromDamage,
  isInstantDeathAtZero,
  isMassiveDamageDeath,
} from "@/lib/damage-intake";
import { DEATH_FAIL_LIMIT } from "@/lib/character-status";
import {
  allBundleSpellIds,
  getAlwaysPreparedFromGrants,
  injectExpandedSpells,
} from "@/lib/expanded-spells";
import { useToastStore } from "@/stores/toastStore";
import { registerUndoableToast, useUndoStore } from "@/stores/undoStore";
import { useCombatStore } from "@/stores/combatStore";

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
  trackers: Record<string, { used: number }>,
  trackerId: string,
  prior: { used: number } | undefined
): Record<string, { used: number }> {
  if (prior !== undefined) return { ...trackers, [trackerId]: prior };
  const next: Record<string, { used: number }> = {};
  for (const [k, v] of Object.entries(trackers)) {
    if (k !== trackerId) next[k] = v;
  }
  return next;
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
  /**
   * The SOLO combat `round` hydrated from the `combat/state` subdoc — the round's
   * in-store mirror (the parallel of {@link combatEpoch}). The SESSION no longer carries
   * round (it moved to the subdoc as its sole persisted home); the turn engine
   * (`combatStore.round`) is its live in-memory home, and this is the value a combat write
   * persists back. Kept in sync by `hydrateCombatState` (inbound) and `persistCombatRound`
   * (a local turn advance), so every whole-object combat write carries the current round.
   */
  combatRound: number;

  // Actions
  setCharacter: (doc: CharacterDoc | null) => void;
  /** Inject (or clear) the combat-state persistence seam — the subscription lifecycle. */
  setCombatPersistence: (persistence: CombatPersistence | null) => void;
  /** T4 — load a sheet in read-only mode (DM viewing a member's character). */
  loadReadonly: (doc: CharacterDoc | null) => void;
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
   *  - Healing from 0 (`setHP`) clears the track AND the Unconscious condition.
   */
  applyDamage: (amount: number, opts?: { crit?: boolean }) => void;
  /**
   * Apply healing: raise current HP by `amount` (clamped to max). The dedicated
   * healing seam (mirror of {@link applyDamage}) — used by the HP control's heal
   * action so the combat log gets ONE structured `hp-heal` event from the store,
   * not a low-level `setHP` (which also serves rest/undo/level-up and must stay
   * log-free). No-op for a non-positive amount. */
  applyHealing: (amount: number) => void;
  /**
   * Gain temporary HP: set the temp pool to `max(current, amount)` (temp HP don't
   * stack) and log ONE structured `temp-hp-gain` event. The dedicated temp-gain
   * seam, so `setTempHP` (rest/undo/USE-APPLIES) stays log-free. No-op for a
   * non-positive amount. */
  gainTempHp: (amount: number) => void;
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
  /** Decrement a tracked equipment item by 1; removes the entry entirely when quantity hits 0. */
  useEquipmentItem: (equipmentKey: string) => void;
  setConcentration: (spell: StoredConcentration) => void;
  addCondition: (condition: string) => void;
  removeCondition: (condition: string) => void;
  /**
   * Restore the HP-mutation snapshot an undo captured — current/temp HP, the
   * dying track, and the conditions list — EXACTLY, in one set + one durable
   * combat-state write. Log-free by design (an undo must not mint story beats)
   * and clamp-free (the values came from this same store). The single reverse
   * seam for the damage-intake / death-save undo paths, closing the
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
  /**
   * FRONTIER-S3 — reset every `recovery: "per-turn"` tracker with a spent use
   * (Sneak Attack) to full, run at the owner's turn start (the End-Turn seam).
   * Returns an undo applier restoring the exact prior tracker state (`null` when
   * nothing needed resetting — no toast). Override-first: the pip stays editable;
   * this only refills it once per turn.
   */
  recoverPerTurnTrackers: () => (() => void) | null;
  /**
   * FRONTIER-S3 — arm the round countdown for every active `maxRounds` state that
   * has no timer yet (Rage just activated → 100 rounds). Idempotent: a state that
   * already has a timer is left untouched. Called when a state lights so the UI
   * can show its countdown immediately (the actual decrement happens at End Turn).
   */
  armEffectTimers: () => void;
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
 * The `session.activeFeatures` toggle key Death Ward's `while-active` block lights
 * (the `spell-<id>` convention). Read by `applyDamage`'s 0-HP interrupt (clamp to 1
 * + end the ward) and re-lit by the HP-control undo. The `spell-death-ward` grant
 * declares the SAME key (single source, golden rule 6).
 */
const DEATH_WARD_ACTIVE_KEY = "spell-death-ward";

/**
 * The Unconscious condition id (RA-10) — auto-applied by `applyDamage` when a
 * character drops to 0 HP (SRD "Falling Unconscious") and auto-shed by the
 * heal-from-0 seam in `setHP` / the at-zero "drop to 1 instead" interrupt. The
 * chip stays hand-removable like any condition (override-first).
 */
const UNCONSCIOUS_CONDITION_ID = "unconscious";

function persistCombat(get: () => CharacterState): void {
  const cur = get().character;
  if (!cur) return;
  get().combatPersistence?.write(sessionToCombatState(cur.session, get().combatRound));
}

export const useCharacterStore = create<CharacterState>()((set, get) => ({
  character: null,
  loading: false,
  error: null,
  readonly: false,
  combatPersistence: null,
  combatRound: 1,

  // The normal owner-edit load path — always clears read-only (so re-entering a
  // sheet you own after viewing someone else's is fully editable again).
  setCharacter: (doc) => set({ character: doc, error: null, readonly: false }),
  loadReadonly: (doc) => set({ character: doc, error: null, readonly: true }),
  setCombatPersistence: (persistence) => set({ combatPersistence: persistence }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  hydrateCombatState: (combat) => {
    const { character } = get();
    if (!character) return;
    // Clamp the hydrated HP against the EFFECTIVE max (stored base + hp-flat boons +
    // Aid), the same ceiling every write path uses (rule 6 — one source for max).
    // The trio-merge math itself lives ONCE in `applyCombatToSession` (reused by the
    // in-hub party/encounter live read).
    const max = effectiveMaxHp(character.character, character.session);
    set({
      character: {
        ...character,
        session: applyCombatToSession(character.session, combat, max),
      },
      // Mirror the subdoc's SOLO round so a later whole-object write carries it; `1` when
      // the subdoc is absent (a fresh char) — the turn engine seeds from this on hydrate.
      combatRound: combat?.round ?? 1,
    });
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
    if (amount <= 0) return;
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const { current, temp } = character.session.hp;
    // D1 — effective max (stored base + hp-flat boons + Aid), see `setHP`.
    const max = effectiveMaxHp(character.character, character.session);

    // ── RA-03 — damage while ALREADY at 0 HP (SRD "Death Saving Throws —
    // Damage at 0 Hit Points"). HP never drops below 0, so the hit becomes
    // dying-track marks instead: one failure, two from a Critical Hit, and
    // instant death (3 failures) when the damage reaches the HP maximum. A hit
    // while STABLE ends the stability (the successes clear and the death saves
    // restart). Temp HP still absorbs first (RAW: it's a buffer, but you still
    // TOOK damage — the same total-damage reading the concentration save uses).
    // Dead (3 failures) = inert; nothing left to mark.
    if (current === 0) {
      if (character.session.deathFail >= DEATH_FAIL_LIMIT) return;
      const { temp: newTemp } = damageHp(current, temp, amount);
      const instantDeath = isInstantDeathAtZero(amount, max);
      const failures = instantDeath
        ? DEATH_FAIL_LIMIT
        : Math.min(
            DEATH_FAIL_LIMIT,
            character.session.deathFail + deathSaveFailuresFromDamage(opts?.crit === true)
          );
      set({
        character: {
          ...character,
          session: {
            ...character.session,
            hp: { ...character.session.hp, temp: newTemp },
            // A Stable creature that takes damage stops being Stable and must
            // start making death saves again — its successes clear.
            deathSucc: 0,
            deathFail: failures,
          },
        },
      });
      get().logEvent({ kind: "hp-damage", amount, current: 0, max });
      get().logEvent({
        kind: "death-save",
        outcome: "failure",
        successes: 0,
        failures,
      });
      persistCombat(get);
      return;
    }

    // USE-APPLIES (Task 2, RAGE-MAINTAIN) — "taking damage" MAINTAINS a Rage-style
    // state for another round (2024 RAW). This is the real HP-reduction path (the
    // manual HP control delegates here), so flag it on the per-round combat state;
    // the End-Turn maintenance check then treats a hit round as maintained — no
    // banner, zero extra taps. Per-round flag resets in `combatStore.endTurn`.
    useCombatStore.getState().noteDamageTaken();

    // Temp HP absorbs first, then current HP — see `lib/combat-hp`.
    const { current: rawCurrent, temp: newTemp } = damageHp(current, temp, amount);

    // Death Ward interrupt — a DETERMINISTIC 0-HP save (spell:death-ward, 2024
    // RAW): "The first time the target would drop to 0 Hit Points before the spell
    // ends, the target instead drops to 1 Hit Point, and the spell ends." When the
    // ward toggle is lit and this damage would cross to 0, clamp to 1 and END the
    // ward (remove its `activeFeatures` key below). This is RAW, not a roll (golden
    // rule 21). Applied BEFORE the concentration branch so the clamped 1 HP takes
    // the NORMAL concentration-save path (you took damage but didn't drop to 0), not
    // the 0-HP auto-break. The HP-control edge owns the undoable damage toast and
    // re-lights the ward on undo.
    const wardActive = (character.session.activeFeatures ?? []).includes(
      DEATH_WARD_ACTIVE_KEY
    );
    const wardTriggered = wardActive && rawCurrent <= 0;
    const newCurrent = wardTriggered ? 1 : rawCurrent;

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
    let newConcentration = concentrating;
    // S1 — while-active chips the dropped concentration spell lit (Fly, Haste,
    // Mage Armor…). Resolved from the spell's STABLE ref (golden rule 7);
    // cleared together with concentration in the 0-HP auto-drop `set` below so the
    // rail chip never lingers lit after the spell ends. [] for a non-buff /
    // homebrew / non-concentrating spell ⇒ nothing changes.
    let droppedActiveKeys: readonly string[] = [];
    if (concentrating !== "") {
      if (newCurrent === 0 || formEnds) {
        // Concentration ends OUTRIGHT — no maintenance save is offered — when the
        // caster drops to 0 HP (broken by RAW) OR when a Polymorph form's Temp HP
        // is depleted (S7: the spell ends, taking its Concentration with it). Both
        // surface as the single `concentration-dropped` beat.
        newConcentration = "";
        droppedActiveKeys = activeKeysForConcentration(
          character.character,
          character.session,
          concentrating
        );
        useToastStore.getState().showToast({
          intent: { kind: "concentration-dropped", spell: concentrating },
          duration: 5000,
        });
      } else {
        const dc = concentrationSaveDc(amount);
        // The character's CON-save total for THIS save: the base CON save
        // (proficiency + flat save bonuses, manual override-aware) plus the
        // CONCENTRATION-ONLY grant bonus (Bladesong Focus +INT — previously
        // computed but never shown; AX exposure audit).
        const cd = character.character;
        const agg = aggregateCharacterGrants(cd, character.session);
        // B8 — the ability-keyed save-bonus layers (Aura of Protection +CHA,
        // Increased Toughness +WIS, Bladesong Focus +INT) scale with the CURRENT
        // (effective) score, so an ability-boosting item raises them (RAW 2024).
        // Resolve effective scores ONCE and feed the base CON save AND both bonus
        // helpers from it — never the raw stored scores (rule 6).
        const effectiveScores = effectiveAbilityScores(
          cd.abilityScores,
          agg.abilityScoreFloors,
          agg.itemAbilityScoreBonus,
          agg.itemAbilityScoreCap
        );
        const conSave = savingThrowBonus(
          effectiveScores.CON,
          totalLevel(cd),
          // CON-save proficiency = own ∪ granted (inline — engine-core must not
          // import the lib/views presenter that owns the display merge).
          cd.savingThrows.includes("CON") || agg.saveProficiencies.has("CON"),
          cd.savingThrowBonusOverrides?.CON ?? null,
          character.session.exhaustion,
          cd.proficiencyBonusOverride,
          resolveSaveBonus(agg, effectiveScores, "CON")
        );
        const saveBonus = conSave + resolveConcentrationSaveBonus(agg, effectiveScores);
        useToastStore.getState().showToast({
          intent: { kind: "concentration-save", spell: concentrating, dc, saveBonus },
          duration: 5000,
        });
      }
    }

    // S7 — retract the Polymorph SELF-form when it ends: restore the caster's own
    // AC/speeds/scores and drop the form. Triggered by Temp-HP depletion (the RAW
    // primary trigger, which also covers the 0-HP break since Temp absorbs first).
    // The Beast Temp HP is already 0 (`newTemp`), so no temp restore is needed here.
    const retractForm = formEnds;
    const revertBuild = formEnds ? revertBuildFromPrior(activeForm.prior) : undefined;

    // ── RA-03/RA-10 — crossing to 0 HP. A knockout starts a FRESH dying state
    // (the track resets to 0/0 so a prior episode's marks never carry over), and
    // per SRD "Falling Unconscious" the character has the Unconscious condition
    // until they regain HP (removed by the heal-from-0 seam in `setHP`). SRD
    // "Instant Death — Massive Damage": when the remainder past 0 (after the
    // temp pool and current HP) reaches the HP maximum, the character dies
    // outright instead — 3 failures (the one derived death predicate,
    // `character-status.ts`), and no Unconscious (that condition belongs to
    // dying, not to a corpse). `current > 0` is guaranteed here (the at-0
    // branch returned above), so `newCurrent === 0` IS the crossing.
    const knockout = newCurrent === 0;
    const massiveDeath = knockout && isMassiveDamageDeath(amount, current, temp, max);
    const gainsUnconscious =
      knockout &&
      !massiveDeath &&
      !character.session.conditions.includes(UNCONSCIOUS_CONDITION_ID);
    set({
      character: {
        ...character,
        ...(revertBuild ? { character: { ...character.character, ...revertBuild } } : {}),
        session: {
          ...character.session,
          hp: { ...character.session.hp, current: newCurrent, temp: newTemp },
          concentration: newConcentration,
          // RA-03 — a knockout is a fresh dying state (0/0); massive damage is
          // instant death (3 failures = the derived dead predicate).
          ...(knockout
            ? { deathSucc: 0, deathFail: massiveDeath ? DEATH_FAIL_LIMIT : 0 }
            : {}),
          // RA-10 — falling Unconscious at 0 HP (skipped when instantly dead).
          ...(gainsUnconscious
            ? {
                conditions: [...character.session.conditions, UNCONSCIOUS_CONDITION_ID],
              }
            : {}),
          ...(retractForm ? { polymorphForm: undefined } : {}),
          // S1 — retract the auto-dropped spell's while-active chips with it, plus
          // the Death Ward toggle when the ward fired (the spell ends per RAW).
          ...(droppedActiveKeys.length > 0 || wardTriggered
            ? {
                activeFeatures: (character.session.activeFeatures ?? []).filter(
                  (k) =>
                    !droppedActiveKeys.includes(k) &&
                    !(wardTriggered && k === DEATH_WARD_ACTIVE_KEY)
                ),
              }
            : {}),
        },
      },
    });
    // Events-as-data: log the hit as a structured `hp-damage` event (the total
    // incoming amount + the resulting current/max). The presenter localizes it.
    get().logEvent({ kind: "hp-damage", amount, current: newCurrent, max });
    // RA-10 — falling Unconscious is a story beat (the heal-from-0 seam logs the
    // matching `condition-loss`); massive-damage instant death logs the resolved
    // dying track (3 failures) so the chronicle carries the death.
    if (gainsUnconscious) {
      get().logEvent({ kind: "condition-gain", conditionId: UNCONSCIOUS_CONDITION_ID });
    }
    if (massiveDeath) {
      get().logEvent({
        kind: "death-save",
        outcome: "failure",
        successes: 0,
        failures: DEATH_FAIL_LIMIT,
      });
    }
    // Concentration that ended outright (0-HP break OR a form's Temp-HP depletion)
    // is its own story beat.
    if (concentrating !== "" && newConcentration === "") {
      get().logEvent({ kind: "concentration-end", spell: concentrating });
    }
    // Persist the whole resulting combat state (offline-safe, durably queued). The
    // dropped concentration / active-feature chips are NON-combat session fields — they
    // persist through the parent-doc auto-save, not here.
    persistCombat(get);
  },

  applyHealing: (amount) => {
    if (amount <= 0) return;
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
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
  },

  useTracker: (trackerId, amount = 1) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const current = character.session.trackers[trackerId]?.used ?? 0;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          trackers: {
            ...character.session.trackers,
            [trackerId]: { used: current + amount },
          },
        },
      },
    });
  },

  restoreTracker: (trackerId, amount = 1) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    const current = character.session.trackers[trackerId]?.used ?? 0;
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          trackers: {
            ...character.session.trackers,
            [trackerId]: { used: Math.max(0, current - amount) },
          },
        },
      },
    });
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

  setConcentration: (spell) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
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
    // RAW 2024 (PHB p.235): when you start casting another spell that
    // requires Concentration, your existing concentration ends. We
    // perform the swap silently in the store (the caller already knows
    // they're starting a new concentration spell) but surface a toast so
    // the player isn't blindsided by losing the previous one.
    if (prev && spell && prev !== spell) {
      useToastStore.getState().showToast({
        intent: { kind: "concentration-replaced", previous: prev, next: spell },
        duration: 5000,
      });
    }
    // Apply the concentration change (set / swap / clear) + its events-as-data story
    // beats: starting (or swapping into) a concentration spell, or ending one. A pure
    // swap (prev → spell) logs the END of the old + the START of the new. Wrapped so the
    // CLEAR case can run it inside an undo-stack `execute` (redo re-applies it).
    const applyChange = () => {
      set({
        character: {
          ...character,
          // S7 — fold the body-restore patch when the form is retracted.
          ...(revertBuild
            ? { character: { ...character.character, ...revertBuild } }
            : {}),
          session: {
            ...character.session,
            concentration: spell,
            activeFeatures: nextActive,
            // S7 — drop the form + retract the Beast Temp HP to the caster's own.
            ...(retractForm
              ? {
                  polymorphForm: undefined,
                  hp: { ...character.session.hp, temp: form.prior.tempHp },
                }
              : {}),
          },
        },
      });
      if (prev && prev !== spell)
        get().logEvent({ kind: "concentration-end", spell: prev });
      if (spell && spell !== prev) get().logEvent({ kind: "concentration-start", spell });
    };
    // CLEARING concentration (empty spell) is destructive — a mis-tap silently ends an
    // in-combat spell. Route it onto the session undo stack (mirrors the tracker/HP/cast
    // pattern) so every caller — rail, combat, mobile drawer — inherits recovery + redo
    // for free, generalising the undo contract to ALL destructive actions.
    if (prev && !spell) {
      registerUndoableToast(
        { intent: { kind: "stopped-concentrating", spell: prev } },
        () => {
          applyChange();
          return () => {
            const cur = get().character;
            if (!cur) return;
            // When clearing also retracted a Polymorph form, the whole prior doc
            // (Beast build + Temp HP + form) is the atomic undo target — a partial
            // concentration-only restore would leave the reverted body behind.
            if (retractForm) {
              set({ character: before });
              return;
            }
            set({
              character: {
                ...cur,
                session: {
                  ...cur.session,
                  concentration: prev,
                  // Restore the EXACT prior active toggles alongside concentration,
                  // so the chip re-lights atomically with the spell (mirrors the
                  // cast-undo + `advanceEffectTimers` revert).
                  activeFeatures: priorActive,
                },
              },
            });
          };
        },
        { turnScoped: false }
      );
    } else {
      applyChange();
    }
  },

  addCondition: (condition) => {
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
      get().setConcentration("");
    }
    // Persist the whole resulting combat state (offline-safe).
    persistCombat(get);
  },

  removeCondition: (condition) => {
    if (get().readonly) return;
    const { character } = get();
    if (!character) return;
    if (!character.session.conditions.includes(condition)) return;
    const prevConditions = character.session.conditions;
    // Immediate-commit WITH 5s undo, now routed onto the session undo stack — removing
    // a condition is destructive (a mis-tap wipes a high-stakes state with no recovery).
    // The store emits the condition ID only; the view resolves its localized name
    // (toasts-as-data, §3.2). The removal runs INSIDE `execute` so redo re-applies it;
    // the reverse restores the FULL prior condition list + the log entry.
    registerUndoableToast(
      { intent: { kind: "condition-removed", conditionId: condition } },
      () => {
        set({
          character: {
            ...character,
            session: {
              ...character.session,
              conditions: prevConditions.filter((c) => c !== condition),
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
        return () => {
          const cur = get().character;
          if (!cur) return;
          set({
            character: {
              ...cur,
              session: { ...cur.session, conditions: prevConditions },
            },
          });
          get().removeLogEntry(lossLogId);
          // Re-persist the restored trio so the subdoc converges with the undo.
          persistCombat(get);
        };
      },
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
      evaluateGrants(resolveAllGrantSources(character.character)).exhaustionRecoveryBonus;
    // Magic-item charges with `recovery: "long-rest"` restore to max. (Items
    // with `recovery: "dawn"` are functionally identical for the player —
    // dawn happens at the end of a Long Rest.) Other recoveries (short-rest
    // recharge wands, daily-cooldown rods) are left alone here.
    const newEquipment = character.character.equipment.map((ref) => {
      if (!ref.charges) return ref;
      if (ref.charges.recovery !== undefined && ref.charges.recovery !== "long-rest") {
        return ref;
      }
      if (ref.charges.current === ref.charges.max) return ref;
      return { ...ref, charges: { ...ref.charges, current: ref.charges.max } };
    });
    // S4 — Human's Resourceful: finishing a Long Rest auto-grants Heroic
    // Inspiration. The consumer (`gainsHeroicInspirationOnLongRest`) decides the
    // default only; override-first — the player can still toggle the chip off
    // afterward (a Long Rest never CLEARS an existing Inspiration either).
    const gainsInspiration =
      gainsHeroicInspirationOnLongRest(character) || character.session.inspiration;
    set({
      character: {
        ...character,
        character: { ...character.character, equipment: newEquipment },
        session: {
          ...character.session,
          hp: { current: max, temp: 0 },
          hitDice: { used: newHitDiceUsed },
          spellSlots: {},
          trackers: {},
          concentration: "",
          exhaustion: Math.max(0, character.session.exhaustion - exhaustionRemoved),
          inspiration: gainsInspiration,
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
        },
      },
    });
    // Events-as-data: a Short Rest is a story beat.
    get().logEvent({ kind: "rest", restKind: "short" });
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
    set({
      character: {
        ...character,
        session: { ...character.session, activeFeatures: next },
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

  armEffectTimers: () => {
    if (get().readonly) return;
    const character = get().character;
    if (!character) return;
    const active = resolveActiveTimedEffects(character);
    if (active.length === 0) return;
    const prev = character.session.effectTimers ?? {};
    let changed = false;
    const next = { ...prev };
    for (const eff of active) {
      if (next[eff.activeKey] === undefined) {
        next[eff.activeKey] = { roundsLeft: eff.maxRounds };
        changed = true;
      }
    }
    if (!changed) return;
    set({
      character: {
        ...character,
        session: { ...character.session, effectTimers: next },
      },
    });
  },

  consumePotionBuff: (itemId: string) => {
    if (get().readonly) return null;
    const character = get().character;
    if (!character) return null;
    const rounds = potionDurationRounds(itemId);
    if (rounds === undefined || rounds <= 0) return null; // instant potion — nothing to arm
    const prev = character.session.effectTimers;
    const key = potionTimerKey(itemId);
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          effectTimers: { ...(prev ?? {}), [key]: { roundsLeft: rounds } },
        },
      },
    });
    // Undo restores the EXACT prior timers map (undefined → drop the field), so
    // undoing the drink reverts the armed countdown atomically.
    return () => {
      const cur = get().character;
      if (!cur) return;
      set({
        character: {
          ...cur,
          session: {
            ...cur.session,
            ...(prev === undefined
              ? { effectTimers: undefined }
              : { effectTimers: prev }),
          },
        },
      });
    };
  },

  advanceEffectTimers: () => {
    const noop = { expired: [] as ReadonlyArray<never>, restore: () => {} };
    if (get().readonly) return noop;
    const character = get().character;
    if (!character) return noop;
    const { timers, expired } = advanceEffectTimersEngine(character);
    // Snapshot for undo BEFORE mutating: prior timers + active toggles + the log
    // entries the expiry appends, so Undo-End-Turn reverts the whole step.
    const priorTimers = character.session.effectTimers;
    const priorActive = character.session.activeFeatures ?? [];
    // Drop each expired state's toggle (every while-active grant retracts) and
    // emit its expiry log line.
    const nextActive = priorActive.filter((k) => !expired.some((e) => e.activeKey === k));
    set({
      character: {
        ...character,
        session: {
          ...character.session,
          effectTimers: timers,
          activeFeatures: nextActive,
        },
      },
    });
    const logIds: (string | null)[] = expired.map((e) =>
      get().logEvent({ kind: "effect-expired", sourceId: e.sourceId })
    );
    const restore = () => {
      // Remove the expiry log lines FIRST (each its own `set`), THEN read fresh
      // state for the timer/toggle restore — reading `cur` before `removeLogEntry`
      // and setting after would re-write the just-removed log line back.
      logIds.forEach((id) => get().removeLogEntry(id));
      const cur = get().character;
      if (!cur) return;
      set({
        character: {
          ...cur,
          session: {
            ...cur.session,
            // Restore the EXACT prior timers (undefined → drop the field) +
            // active toggles, so the round-counter + state return identically.
            ...(priorTimers === undefined
              ? { effectTimers: undefined }
              : { effectTimers: priorTimers }),
            activeFeatures: priorActive,
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
    const sources = resolveAllGrantSources(charData);
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
    const revert = revertBuildFromPrior(form.prior);
    // Restore the body, retract the Beast Temp HP, drop the form. Clear the form's
    // concentration inline (only if it is still the form's spell — a prior swap
    // would already have retracted the form) so the drop is one atomic step.
    const clearConc = character.session.concentration === form.spellId;
    const { polymorphForm: _dropped, ...restSession } = character.session;
    void _dropped;
    set({
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

    return () => set({ character: before });
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
      resolveAllGrantSources(character.character),
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
    if (!character) return () => {};
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
