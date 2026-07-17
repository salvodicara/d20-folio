/**
 * Combat Store
 *
 * Manages the combat turn system under the **immediate-commit-per-action**
 * model (owner's binding decision — see memory `combat-commit-model`). Using an
 * action deducts its resource RIGHT THEN (the deduction + reverse-applier live
 * in `combat.tsx`); this store tracks which action occupies each economy slot
 * THIS TURN (for the economy display + tap-to-undo) and the reaction state.
 * `endTurn` is pure bookkeeping — advance the round, clear the turn's display,
 * refresh the reaction. The old batch "select now, deduct on End Turn" flow
 * (and its #1 failure mode, forgetting to press End Turn) is gone.
 *
 * Economy model (B6 — COUNTS, not single occupants):
 * - Action slot: a LIST of actions committed this turn (0..`budget.action`).
 *   The default budget is 1; an active extra-action source (Fighter Action
 *   Surge → +1 action; Haste → +1 limited action) RAISES it for the turn, so a
 *   second action can be committed while budget remains ("Action 1/2").
 * - Bonus slot: the same — a list, default budget 1.
 * - Free slot: actions that don't consume A/B (e.g. the Action Surge free
 *   action itself) — unbounded (no budget cap), kept as a list for symmetry.
 * - Reaction: tracked separately (also immediate-commit).
 *
 * The per-turn `budget` is DERIVED from the active features by the economy
 * provider (`extraActionsThisTurn`) and pushed in via `setBudget` — it is NEVER
 * persisted (only round/initiative persist), so it tracks the live active set
 * and resets implicitly when a source toggle drops.
 *
 * Outside combat (Spells/Features/Equipment pages), changes are immediate
 * with their own undo — that logic lives in the character store + toast store.
 */

import { create } from "zustand";
import type { TrackerUnit } from "@/data/types";
import { useCharacterStore } from "@/stores/characterStore";

/**
 * Read-only backstop (P10 glass case): a member/DM/admin viewer loads the sheet
 * with the character store's `readonly` flag set, and every PLAYER-driven combat
 * mutation must be a no-op there — exactly like the characterStore's own guards.
 * Only the user-driven mutators check it; hydration/display setters (setRound,
 * setInitiative, endCombat, setBudget) stay open so the viewer can MIRROR the
 * member's persisted state. Read lazily inside the action bodies, so the
 * characterStore↔combatStore module cycle never dereferences during evaluation.
 */
const sheetReadonly = (): boolean => useCharacterStore.getState().readonly;

export type EconomySlot = "action" | "bonus" | "free";

/** A selected combat action (spell, attack, feature use, etc.) */
export interface SelectedAction {
  id: string;
  /** Display name */
  name: string;
  /** Which economy slot this occupies */
  slot: EconomySlot;
  /**
   * The "Attack" GROUP entry marker (attack-pips model). An Attack action holds
   * `attackBudget` weapon/cantrip swings; ONE group entry occupies the Action slot
   * per Attack action taken (a 2nd opens only under Action Surge). The individual
   * swings are NOT listed — they are counted in `attacksUsed`. Flagged so undo can
   * release the exact group entry when a swing crosses back over a budget multiple.
   */
  isAttackGroup?: boolean;
  /** What resource this action consumed when used (deducted immediately). */
  cost?: {
    type: "spell-slot" | "tracker" | "equipment" | "none";
    /** Spell slot level, tracker ID, or equipment key */
    key?: string | number;
    /**
     * How many tracker uses to consume (for multi-point abilities).
     * Defaults to 1 if omitted.
     */
    trackerAmount?: number;
    /** Whether the tracker is a pool resource (needs spend-amount prompt) */
    isPool?: boolean;
    /** Stable pool unit token (localized at the render boundary). */
    poolUnit?: TrackerUnit;
  };
}

/** The economy slots that carry a per-turn BUDGET (free is uncapped). */
export type BudgetedSlot = "action" | "bonus";

/** Extra economy slots THIS turn beyond the default 1 of each (B6). */
export interface SlotBudget {
  /** Total ACTION slots available this turn (1 + active extra-action sources). */
  action: number;
  /** Total BONUS slots available this turn (1 + active extra-action sources). */
  bonus: number;
}

const DEFAULT_BUDGET: SlotBudget = { action: 1, bonus: 1 };

interface CombatState {
  /** Current round number */
  round: number;
  /** Initiative roll value */
  initiative: string;
  /**
   * Actions committed into each economy slot THIS turn (B6 — COUNTS not single
   * occupants). A slot holds a LIST: the default budget is 1, but an active
   * extra-action source lets a 2nd action sit alongside the first ("Action 1/2").
   * Empty array = the slot is open.
   */
  selected: {
    action: SelectedAction[];
    bonus: SelectedAction[];
    free: SelectedAction[];
  };
  /**
   * B6 — the per-turn economy budget: how many ACTION / BONUS slots are
   * available this turn (default 1 each; raised by an active extra-action
   * source). DERIVED from the active features by the economy provider and pushed
   * in via `setBudget` — NEVER persisted (only round/initiative persist).
   */
  budget: SlotBudget;
  /**
   * ATTACK-PIPS — how many weapon/cantrip swings a SINGLE Attack action holds
   * (`attacksPerAction`: Fighter L5 → 2, L11 → 3, …; 1 = no Extra Attack). DERIVED
   * from the active grants by the economy provider and pushed via `setAttackBudget`
   * — NEVER persisted (resets to 1 at the turn boundary, re-derived for the new
   * turn). At 1 (most characters) the attack-pips model is inert: every attack
   * commits through the ordinary single-slot economy, zero behavioural delta.
   */
  attackBudget: number;
  /**
   * ATTACK-PIPS — total attack swings committed THIS turn across every Attack
   * action taken (a fresh Attack action opens under Action Surge). The current
   * action's progress is `attacksUsed % attackBudget`; a completed action is a
   * multiple of `attackBudget`. Resets each turn alongside the economy.
   */
  attacksUsed: number;
  /**
   * ATTACK-PIPS — the action ids of the attack-capable cards that RODE a swing
   * this turn (a weapon attack or a War-Magic cast taken as the Attack action).
   * Only ever populated when `attackBudget > 1`: at budget 1 a lone attack claims
   * the Action slot through the ordinary economy and is its own `selected.action`
   * occupant. This is the CTA grammar's OCCUPANT ledger for the Attack group — once
   * the action is fully swung, every card whose id appears here keeps the gold ring
   * (the "which card spent the token" legibility), while the rest of the group merely
   * greys to "Used". One id is pushed per committed swing and popped per `undoAttackSwing`.
   */
  attackSwingIds: string[];
  /** Whether reaction has been used this round */
  reactionUsed: boolean;
  /**
   * The action id of the reaction that spent the round's Reaction — the CTA
   * grammar's OCCUPANT for the Reaction group. Every reaction card greys to
   * "Used" once `reactionUsed` is set, but only the card whose id matches keeps
   * the recessed chip + gold ring (the off-list "Mark used" row uses
   * `"manual-reaction"`). `null` while the reaction is un-spent. Turn-scoped,
   * never persisted (only round/initiative persist).
   */
  reactionUsedId: string | null;
  /** Movement spent this turn, in feet (the move-bar depletes by 5-ft segments). */
  movementUsedFt: number;
  /**
   * RA-09 — Dash commits this turn. Each Dash (2024 "Dash [Action]") grants extra
   * movement equal to your Speed, so the turn's movement budget is
   * `speed × (1 + dashesThisTurn)`. Turn-scoped (resets at every turn/round
   * boundary alongside `movementUsedFt`), NOT persisted — re-derived like the
   * economy budget. The same seam serves future speed riders (Tactical Shift,
   * Cunning-Strike speed) via `commitDash`.
   */
  dashesThisTurn: number;
  /**
   * RA-08 — the number of spell SLOTS expended to cast a spell THIS turn (2024
   * "Casting Spells": "On a turn, you can expend only one spell slot to cast a
   * spell"). Counts slot-paid casts only — NOT cantrips, NOT free/at-will casts.
   * Turn-scoped, NOT persisted. When it exceeds 1 the "what's limiting you"
   * banner surfaces an ADVISORY (never a hard block — override-first).
   */
  spellSlotCastsThisTurn: number;
  /**
   * Whether the character's HP was REDUCED since the start of this round
   * (auto-detected from the session HP setter). Per 2024 RAW it MAINTAINS a
   * Rage-style state ("you took damage"), so the End-Turn maintenance check
   * treats a hit round as maintained — zero extra taps. Resets each round
   * alongside `reactionUsed` / `movementUsedFt`.
   */
  damageTakenThisRound: boolean;

  // Actions
  setRound: (round: number) => void;
  setInitiative: (value: string) => void;
  /** Set movement used this turn (clamped 0..speed by the caller). */
  setMovementUsed: (ft: number) => void;
  /**
   * RA-09 — commit a Dash: extend this turn's movement budget by one Speed.
   * Returns a restore that decrements it (the action's undo runs it), so a
   * mis-tapped Dash is recoverable. No-op restore when read-only.
   */
  commitDash: () => () => void;
  /**
   * RA-08 — record a slot-paid spell cast this turn (the one-spell-slot-per-turn
   * advisory). Returns a restore that decrements the count (the cast's undo runs
   * it). No-op restore when read-only.
   */
  commitSpellSlotCast: () => () => void;
  /** Record that the character took damage this round (HP went down). */
  noteDamageTaken: () => void;
  /**
   * B6 — set the per-turn economy budget (action/bonus slot counts), DERIVED by
   * the economy provider from the active extra-action sources. No-op when
   * unchanged, so pushing it on every relevant render never churns the store.
   */
  setBudget: (budget: SlotBudget) => void;
  /**
   * ATTACK-PIPS — set the per-turn attack budget (attacks per Attack action),
   * DERIVED by the economy provider from the active grants. No-op when unchanged,
   * so pushing it on every relevant render never churns the store.
   */
  setAttackBudget: (attackBudget: number) => void;
  /**
   * ATTACK-PIPS — commit ONE attack swing (a weapon attack, or a War-Magic cantrip
   * replacing an attack). Only meaningful when `attackBudget > 1` (returns `null`
   * otherwise, so the caller falls back to the ordinary economy). Starting a new
   * Attack action (`attacksUsed` at a budget multiple) CLAIMS an Action slot via
   * the `groupEntry` — returns `null` when no Action slot is free (the whole Attack
   * action is spent). A subsequent swing RIDES the open Attack action without
   * claiming a slot. `attacksUsed` increments on every committed swing. Returns
   * `"new-group"` when it claimed a slot, `"rode"` when it rode an open action.
   */
  commitAttackSwing: (
    groupEntry: SelectedAction,
    swingActionId: string
  ) => "new-group" | "rode" | null;
  /**
   * ATTACK-PIPS — reverse the most recent attack swing (the per-swing undo toast):
   * decrement `attacksUsed`, and release the LAST Attack-group entry from the Action
   * slot when the decrement drops below the number of groups the remaining swings
   * need (i.e. it crossed back over a budget multiple). Order-independent — it
   * reconciles the group count to `ceil(attacksUsed / attackBudget)`, so undoing
   * swings in any order can never strand a group entry.
   */
  undoAttackSwing: () => void;
  /**
   * Commit an action into its economy slot (B6 — APPENDS to the slot's list).
   * Budgeted slots (action/bonus) append only while a slot remains free
   * (`length < budget`); the free slot is uncapped. A re-commit of the SAME id is
   * idempotent (never double-listed). Returns whether the action was appended.
   */
  selectAction: (action: SelectedAction) => boolean;
  /** Deselect ALL actions in a given slot (clears the slot's list). */
  deselectSlot: (slot: EconomySlot) => void;
  /** Deselect a specific action by ID (finds its slot automatically) */
  deselectAction: (actionId: string) => void;
  /**
   * Mark reaction as used for this round (immediate commit, not queued). `id` is
   * the spending reaction's action id — recorded as `reactionUsedId` so its card
   * keeps the occupant ring while the rest of the group greys to "Used".
   */
  useReaction: (id: string) => void;
  /** Undo reaction use — resets reactionUsed without touching selections */
  resetReaction: () => void;
  /** Reset turn without advancing round (clear selections for undo) */
  resetTurn: () => void;
  /**
   * End combat — return it to baseline: round → 1, re-arm the economy (clear
   * selections + reaction), refill movement, and CLEAR the initiative roll. The
   * solo "End Combat" band button calls it (behind a confirm); a long rest and a
   * character switch reuse the same baseline. Touches ONLY combat-turn state —
   * never the Action Log, conditions, concentration, HP, or death saves (those
   * live in the character store, so they are untouched by construction). Clearing
   * initiative to "" flows through the SAME persistence subscription any roll edit
   * uses (the sanctioned explicit-clear path → the character's own `combat/state`
   * subdoc); it is never invoked in an encounter (the band hides End Combat there),
   * so it can never echo into shared encounter state.
   */
  endCombat: () => void;
  /**
   * End the turn — PURE BOOKKEEPING (immediate-commit model). Resources are
   * deducted at use-time, not here, so this only advances the round, clears the
   * turn's economy display, and refreshes the reaction. Nothing to "forget":
   * the batch staleness failure mode is gone.
   */
  endTurn: () => void;
}

const emptySelected = (): CombatState["selected"] => ({
  action: [],
  bonus: [],
  free: [],
});

/** How many slots of `slot` the budget allows this turn (free is uncapped). */
function slotCapacity(budget: SlotBudget, slot: EconomySlot): number {
  if (slot === "action") return budget.action;
  if (slot === "bonus") return budget.bonus;
  return Infinity; // free actions are uncapped
}

export const useCombatStore = create<CombatState>()((set, get) => ({
  round: 1,
  initiative: "",
  selected: emptySelected(),
  budget: { ...DEFAULT_BUDGET },
  attackBudget: 1,
  attacksUsed: 0,
  attackSwingIds: [],
  reactionUsed: false,
  reactionUsedId: null,
  movementUsedFt: 0,
  dashesThisTurn: 0,
  spellSlotCastsThisTurn: 0,
  damageTakenThisRound: false,

  setRound: (round) => set({ round }),
  setInitiative: (value) => set({ initiative: value }),
  setMovementUsed: (ft) => {
    if (sheetReadonly()) return;
    set({ movementUsedFt: Math.max(0, ft) });
  },
  commitDash: () => {
    if (sheetReadonly()) return () => {};
    set((s) => ({ dashesThisTurn: s.dashesThisTurn + 1 }));
    return () => set((s) => ({ dashesThisTurn: Math.max(0, s.dashesThisTurn - 1) }));
  },
  commitSpellSlotCast: () => {
    if (sheetReadonly()) return () => {};
    set((s) => ({ spellSlotCastsThisTurn: s.spellSlotCastsThisTurn + 1 }));
    return () =>
      set((s) => ({
        spellSlotCastsThisTurn: Math.max(0, s.spellSlotCastsThisTurn - 1),
      }));
  },
  noteDamageTaken: () => set({ damageTakenThisRound: true }),

  setBudget: (budget) => {
    const cur = get().budget;
    if (cur.action === budget.action && cur.bonus === budget.bonus) return;
    set({ budget });
  },

  setAttackBudget: (attackBudget) => {
    if (get().attackBudget === attackBudget) return;
    set({ attackBudget });
  },

  commitAttackSwing: (groupEntry, swingActionId) => {
    if (sheetReadonly()) return null;
    const { selected, budget, attacksUsed, attackBudget } = get();
    // Guard case: with no Extra Attack the attack-pips model is inert — the caller
    // routes the attack through the ordinary economy instead.
    if (attackBudget <= 1) return null;
    // At a budget multiple the previous Attack action (if any) is complete — this
    // swing STARTS a fresh Attack action and must claim an open Action slot.
    const startsNewGroup = attacksUsed % attackBudget === 0;
    if (startsNewGroup) {
      if (selected.action.length >= slotCapacity(budget, "action")) return null;
      set((state) => ({
        selected: {
          ...state.selected,
          action: [...state.selected.action, groupEntry],
        },
        attacksUsed: state.attacksUsed + 1,
        // Record which card rode this swing (the Attack group's occupant ledger).
        attackSwingIds: [...state.attackSwingIds, swingActionId],
      }));
      return "new-group";
    }
    // Rides the already-open Attack action — no new slot, just one more swing.
    set((state) => ({
      attacksUsed: state.attacksUsed + 1,
      attackSwingIds: [...state.attackSwingIds, swingActionId],
    }));
    return "rode";
  },

  undoAttackSwing: () => {
    if (sheetReadonly()) return;
    const { attacksUsed, attackBudget, selected } = get();
    if (attacksUsed <= 0) return;
    const nextUsed = attacksUsed - 1;
    // Reconcile the Attack-group entries to the count the remaining swings need
    // (order-independent): drop the last group entry when we now have too many.
    const neededGroups = Math.ceil(nextUsed / Math.max(1, attackBudget));
    const groups = selected.action.filter((a) => a.isAttackGroup).length;
    set((state) => {
      let action = state.selected.action;
      if (groups > neededGroups) {
        const lastIdx = action.map((a) => !!a.isAttackGroup).lastIndexOf(true);
        if (lastIdx >= 0) action = action.filter((_, i) => i !== lastIdx);
      }
      return {
        attacksUsed: nextUsed,
        // Pop the last-recorded swing occupant (one id per committed swing).
        attackSwingIds: state.attackSwingIds.slice(0, -1),
        selected: { ...state.selected, action },
      };
    });
  },

  selectAction: (action) => {
    if (sheetReadonly()) return false;
    const { selected, budget } = get();
    const list = selected[action.slot];
    // Idempotent: a re-commit of the same id never double-lists it.
    if (list.some((a) => a.id === action.id)) return false;
    // Budgeted slots append only while a slot remains; free is uncapped.
    if (list.length >= slotCapacity(budget, action.slot)) return false;
    set((state) => ({
      selected: {
        ...state.selected,
        [action.slot]: [...state.selected[action.slot], action],
      },
    }));
    return true;
  },

  deselectSlot: (slot) => {
    if (sheetReadonly()) return;
    set((state) => ({
      selected: { ...state.selected, [slot]: [] },
      // ATTACK-PIPS — clearing the Action slot releases every Attack-group entry,
      // so the swing counter resets WITH it: a re-armed coin re-opens with an EMPTY
      // pip cluster, and the next swing starts a fresh Attack action. (A stranded
      // counter would show fully-lit pips on an open coin and drift on the next
      // swing.) The rearm undo restores the exact prior counter alongside the
      // snapshot it replays.
      ...(slot === "action" ? { attacksUsed: 0, attackSwingIds: [] } : {}),
    }));
  },

  deselectAction: (actionId) => {
    if (sheetReadonly()) return;
    const { selected } = get();
    for (const slot of ["action", "bonus", "free"] as EconomySlot[]) {
      if (selected[slot].some((a) => a.id === actionId)) {
        set((state) => ({
          selected: {
            ...state.selected,
            [slot]: state.selected[slot].filter((a) => a.id !== actionId),
          },
        }));
        return;
      }
    }
  },

  useReaction: (id) => {
    if (sheetReadonly()) return;
    set({ reactionUsed: true, reactionUsedId: id });
  },

  resetReaction: () => {
    if (sheetReadonly()) return;
    set({ reactionUsed: false, reactionUsedId: null });
  },

  resetTurn: () =>
    set({
      selected: emptySelected(),
      budget: { ...DEFAULT_BUDGET },
      attackBudget: 1,
      attacksUsed: 0,
      attackSwingIds: [],
      reactionUsed: false,
      reactionUsedId: null,
      movementUsedFt: 0,
      dashesThisTurn: 0,
      spellSlotCastsThisTurn: 0,
      damageTakenThisRound: false,
    }),

  endCombat: () =>
    set({
      round: 1,
      selected: emptySelected(),
      budget: { ...DEFAULT_BUDGET },
      attackBudget: 1,
      attacksUsed: 0,
      attackSwingIds: [],
      reactionUsed: false,
      reactionUsedId: null,
      movementUsedFt: 0,
      dashesThisTurn: 0,
      spellSlotCastsThisTurn: 0,
      damageTakenThisRound: false,
      initiative: "",
    }),

  endTurn: () => {
    if (sheetReadonly()) return;
    // Pure bookkeeping: advance the round, clear the turn's economy display,
    // refresh the reaction, reset movement. Resources were already committed
    // at use-time. (Reaction refreshes each round per 2024 rules.)
    set((state) => ({
      round: state.round + 1,
      selected: emptySelected(),
      // The budget resets to default at the turn boundary; the economy provider
      // re-derives it from the active features for the new turn (an expired
      // Action Surge toggle has already dropped, so the budget falls back to 1).
      budget: { ...DEFAULT_BUDGET },
      // Attack budget likewise falls back to 1 and is re-derived for the new turn;
      // the swing counter clears (a fresh turn opens a fresh Attack action).
      attackBudget: 1,
      attacksUsed: 0,
      attackSwingIds: [],
      reactionUsed: false,
      reactionUsedId: null,
      movementUsedFt: 0,
      dashesThisTurn: 0,
      spellSlotCastsThisTurn: 0,
      damageTakenThisRound: false,
    }));
  },
}));
