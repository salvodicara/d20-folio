/**
 * TurnEconomyProvider — the SINGLE owner of the cockpit's action-economy commit
 * loop.
 *
 * The action economy is shipped engine behaviour (immediate-commit-per-action
 * with 5s undo; `combatStore` + `characterStore` own every rule). Phase 4 only
 * PROMOTES the turn meter out of the Play tab into the persistent center
 * `ThisTurnTracker`, so the meter (End Turn) and the Play-tab action cards
 * (commit) now live in two different components. To keep ONE source of the
 * per-slot undo refs + ONE End-Turn that finalizes them (no split-brain undo),
 * the commit/undo/End-Turn orchestration is lifted — verbatim — out of `PlayTab`
 * into this provider, which both surfaces consume via `useTurnEconomy()`.
 *
 * It is presentation orchestration only: it READS resolved actions/trackers/
 * conditions from the engine and DISPATCHES the existing store actions
 * (`selectAction` / `useSpellSlot` / `useTracker` / `setConcentration` / …). It
 * never re-derives a D&D rule the engine already computes. The cast-level /
 * variable-spend modals render here once (shared), not per consumer.
 *
 * Render isolation (§7.2): the cockpit mounts this provider as a STABLE memoized
 * region element, so a tab switch never re-renders it; it subscribes only to the
 * character + locale (the values its handlers close over), never to the reactive
 * combat slices — those are read with `getState()` at click time and subscribed
 * by the leaf surfaces (`ThisTurnTracker`, the Play-tab cards).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { validateArcaneRecoveryPlan } from "@/lib/arcane-recovery";
import { useCharacterStore } from "@/stores/characterStore";
import {
  useCombatStore,
  type EconomySlot,
  type SelectedAction,
} from "@/stores/combatStore";
import {
  snapshotTurnEconomy,
  syncCombatFromSession,
  syncCombatTurnContext,
  turnEconomyKey,
} from "@/features/character/center/combat-hydration";
import { useToastStore } from "@/stores/toastStore";
import {
  useUndoStore,
  registerUndoableToast,
  registerUndoableResult,
  MAX_UNDO_DEPTH,
} from "@/stores/undoStore";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { useAuthStore } from "@/stores/authStore";
import { TargetPickerModal } from "@/components/sheet/TargetPickerModal";
import {
  targetStepFor,
  withSelfRecipient,
  type TargetStep,
} from "@/features/character/center/target-step";
import { sheetEncounter } from "@/features/character/center/turn-state";
import { useDamageTrayStore } from "@/features/character/center/damage-tray-store";
import { DamageTray } from "@/features/character/center/DamageTray";
import { damageTrayPlan } from "@/lib/play/damage-tray";
import { useLocale } from "@/hooks/useLocale";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import {
  resolveTrackers,
  resolveActiveMaintainedEffects,
  getActionCostOptions,
  extraActionsThisTurn,
  extraActionRulesThisTurn,
  isTurnEconomyBlocked,
  attacksPerActionForCharacter,
  resolveReplaceAttackWithCast,
  resolveFreeCastFromList,
  castSourceActiveKey,
  isSpellcastingBlocked,
  resolveItemResourceAvailability,
  resolveActiveStateBlocker,
  type ResolvedAction,
  type ActiveMaintainedEffect,
  type ActionCostOption,
  type FreeCastFromListPool,
} from "@/lib/smart-tracker";
import {
  canAssignActionClaims,
  economyActionCategory,
  economyClaimsForTurn,
} from "@/lib/combat-economy";
import type { CombatOutcomeReceipt } from "@/types/combat-outcome";
import type { RiderVM } from "@/lib/views/rider-view";
import type { CunningStrikeVM } from "@/lib/views/cunning-strike-view";
import { concentrationLabel, grantSourceLabel } from "@/lib/views/tracker-view";
import { confirmConcentrationSwap } from "@/features/character/confirm-concentration";
import { isCharacterAlive } from "@/lib/character-status";
import { observedOwnerBoundary } from "./turn-state";
import {
  localizeActions,
  logTypeForAction,
  maxReplaceAttackSpellLevel,
  isPipAttackAction,
} from "@/lib/views/combat-action-view";
import {
  resolveSpellCastOptions,
  resolveMetamagicForCast,
  remainingSorceryPoints,
} from "@/lib/views/spell-cast-sources";
import { PoolSpendModal, type PoolSpendRequest } from "@/components/sheet/PoolSpendModal";
import {
  CastLevelModal,
  type CastLevelOption,
  type MetamagicCastRow,
} from "@/components/sheet/CastLevelModal";
import { castEconomySlot, withMetamagicDuration } from "@/lib/play/metamagic";
import { activateActionState, applyActionConcentration } from "./action-state-commit";
import {
  asRitualAction,
  executionFor,
  TURN_EXECUTION,
  type ActionExecution,
} from "@/lib/play/cast-execution";
import {
  actionPaymentAffordable as actionPaymentAffordableFor,
  actionWithCost,
  bareActionSpend,
  castItemPayment,
  castOptionAffordable as castOptionAffordableFor,
  castOptionSpends,
  castOptionExpendsSpellSlot,
  metamagicAffordable as metamagicAffordableFor,
  paymentAffordable as paymentAffordableFor,
  trackerAffordable,
  type CastCommitOption,
  type CastSpend,
} from "@/lib/play/cast-payment";
import { expendedSlotLevel, onCastRegains } from "@/lib/play/on-cast";
import {
  castReadiesSpell,
  READIED_SPELL_REACTION_ID,
  readiedHold,
  readiedSpellExpires,
  readiedTargets,
  releaseKeepsConcentration,
} from "@/lib/play/ready";
import { getSpellById } from "@/data/spells";
import { buildCastOptions, slotUsageKey } from "@/lib/cast-options";
import { itemResourceSpend } from "@/lib/item-resource-commands";
import { actionAtCastLevel } from "@/lib/cast-resolution";
import { applyCastSourceOverridesToAction } from "@/lib/cast-source-profile";
import { PaymentPickerModal } from "@/components/sheet/PaymentPickerModal";
import {
  ArcaneRecoveryModal,
  type ArcaneRecoveryRequest,
} from "@/components/sheet/ArcaneRecoveryModal";
import { DivineInterventionModal } from "@/components/sheet/DivineInterventionModal";
import { localizeSrd } from "@/i18n/resolver";
import { classEntryLevel, totalLevel } from "@/lib/classes";
import {
  TurnEconomyContext,
  getEconomySlot,
  type TurnEconomyApi,
  type PreparedCommit,
  type ExecuteActionIntent,
} from "./useTurnEconomy";
import {
  createItemResourcePaymentCycle,
  useOptionalItemResourceCommands,
} from "./useItemResourceCommands";
import { advanceSharedTurn } from "./turn-state";
import { advanceSoloWorldTurn } from "./solo-world-turn";
import { isCustomSpell, type SrdSpellRef } from "@/types/character";
import {
  advanceGlobalCombat,
  syncPipToStatus,
} from "@/features/campaigns/combat-reconcile";

/** The Wizard Arcane Recovery feature's stable srdId (its tracker id too). */
const ARCANE_RECOVERY_FEATURE_ID = "wizard-arcane-recovery";

/** Turn facts whose mutation must survive a route change. Derived budgets/initiative are
 * intentionally excluded. Reference equality is sufficient because every store mutation
 * replaces the touched array. */
function durableTurnChanged(
  state: ReturnType<typeof useCombatStore.getState>,
  prev: ReturnType<typeof useCombatStore.getState>
): boolean {
  return (
    state.selected !== prev.selected ||
    state.attacksUsed !== prev.attacksUsed ||
    state.attackSwings !== prev.attackSwings ||
    state.outcomeReceipts !== prev.outcomeReceipts ||
    state.outcomeOrdinal !== prev.outcomeOrdinal ||
    state.reactionUsed !== prev.reactionUsed ||
    state.reactionUsedId !== prev.reactionUsedId ||
    state.reactionOutcomeOccurrenceId !== prev.reactionOutcomeOccurrenceId ||
    state.movementUsedFt !== prev.movementUsedFt ||
    state.dashesThisTurn !== prev.dashesThisTurn ||
    state.spellSlotCastsThisTurn !== prev.spellSlotCastsThisTurn ||
    state.spellSlotCastTurnKey !== prev.spellSlotCastTurnKey ||
    state.damageTakenThisRound !== prev.damageTakenThisRound ||
    state.nextAttackAdvantage !== prev.nextAttackAdvantage ||
    state.movementLocked !== prev.movementLocked
  );
}

/** The Rogue Sneak Attack feature's stable srdId — its once-per-turn use tracker
 *  is the resource a Cunning Strike option debits (golden rule 7 — a stable id). */
const SNEAK_ATTACK_TRACKER_ID = "rogue-sneak-attack";

/**
 * The readied spell is lost at the start of your next turn: Concentration on it ends
 * (logged). Returns the lost spell and the exact inverse, or null when nothing was
 * held or due.
 */
function expireReadiedHold(round: number): { spell: string; restore: () => void } | null {
  const cs = useCharacterStore.getState();
  const doc = cs.character;
  if (!doc || cs.readonly || !readiedSpellExpires(doc.session, round)) return null;
  const spell = doc.session.concentration;
  let restoreConcentration: (() => void) | undefined;
  const logIds = cs.setConcentration("", {
    undoable: false,
    captureUndo: (undo) => {
      restoreConcentration = undo;
    },
  });
  return {
    spell,
    restore: () => {
      restoreConcentration?.();
      const current = useCharacterStore.getState();
      for (const id of logIds) current.removeLogEntry(id);
    },
  };
}

export function TurnEconomyProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const itemResourceCommands = useOptionalItemResourceCommands();
  const character = useCharacterStore((s) => s.character);
  const appendSelectedAction = useCombatStore((s) => s.selectAction);
  const deselectAction = useCombatStore((s) => s.deselectAction);
  const setBudget = useCombatStore((s) => s.setBudget);
  const setAttackBudget = useCombatStore((s) => s.setAttackBudget);
  const markReactionUsed = useCombatStore((s) => s.useReaction);
  const resetReaction = useCombatStore((s) => s.resetReaction);
  const endTurn = useCombatStore((s) => s.endTurn);
  const showToast = useToastStore((s) => s.showToast);

  /** A delayed picker/target review is only a proposal. Re-read the canonical
   * lifecycle immediately before every mutation so dying between review and
   * Apply cannot spend resources or claim economy. */
  function lifeStateBlockMessage(): string | null {
    const live = useCharacterStore.getState().character;
    return live && !isCharacterAlive(live.status, live.session)
      ? t("combat.blockedReasonDead")
      : null;
  }

  function guardLifeState(): boolean {
    const message = lifeStateBlockMessage();
    if (!message) return true;
    showToast({ message, duration: 2500 });
    return false;
  }

  /** Shared live-state gate for deterministic action restrictions. Cards render
   * the same reason, while every commit entry point repeats the guard so stale
   * UI and prepared target flows cannot bypass it. */
  function actionStateBlockMessage(action: ResolvedAction): string | null {
    const lifecycleBlock = lifeStateBlockMessage();
    if (lifecycleBlock) return lifecycleBlock;
    const committed = Object.values(useCombatStore.getState().selected).flat();
    if (
      action.requiresActionThisTurn &&
      !committed.some((entry) => entry.id === action.requiresActionThisTurn)
    ) {
      return t("combat.blockedReasonPrerequisiteAction");
    }
    if (
      action.requiresActionCategoryThisTurn &&
      !committed.some(
        (entry) => entry.economyCategory === action.requiresActionCategoryThisTurn
      )
    ) {
      return t("combat.blockedReasonPrerequisiteCategory");
    }
    if (
      action.maxUsesPerTurn !== undefined &&
      committed.filter((entry) => entry.id === action.id).length >= action.maxUsesPerTurn
    ) {
      return t("combat.blockedReasonPerTurnLimit");
    }
    const live = useCharacterStore.getState().character;
    if (!live) return null;
    const slot = getEconomySlot(action);
    if (
      slot !== "free" &&
      resolveConditionEffects(effectiveSessionConditions(live.session)).blockedSlots.has(
        slot
      )
    ) {
      return t("combat.slotBlockedByCondition");
    }
    if (action.locksMovement && useCombatStore.getState().movementUsedFt > 0) {
      return t("combat.blockedReasonAlreadyMoved");
    }
    if (action.source === "spell" && isSpellcastingBlocked(live)) {
      return t("combat.blockedReasonSpellcasting");
    }
    switch (resolveActiveStateBlocker(live, action)) {
      case "heavy-armor":
        return t("combat.blockedReasonHeavyArmor");
      case "incapacitated":
        return t("combat.blockedReasonIncapacitated");
      default:
        return null;
    }
  }

  function canUseCharacter(characterId: string | undefined): boolean {
    const live = useCharacterStore.getState();
    return live.character !== null && live.character.id === characterId && !live.readonly;
  }

  function guardActionState(action: ResolvedAction): boolean {
    if (!canUseCharacter(character?.id)) return false;
    if (action.source === "spell" || action.castPoolSourceId)
      return useCharacterStore.getState().character !== null;
    const message = actionStateBlockMessage(action);
    if (!message) return true;
    showToast({ message, duration: 2500 });
    return false;
  }

  function currentTurnKey(): string | null {
    const doc = useCharacterStore.getState().character;
    if (!doc) return null;
    const combat = useCombatStore.getState();
    return turnEconomyKey(useCombatStatusStore.getState().status, doc.id, combat.round);
  }

  function spellSlotExpenditureCount(): number {
    const key = currentTurnKey();
    if (!key) return 0;
    const combat = useCombatStore.getState();
    return combat.spellSlotCastTurnKey === key ? combat.spellSlotCastsThisTurn : 0;
  }

  function spellSlotExpenditureAvailable(): boolean {
    return spellSlotExpenditureCount() < 1;
  }

  function commitSpellSlotExpenditure(): (() => boolean) | null {
    const key = currentTurnKey();
    return key ? useCombatStore.getState().commitSpellSlotCast(key) : null;
  }

  function showSpellSlotExpenditureLimit(): void {
    showToast({
      message: t("combat.limiterSpellSlotLimit", {
        n: spellSlotExpenditureCount(),
      }),
      duration: 2500,
    });
  }

  // Pool-spend prompt state. Ordinary variable-cost actions commit after the
  // amount; dice-healing pools configure their concrete roll first, then rejoin
  // the shared target resolver before any resource is spent.
  const [poolSpendRequest, setPoolSpendRequest] = useState<PoolSpendRequest | null>(null);
  const [pendingPoolSpend, setPendingPoolSpend] = useState<
    | {
        kind: "commit";
        characterId: string | undefined;
        action: ResolvedAction;
        slot: EconomySlot;
        execution: ActionExecution;
      }
    | {
        kind: "prepare";
        characterId: string | undefined;
        action: ResolvedAction;
        onPrepared: (action: ResolvedAction, commit: PreparedCommit) => void;
      }
    | null
  >(null);
  // Per-COMMIT reverse-appliers live on the session UNDO STACK (`undoStore`) —
  // one entry per act (a slot commit, an attack swing, a reaction), each
  // individually undoable via the toast / the topbar control / ⌘Z. An entry
  // survives its 5s toast (the stack is its durable home) and is fenced on End
  // Turn / turn-start / character switch (§1.4). ONE reverse-applier per act,
  // referenced by every surface — no private ref map (golden rule 6).
  // Rich in-combat casting: a spell with >1 cast option (upcast / free-cast)
  // opens this picker (the same CastLevelModal the Spells page uses), then
  // commits the chosen option immediately.
  const [targetRequest, setTargetRequest] = useState<{
    characterId: string | undefined;
    action: ResolvedAction;
    step: TargetStep;
    commit: PreparedCommit;
  } | null>(null);
  const [castRequest, setCastRequest] = useState<{
    characterId: string;
    action: ResolvedAction;
    slot: EconomySlot;
    baseLevel: number;
    options: CastLevelOption[];
    metamagic?: MetamagicCastRow[];
    sorceryRemaining?: number;
    execution: ActionExecution;
    // ATTACK-PIPS — this cast REPLACES one attack of the in-progress Attack action
    // (War Magic): the confirmed option consumes an attack pip instead of a fresh
    // Action slot. The picker itself is the SAME modal (rule 6 — Metamagic/upcast
    // choices surface on a pip swing exactly as on any other cast).
    ridesPip?: boolean;
    // S12c — the spell's structured damage facts so each slot row previews the
    // dice it deals at that level (Fireball L5 → "10d6").
    upcast?: {
      level: number;
      damageDice?: string;
      damageDicePerUpcast?: string;
      healDice?: string;
      healDicePerUpcast?: string;
      instances?: number;
      instancesPerUpcast?: number;
      secondaryDamage?: {
        dice: string;
        damageType: string;
        dicePerUpcast?: string;
        resolution?: "attack" | "save" | "automatic";
        area?: boolean;
        damageOnSave?: "half";
        damageOnMiss?: "half";
      };
    };
    /** Target resolution requested this configuration first. When present, choosing
     * a row prepares the final action instead of spending it immediately. */
    onConfigured?: (
      action: ResolvedAction,
      option: CastCommitOption,
      metamagicIds: ReadonlyArray<string>
    ) => void;
  } | null>(null);

  // S4 — Arcane Recovery: tapping the 1/LR action opens a guided cap-enforcing
  // picker (instead of committing a bare tracker spend), then restores the chosen
  // slots + debits the use in one undoable flow.
  const [arcaneRecoveryRequest, setArcaneRecoveryRequest] = useState<
    (ArcaneRecoveryRequest & { characterId: string }) | null
  >(null);

  // S6 — alternate-payment: an action with MORE THAN ONE legal way to pay (a
  // declared `alternateCost`) opens this picker (the same `.cl-opts` recipe), then
  // commits the chosen payment immediately with undo. The engine
  // (`getActionCostOptions`) enumerates every payment; the player picks.
  const [paymentRequest, setPaymentRequest] = useState<{
    characterId: string | undefined;
    execution: ActionExecution;
    action: ResolvedAction;
    slot: EconomySlot;
    options: ActionCostOption[];
  } | null>(null);

  // D4 — Cleric Divine Intervention: tapping the 1/LR action opens a guided picker
  // over the Cleric spell list ≤ 5th (the engine-resolved pool); choosing a spell
  // casts it without a slot and debits the 1/LR tracker (immediate-commit-with-undo).
  const [freeCastFromListRequest, setFreeCastFromListRequest] = useState<{
    characterId: string;
    pool: FreeCastFromListPool;
    opener: ResolvedAction;
    onPrepared: (action: ResolvedAction, commit: PreparedCommit) => void;
  } | null>(null);

  // USE-APPLIES (Task 2) — active `maintained` states (Rage) flagged at End Turn
  // because their maintenance condition wasn't met this round. Rendered as a
  // keep/end banner on the turn meter; default is to STAY active (override-first).
  const [maintenancePrompts, setMaintenancePrompts] = useState<ActiveMaintainedEffect[]>(
    []
  );

  // COMBAT-DUP — the turn meter (`ThisTurnTracker`) now lives INSIDE the Play
  // tab, which unmounts on a tab switch, so the combat bookkeeping it used to own
  // is lifted HERE, to the PERSISTENT economy provider that wraps the whole tabs
  // region and never unmounts mid-session. That move is what lets the in-progress
  // turn survive leaving and returning to Play: the hydrate-once guard lives on a
  // component that doesn't remount, so coming back to Play re-reads the still-
  // intact combatStore instead of re-hydrating (and resetting) it. The character
  // binding itself lives in combatStore, so the same guarantee also survives leaving
  // the cockpit route for the campaign hub and returning before End Turn.
  //
  // Sync combatStore from the persisted session on every snapshot (the payload
  // arrives async from Firestore, so this keys on the character — not the mount).
  // A FRESH character resets + seeds round/initiative hydrate-once; a LATER snapshot
  // of the SAME character reconciles the cross-client INITIATIVE (issue #41 — a
  // remotely-edited roll must re-sync onto the open sheet, never stay stale until
  // reload) while the solo round bookkeeping stays put. Both cases route through the
  // one shared policy (`syncCombatFromSession`); no extra listener (golden rule 24).
  // The target resolver can finish before an upcast/payment picker. Hold its reviewed
  // consequences until the action truly commits; cancelling a later picker therefore
  // spends and applies nothing. Only one modal flow can be active at a time.
  type ResolutionUndo = () => void;
  type ResolutionApply = () => ResolutionUndo | undefined;
  type PendingResolution = {
    actionId: string;
    apply: ResolutionApply;
    occurrenceId?: string;
    outcomes: ReadonlyArray<CombatOutcomeReceipt>;
    targets?: ReadonlyArray<string>;
  };
  const pendingResolutionRef = useRef<PendingResolution | null>(null);
  const pendingResolutionFor = (action: ResolvedAction): PendingResolution | null => {
    const pending = pendingResolutionRef.current;
    return pending?.actionId === action.id ? pending : null;
  };
  const clearPendingResolution = (action: ResolvedAction): void => {
    const pending = pendingResolutionRef.current;
    if (!pending || pending.actionId !== action.id) return;
    pendingResolutionRef.current = null;
  };
  const withResolutionUndo = (
    undoAction: () => void,
    pendingResolution: PendingResolution | null,
    beforeUndo?: () => boolean
  ): (() => boolean) => {
    const undoResolution = pendingResolution?.apply();
    return () => {
      if (beforeUndo && !beforeUndo()) return false;
      undoResolution?.();
      undoAction();
      return true;
    };
  };
  useEffect(() => {
    if (!character) return;
    const characterStore = useCharacterStore.getState();
    const key = turnEconomyKey(
      useCombatStatusStore.getState().status,
      character.id,
      characterStore.combatRound
    );
    const fresh = syncCombatFromSession(
      character.id,
      // The SOLO round now lives in the `combat/state` subdoc, mirrored onto the character
      // store as `combatRound` (the session no longer carries it); initiative reconciles
      // from the same subdoc via `session.initiative`.
      characterStore.combatRound,
      character.session.initiative,
      characterStore.combatTurnEconomy,
      key,
      locale
    );
    if (fresh) {
      // Switching characters finalizes the previous character's turn: clear the
      // undo stack (dismissing its live toasts) and REBIND it to the new character,
      // so a stale reverse-applier from character A can never fire against character
      // B (whose resources/log it would corrupt) — the §1.4 character-switch fence.
      useUndoStore.getState().clear(character.id);
    }
  }, [character, locale]);

  // COMBAT-DUP — persist round / initiative back to the `combat/state` subdoc whenever
  // combat advances. A NON-reactive store subscription (not a selector) so this provider
  // never re-renders on a combat tick: §7.2 render-isolation holds (the meter + the Play
  // cards own their own combat subscriptions; the HUDs are untouched). Both round and
  // initiative now share the subdoc as their sole persisted home (round moved off the
  // parent doc), so each persists through its dedicated combat-state write.
  useEffect(() => {
    return useCombatStore.subscribe((state, prev) => {
      const turnChanged = durableTurnChanged(state, prev);
      if (
        state.round === prev.round &&
        state.initiative === prev.initiative &&
        !turnChanged
      )
        return;
      const cs = useCharacterStore.getState();
      if (!cs.character) return;
      // Round + current-turn economy share one write. The exact turn key fences the
      // snapshot from every later actor/round while keeping group↔sheet navigation stable.
      if (state.round !== prev.round || turnChanged) {
        const key = turnEconomyKey(
          useCombatStatusStore.getState().status,
          cs.character.id,
          state.round
        );
        cs.persistCombatTurnState(state.round, snapshotTurnEconomy(state, key));
      }
      // Initiative: mirror onto the session (its in-memory home) + persist op-wise to the
      // subdoc (only when it actually changed, so a round-only step costs no init write).
      if (state.initiative !== prev.initiative) {
        cs.updateSession({ initiative: state.initiative });
        cs.persistInitiative();
      }
    });
  }, []);

  // C5 — reconcile the ledger's ENCOUNTER + OWN-TURN identity at mount and on every
  // shared-status update. The identity lives in combatStore, so a provider remount can
  // distinguish "returned during the same turn" (preserve) from "a whole turn cycle /
  // encounter end happened while away" (reset). This one subscription replaces the old
  // component-local turn-start and encounter-end detectors. On a detected boundary it
  // also finalizes the just-ended turn's undo machinery: PURGE the turn-scoped entries
  // (dismissing their lingering toasts) — the economy they reversed was reset by the
  // DM-driven turn cycle, so un-committing a last-turn action would refund resources
  // while its slot-legs no-op (an asymmetric half-undo). Character-state entries (HP,
  // conditions) SURVIVE: their reverse-appliers don't touch the per-turn economy
  // (§1.4 encounter turn-start / encounter end).
  useEffect(() => {
    const initialStatus = sheetEncounter(
      useCombatStatusStore.getState().status,
      useCharacterStore.getState().character?.id ?? null
    );
    if (initialStatus) {
      // Hydration/reload may happen after the shared pointer already crossed the
      // boundary. The persisted round+phase makes this idempotent and prevents a
      // missed offline turn-start from leaving a stale Shield active.
      useCharacterStore
        .getState()
        .expireEffectBoundaries(observedOwnerBoundary(initialStatus));
    } else {
      useCharacterStore.getState().expireEffectBoundaries({
        round: useCombatStore.getState().round,
        phase: "turn-start",
      });
    }
    const announceLostHold = (round: number): void => {
      const lost = expireReadiedHold(round);
      if (!lost) return;
      showToast({
        message: t("combat.readiedSpellLostToast", {
          name: concentrationLabel(lost.spell, locale),
        }),
        duration: 4000,
      });
    };
    // A hold whose turn start passed while the sheet was closed is already lost.
    if (!initialStatus) announceLostHold(useCombatStore.getState().round);
    const reconcile = (
      status: ReturnType<typeof useCombatStatusStore.getState>["status"]
    ): void => {
      const openId = useCharacterStore.getState().character?.id ?? null;
      const scoped = sheetEncounter(status, openId);
      const result = syncCombatTurnContext(scoped);
      if (result === null) return;
      useUndoStore.getState().purgeTurnScoped();
      if (result === "encounter-ended") {
        // The fight is over: every "until your next turn" state (Shield) ends with it.
        // Its turn edge was counted in the encounter's rounds, and the solo engine
        // restarts at round 1, so it would otherwise linger for the fight's length.
        const { expired } = useCharacterStore.getState().expireEffectBoundaries({
          round: Number.MAX_SAFE_INTEGER,
          phase: "turn-end",
        });
        for (const effect of expired) {
          showToast({
            message: t("combatLog.effectExpired", {
              name: grantSourceLabel(effect.sourceId, locale),
            }),
            duration: 4000,
          });
        }
        // Surprise belongs to the fight that just ended.
        useCharacterStore
          .getState()
          .dispatch({ kind: "set-surprised", surprised: false });
        return;
      }
      // A turn start inside the fight.
      if (scoped) {
        // Engine effect spans: a boundary crossing expires until-your-next-turn
        // effects (Shield's AC bonus, …) and surfaces each expiry as a toast.
        const boundaryExpiry = useCharacterStore.getState().expireEffectBoundaries({
          round: scoped.round,
          phase: "turn-start",
        });
        // A readied spell is lost at the start of your next turn.
        announceLostHold(scoped.round);
        // Round countdowns (Rage, 1-minute spells) count the turn that just ended even
        // when the DM advanced past it: catch the previous round up, once — a round
        // already counted by the owner's End Turn is left alone.
        const timerExpiry =
          scoped.round > 1
            ? useCharacterStore.getState().advanceEffectTimers(scoped.round - 1).expired
            : [];
        for (const effect of [...boundaryExpiry.expired, ...timerExpiry]) {
          showToast({
            message: t("combatLog.effectExpired", {
              name: grantSourceLabel(effect.sourceId, locale),
            }),
            duration: 4000,
          });
        }
      }
    };
    reconcile(useCombatStatusStore.getState().status);
    return useCombatStatusStore.subscribe((s) => reconcile(s.status));
  }, [character?.id, locale, showToast, t]);

  // B6 — derive the per-turn ACTION/BONUS budget from the active extra-action
  // sources (Fighter Action Surge → +1 action; Haste → +1 limited action) and
  // push it into the combatStore, so the meter shows "Action 1/2" and a 2nd
  // commit succeeds while budget remains. DERIVED (never persisted): it re-runs
  // when the active-feature set changes (committing Action Surge lights its
  // while-active toggle; the End-Turn timer expiry drops it). `setBudget` no-ops
  // when unchanged, so this never churns the store.
  useEffect(() => {
    if (!character) {
      setBudget({ action: 1, bonus: 1 });
      setAttackBudget(1);
      return;
    }
    if (isTurnEconomyBlocked(character)) {
      setBudget({ action: 0, bonus: 0 });
      setAttackBudget(0);
      return;
    }
    const extra = extraActionsThisTurn(character);
    setBudget({ action: 1 + extra.action, bonus: 1 + extra.bonus });
    // EXTRA ATTACK — the same provider seam pushes the attacks-per-Attack-action
    // budget so a weapon/War-Magic swing rides the open Attack action (BG3 grammar:
    // the live attack CTAs turn struck gold while swings remain, the coin spends
    // plainly). ONE derivation (`attacksPerActionForCharacter`).
    setAttackBudget(attacksPerActionForCharacter(character));
  }, [character, setBudget, setAttackBudget]);

  const trackerMap = useMemo(() => {
    if (!character)
      return new Map<
        string,
        { total: number; used: number; isPool?: boolean; unit?: string }
      >();
    // Only id/total/used/isPool/unit are read here (no label) — the locale-free
    // engine output is enough; no localization needed.
    return new Map(resolveTrackers(character).map((tr) => [tr.id, tr]));
  }, [character]);

  /**
   * Guard: if the character is already concentrating on a DIFFERENT spell and
   * the incoming action also requires concentration, ask for confirmation before
   * proceeding — via the ONE shared gate (`confirmConcentrationSwap`) the Spells
   * tab's cast CTAs also route through (golden rule 6).
   */
  function confirmConcentrationBreak(action: ResolvedAction): Promise<boolean> {
    return confirmConcentrationSwap(
      {
        concentration: action.concentration,
        ...(action.spellId ? { spellId: action.spellId } : {}),
        name: action.name,
      },
      t,
      locale
    );
  }

  // Commit a single action's resource cost IMMEDIATELY (immediate-commit
  // model), returning a reverse-applier that restores it. `attackOf` (attack-pips)
  // stamps the action-log line with the swing count ("… — attack 2 of 2").
  function commitAction(
    action: ResolvedAction,
    trackerAmount?: number,
    attackOf?: { n: number; total: number },
    targets: ReadonlyArray<string> = []
  ): () => void {
    action = withSelfRecipient(action, targets, selfCombatantId());
    const cs = useCharacterStore.getState();
    const characterId = cs.character?.id;
    let restoreEquipment: (() => boolean) | null = null;
    // USE-APPLIES — snapshot temp HP BEFORE applying this action's deterministic
    // effects, so undo restores the exact prior pool (temp HP don't stack — we
    // apply the higher of current/granted, then the reverse-applier sets it back).
    const prevTempHp = cs.character?.session.hp.temp ?? 0;
    // A bare slot cost (no cast-option pool pick — a feature/custom-spell commit)
    // resolves its pool ONCE, so spend + undo target the SAME counter (B3).
    const bareSpend = bareActionSpend(
      cs.character?.character.spellSlots ?? [],
      action,
      trackerAmount
    );
    const spends = bareSpend ? [bareSpend] : [];
    paySpends(spends);
    if (!bareSpend && action.costEquipment) {
      restoreEquipment = cs.useEquipmentItem(action.costEquipment);
    }
    // S9 — a CONSUMED buff potion (Speed / Giant Strength / …) arms its
    // self-sustaining round countdown when drunk, so its duration ticks at each
    // End Turn and auto-expires. No-op for an instant potion / non-item cost.
    const restorePotionTimer = action.costEquipment
      ? cs.consumePotionBuff(action.costEquipment)
      : null;
    // RA-14 — a ranged attack with TRACKED ammunition debits one unit (SRD
    // "Ammunition": each attack expends one piece). The engine stamps
    // `summary.ammo` only when a matching inventory row exists, and the store
    // debits only while stock remains — no row / empty quiver = nothing spent,
    // never a block (override-first). Undo credits the exact unit back.
    const ammoItemId =
      action.source === "weapon" ? action.summary.ammo?.itemId : undefined;
    const ammoDebited =
      ammoItemId != null ? cs.adjustEquipmentQuantity(ammoItemId, -1) : false;
    // RA-09 — the Dash action grants extra movement equal to your Speed: extend
    // the turn's movement budget by one Speed (undoable, per-turn — resets at the
    // turn boundary). Future speed riders (Tactical Shift, Cunning-Strike speed)
    // route through the SAME `commitDash` seam.
    const restoreDash =
      economyActionCategory(action) === "dash"
        ? useCombatStore.getState().commitDash()
        : null;
    const combat = useCombatStore.getState();
    // Turn-scoped action effects share the durable combat store, so route changes
    // cannot reopen movement or lose the pending roll state. An attack consumes
    // the pending Advantage exactly once; every mutation carries its own inverse.
    const restoreConsumedAttackAdvantage =
      action.source === "weapon" || action.summary.attackBonus !== undefined
        ? combat.consumeNextAttackAdvantage()
        : null;
    const restoreGrantedAttackAdvantage = action.grantsNextAttackAdvantage
      ? combat.grantNextAttackAdvantage()
      : null;
    const restoreMovementLock = action.locksMovement ? combat.lockMovement() : null;
    // Store the spell's STABLE id (golden rule 7); custom spells carry no id, so
    // custom spells stamp their name behind the `custom:` marker — never a bare SRD
    // name (which would leak the English title in IT).
    const restoreConcentration = applyActionConcentration(
      action,
      action.slotLevel ?? action.spellLevel ?? undefined
    );
    // Activation seam (issue #27 dogfood) — an action that ESTABLISHES a
    // while-active state (Rage, Bladesong, Innate Sorcery) lights it now: the
    // rail chip activates automatically and every while-active grant (Rage's
    // damage bonus, resistances, advantage) flows into the sheet. Only flipped
    // when it was OFF, so undo never clears a state the player set by hand;
    // the player taps the lit chip when the state ends (toggleActiveFeature).
    const activation = activateActionState(
      action,
      action.slotLevel ?? action.spellLevel ?? undefined
    );
    // USE-APPLIES (Task 1 + S8) — auto-apply the action's deterministic, dice-free
    // side-effects now (Orc Adrenaline Rush → PB temp HP; S8: every slot-LESS
    // temp-HP card — Dark One's Blessing, Celestial Resilience, Vitality of the
    // Tree, Inspiring Leader). The engine already resolved each to a number; route
    // the apply through the store `gainTempHp` seam so the MAX-WINS rule lives in
    // ONE place (golden rule 6 — no fourth copy of `max(prev, granted)`). It logs
    // a structured `temp-hp-gain` event (events-as-data); the undo below restores
    // the exact prior pool. Override-first — the temp-HP field stays editable.
    // (Currently the register's only kind is `temp-hp`; the `kind` discriminant
    // is read when a second kind lands — for now every entry is a temp-HP grant.)
    for (const eff of action.useEffects ?? []) {
      cs.gainTempHp(eff.amount);
    }
    const undoTrackerTopUp = action.summary.trackerTopUp
      ? cs.topUpTracker(
          action.summary.trackerTopUp.trackerId,
          action.summary.trackerTopUp.upTo
        )
      : null;
    // Log a STRUCTURED action-use event (no localized text): the semantic effect
    // (drives the GLYPH SHAPE) + the economy slot `action.type` (drives the row
    // COLOUR — action=green, bonus=blue, reaction=red — matching the cockpit
    // cards). The presenter localizes at render, so the row re-localizes on a
    // language switch. Capture the new entry's id so undo removes EXACTLY this
    // line — never a whole-array snapshot.
    const loggedId = cs.logEvent({
      kind: "action-use",
      action: action.nameLoc,
      effect: logTypeForAction(action),
      slot: action.type,
      ...(attackOf ? { attackOf } : {}),
      ...(targets.length > 0 ? { targets: [...targets] } : {}),
    });
    offerFollowUps(action, targets, loggedId);
    return () => {
      const c2 = useCharacterStore.getState();
      if (c2.readonly || c2.character?.id !== characterId) return;
      refundSpends(spends);
      restoreEquipment?.();
      // S9 — revert the armed potion countdown (restores the exact prior timers).
      restorePotionTimer?.();
      // RA-14 — credit the fired ammunition unit back (exact inverse op).
      if (ammoDebited && ammoItemId != null) {
        c2.adjustEquipmentQuantity(ammoItemId, 1);
      }
      // RA-09 — undo the Dash's movement-budget extension.
      restoreDash?.();
      restoreMovementLock?.();
      restoreGrantedAttackAdvantage?.();
      restoreConsumedAttackAdvantage?.();
      undoTrackerTopUp?.();
      // Clear the state THIS commit lit (never a hand-set one); compute the hand-lit
      // concentration chips the upcoming `setConcentration(prevConc)` LEG-2 clear is
      // about to strip; restore concentration (strips them); then re-add ONLY those —
      // a SURGICAL restore that can't resurrect a DIFFERENT chip the player toggled
      // OFF during the undo window (the cast's own auto-lit key is excluded).
      activation.restore();
      restoreConcentration(activation.activated);
      // USE-APPLIES — restore the exact temp-HP pool the commit overwrote, so
      // undoing the action reverts its applied effect too (not just the pip).
      if ((action.useEffects ?? []).length > 0) {
        c2.setTempHP(prevTempHp);
      }
      c2.removeLogEntry(loggedId);
      useDamageTrayStore.getState().withdraw(loggedId);
    };
  }

  /** Open the damage tray when the use has something to apply to its targets. */
  function offerFollowUps(
    action: ResolvedAction,
    targets: ReadonlyArray<string>,
    castLogId: string | null
  ): void {
    const characterId = useCharacterStore.getState().character?.id;
    if (!characterId) return;
    const plan = damageTrayPlan(action, targets, selfCombatantId());
    if (!plan) return;
    useDamageTrayStore.getState().show({
      characterId,
      actionName: action.name,
      source: action.nameLoc,
      castLogId,
      plan,
    });
  }

  // Display record for the economy slot.
  function toSelectedAction(
    action: ResolvedAction,
    slot: EconomySlot,
    castOption?: CastCommitOption,
    outcomeOccurrenceId?: string
  ): SelectedAction {
    const economyCategory = economyActionCategory(action);
    const cost: SelectedAction["cost"] = castOption
      ? castOption.kind === "free-cast"
        ? {
            type: "tracker",
            key: castOption.sourceId,
            trackerAmount: castOption.cost,
            isPool: action.costTrackerIsPool,
            poolUnit: action.costTrackerUnit,
          }
        : !castOption.kind || castOption.kind === "slot"
          ? { type: "spell-slot", key: castOption.level }
          : undefined
      : action.costsSlot
        ? { type: "spell-slot", key: action.slotLevel }
        : action.costTracker
          ? {
              type: "tracker",
              key: action.costTracker,
              trackerAmount: action.trackerCost,
              isPool: action.costTrackerIsPool,
              poolUnit: action.costTrackerUnit,
            }
          : action.costEquipment
            ? { type: "equipment", key: action.costEquipment }
            : undefined;
    return {
      id: action.id,
      name: action.name,
      nameLoc: action.nameLoc,
      slot,
      ...(economyCategory ? { economyCategory } : {}),
      ...(action.maintainsActiveKey
        ? { triggerEvents: ["bonus-extend"] as const }
        : action.summary.attackBonus != null || action.summary.saveAbility != null
          ? { triggerEvents: ["attack"] as const }
          : {}),
      ...(outcomeOccurrenceId ? { outcomeOccurrenceId } : {}),
      cost,
    };
  }

  /** Allocate a proposed Action against the live mix of ordinary and restricted
   * slots. The assignment is order-independent: a Haste-legal Dash taken first
   * cannot accidentally consume the only unrestricted Action needed by a spell. */
  function appendWithinActionRules(
    action: SelectedAction,
    outcomes?: ReadonlyArray<CombatOutcomeReceipt>
  ): boolean {
    if (action.slot !== "action") return appendSelectedAction(action, outcomes);
    const doc = useCharacterStore.getState().character;
    if (!doc) return false;
    const state = useCombatStore.getState();
    const claims = economyClaimsForTurn(
      state.selected.action,
      state.attacksUsed,
      state.attackBudget
    );
    const proposed = {
      category: action.economyCategory ?? null,
      ...(action.economyCategory === "attack" ? { attackCount: 1 } : {}),
    };
    if (!canAssignActionClaims([...claims, proposed], extraActionRulesThisTurn(doc))) {
      return false;
    }
    return appendSelectedAction(action, outcomes);
  }

  // ATTACK-PIPS — the highest spell level the character may replace an attack with
  // (Eldritch Knight War Magic → 0 = cantrip only; Improved War Magic → higher).
  // −1 when the character has no replace-attack rider at all. One lookup reused by
  // the routing predicate + the commit flow (golden rule 6).
  function warMagicMaxSpellLevel(): number {
    if (!character) return -1;
    return maxReplaceAttackSpellLevel(resolveReplaceAttackWithCast(character));
  }

  // ATTACK-PIPS — whether this commit is a SWING that rides the Attack action's
  // pips: a weapon attack taken AS the Attack action, or a War-Magic spell that
  // replaces one attack. Only ever true when `attackBudget > 1` (Extra Attack) —
  // at 1 the ordinary single-slot economy owns every attack (zero delta). The pure
  // predicate is the SAME one PlayTab reads for the card marker (golden rule 6).
  function isPipAttack(action: ResolvedAction): boolean {
    if (useCombatStore.getState().attackBudget <= 1) return false;
    return isPipAttackAction(action, warMagicMaxSpellLevel());
  }

  // ATTACK-PIPS — is there room to take one more swing right now? Either mid-Attack-
  // action (a pip remains in the open action) or an Action slot is free to START a
  // fresh Attack action. Mirrors `commitAttackSwing`'s own guard so we never run an
  // action's side-effects only to have the swing rejected.
  function canOpenAttackSwing(): boolean {
    const s = useCombatStore.getState();
    if (s.attackBudget <= 1) return false;
    const midAction = s.attacksUsed % s.attackBudget !== 0;
    if (!midAction && s.selected.action.length >= s.budget.action) return false;
    const doc = useCharacterStore.getState().character;
    if (!doc) return false;
    const actions = midAction
      ? s.selected.action
      : [
          ...s.selected.action,
          { isAttackGroup: true, economyCategory: "attack" as const },
        ];
    const claims = economyClaimsForTurn(actions, s.attacksUsed + 1, s.attackBudget);
    return canAssignActionClaims(claims, extraActionRulesThisTurn(doc));
  }

  // ATTACK-PIPS — commit ONE WEAPON attack swing: log it via the shared
  // `commitAction` (stamped with the count), claim/ride an Attack action in the
  // store, then surface a counted 5s undo toast ("Longsword: attack 2 of 2").
  // A War-Magic SPELL swing routes through `commitCastOption(…, ridesPip)` instead
  // (the rich-cast seam — Metamagic/upcast choices must surface there, rule 6).
  // Async — awaits the concentration-break gate (D24) before any mutation.
  // Accepted cosmetic: an out-of-order per-swing undo doesn't renumber the
  // already-written "attack N of M" log lines (5s window — accepted).
  async function commitAttackSwing(action: ResolvedAction) {
    if (!guardActionState(action)) return;
    if (!(await confirmConcentrationBreak(action))) return;
    const store = useCombatStore.getState();
    const total = store.attackBudget;
    const n = (store.attacksUsed % total) + 1;
    const message = t("combat.attackSwingToast", { name: action.name, n, total });
    const applyResolution = pendingResolutionFor(action);
    const outcomeOccurrenceId = applyResolution?.occurrenceId;
    // Register on the undo stack: `execute` logs the swing (via the shared
    // `commitAction`, stamped with the count) + claims/rides an Attack action; it
    // bails (null) when no Attack slot is free (nothing spent). Redo re-runs it.
    if (
      registerUndoableToast(
        { message },
        () => {
          if (!guardActionState(action)) return null;
          // The swing's own effects (log line stamped with the count;
          // concentration/buff for a War-Magic cantrip; weapons carry none).
          const undoEffects = commitAction(
            action,
            undefined,
            { n, total },
            applyResolution?.targets
          );
          const groupEntry: SelectedAction = {
            id: "attack-group",
            name: t("combat.attackAction"),
            nameLoc: { ui: "combat.attackAction" },
            slot: "action",
            isAttackGroup: true,
            economyCategory: "attack",
            triggerEvents: ["attack"],
          };
          if (
            useCombatStore
              .getState()
              .commitAttackSwing(
                groupEntry,
                action.id,
                outcomeOccurrenceId,
                applyResolution?.outcomes
              ) === null
          ) {
            // No Attack action slot free — nothing spent; undo the log and bail.
            undoEffects();
            return null;
          }
          return withResolutionUndo(() => {
            useCombatStore.getState().undoAttackSwing();
            undoEffects();
          }, applyResolution);
        },
        // The one-snackbar rule (toastStore) gives the whole Attack action ONE
        // evolving toast: each swing replaces the previous announcement in place,
        // its text + undo pointing at the LAST swing (BG3 grammar, 2026-07-09).
        { turnScoped: true }
      ) === null
    ) {
      return;
    }
    clearPendingResolution(action);
  }

  // Commit a (resolved-amount) action into its slot: deduct now, remember the
  // reverse, surface a 5s undo toast. Async — the concentration-break gate is a
  // promise-based confirm dialog (D24); we await it before deducting anything.
  async function commitIntoSlot(
    action: ResolvedAction,
    slot: EconomySlot,
    trackerAmount?: number,
    execution: ActionExecution = TURN_EXECUTION
  ) {
    if (!guardActionState(action)) return;
    const expendsSpellSlot = action.source === "spell" && action.costsSlot;
    if (expendsSpellSlot && !spellSlotExpenditureAvailable()) {
      showSpellSlotExpenditureLimit();
      return;
    }
    if (!(await confirmConcentrationBreak(action))) return;
    if (expendsSpellSlot && !spellSlotExpenditureAvailable()) {
      showSpellSlotExpenditureLimit();
      return;
    }
    const preparedResource = action.resourcePayment
      ? await itemResourceCommands?.prepare(
          itemResourceSpend(
            action.resourcePayment,
            trackerAmount ?? action.resourceCost ?? 1
          ),
          action.name
        )
      : undefined;
    if (action.resourcePayment && (!itemResourceCommands || !preparedResource)) return;
    const resourceCycle =
      itemResourceCommands && preparedResource
        ? createItemResourcePaymentCycle(itemResourceCommands, preparedResource)
        : null;
    const applyResolution = pendingResolutionFor(action);
    const outcomeOccurrenceId = applyResolution?.occurrenceId;
    // USE-APPLIES — when the action auto-applied temp HP, the toast SAYS so (the
    // player sees the deterministic effect was taken care of), else the plain "X
    // used" line. The gain is the resolved number (temp HP don't stack — what's
    // applied is max(prev, granted), but the toast reports the grant).
    const tempGain = (action.useEffects ?? [])[0];
    const message = tempGain
      ? t("combat.useGainedTempHp", { name: action.name, amount: tempGain.amount })
      : t("combat.actionUsedToast", { name: action.name });
    // Register on the undo stack: `execute` deducts the cost + appends into the
    // slot, bailing (null) if the budget is already full (the card guard should
    // prevent this, but never trust the view — nothing spent then). Redo re-runs it.
    if (
      registerUndoableToast(
        { message },
        () => {
          if (!guardActionState(action)) return null;
          if (expendsSpellSlot && !spellSlotExpenditureAvailable()) return null;
          if (!actionPaymentAffordable(action)) return null;
          if (action.costTracker && action.costTrackerIsPool) {
            const cost = trackerAmount ?? action.trackerCost ?? 1;
            const live = useCharacterStore.getState().character;
            const tracker = live
              ? resolveTrackers(live).find((entry) => entry.id === action.costTracker)
              : undefined;
            if (!tracker || tracker.total - tracker.used < cost) return null;
          }
          const resourceCommit = resourceCycle?.apply() ?? null;
          if (resourceCycle && !resourceCommit) return null;
          const restoreSlotCast = expendsSpellSlot ? commitSpellSlotExpenditure() : null;
          if (expendsSpellSlot && !restoreSlotCast) {
            if (resourceCommit && itemResourceCommands) {
              itemResourceCommands.revert(resourceCommit);
            }
            return null;
          }
          const undoCost = commitAction(
            action,
            trackerAmount,
            undefined,
            applyResolution?.targets
          );
          const revertPaymentBoundary =
            restoreSlotCast || (resourceCommit && itemResourceCommands)
              ? () => {
                  if (restoreSlotCast && !restoreSlotCast()) return false;
                  return resourceCommit && itemResourceCommands
                    ? itemResourceCommands.revert(resourceCommit)
                    : true;
                }
              : undefined;
          if (!execution.consumesTurnEconomy) {
            return withResolutionUndo(undoCost, applyResolution, revertPaymentBoundary);
          }
          if (
            !appendWithinActionRules(
              toSelectedAction(action, slot, undefined, outcomeOccurrenceId),
              applyResolution?.outcomes
            )
          ) {
            if (revertPaymentBoundary && !revertPaymentBoundary()) return null;
            undoCost();
            return null;
          }
          return withResolutionUndo(
            () => {
              // Occupant-checked (idempotent): a no-op if this action already left its
              // slot, so a stray reverse can never double-refund (§5.2).
              if (
                !useCombatStore.getState().selected[slot].some((a) => a.id === action.id)
              )
                return;
              undoCost();
              deselectAction(action.id);
            },
            applyResolution,
            () => {
              const stillSelected = useCombatStore
                .getState()
                .selected[slot].some((entry) => entry.id === action.id);
              if (!stillSelected) return false;
              return revertPaymentBoundary?.() ?? true;
            }
          );
        },
        { turnScoped: execution.turnScoped }
      ) === null
    )
      return;
    clearPendingResolution(action);
  }

  // ponytail: casting records the payment and concentration; the table resolves effects.
  async function commitCastOption(
    action: ResolvedAction,
    _slot: EconomySlot,
    opt: CastCommitOption,
    metamagicIds: ReadonlyArray<string> = [],
    _ridesPip?: boolean,
    execution: ActionExecution = TURN_EXECUTION
  ) {
    const characterId = character?.id;
    const canCommit = () => {
      const live = useCharacterStore.getState();
      return !!characterId && live.character?.id === characterId && !live.readonly;
    };
    // After Ready, the turn's action-time spell is readied: held with Concentration.
    const liveSession = useCharacterStore.getState().character?.session;
    const readies =
      !execution.ritual &&
      !!liveSession &&
      castReadiesSpell(action, useCombatStore.getState().selected.action, liveSession);
    const heldAction = readies ? { ...action, concentration: true } : action;
    if (!canCommit() || !(await confirmConcentrationBreak(heldAction)) || !canCommit())
      return;
    const itemPayment = castItemPayment(action, opt);
    const preparedResource = itemPayment
      ? await itemResourceCommands?.prepare(
          itemResourceSpend(itemPayment.payment, itemPayment.amount),
          itemPayment.label
        )
      : undefined;
    if (!canCommit() || (itemPayment && (!itemResourceCommands || !preparedResource)))
      return;
    const resourceCycle =
      itemResourceCommands && preparedResource
        ? createItemResourcePaymentCycle(itemResourceCommands, preparedResource)
        : null;
    const targets = pendingResolutionFor(action)?.targets ?? [];
    const castAction = withMetamagicDuration(
      withSelfRecipient(action, targets, selfCombatantId()),
      metamagicIds
    );
    const message = execution.ritual
      ? t("combat.castRitualToast", { name: action.name })
      : readies
        ? t("combat.readiedSpellToast", { name: action.name })
        : t("combat.actionUsedToast", { name: action.name });
    registerUndoableToast(
      { message },
      () => {
        if (
          !canCommit() ||
          !castOptionAffordable(opt) ||
          !metamagicAffordable(metamagicIds)
        )
          return null;
        const resourceCommit = resourceCycle?.apply() ?? null;
        if (resourceCycle && !resourceCommit) return null;
        const cs = useCharacterStore.getState();
        const spends = castOptionSpends(opt, metamagicIds);
        paySpends(spends);
        const restoreConcentration = applyActionConcentration(heldAction, opt.level);
        // A self buff establishes its standing state on cast (owner 2026-10-08: states
        // activate with one tap and expire by themselves). Only flips when OFF, so undo
        // never clears a hand-set state; arms the round countdown. A readied spell has
        // no effect until its release.
        const activation = readies
          ? { activated: false, restore: () => {} }
          : activateActionState(castAction, opt.level);
        const loggedId = cs.logEvent({
          kind: "action-use",
          action: action.nameLoc,
          effect: logTypeForAction(action),
          slot: castEconomySlot(action.type, metamagicIds),
          ...(targets.length > 0 ? { targets: [...targets] } : {}),
        });
        const undoRegains = applyOnCastRegains(
          action.spellId,
          expendedSlotLevel(opt, spends)
        );
        const undoHold = readies
          ? useCharacterStore
              .getState()
              .setReadiedSpell(readiedHold(currentRound(), loggedId || null))
          : null;
        if (!readies) offerFollowUps(action, targets, loggedId);
        return () => {
          if (!canCommit()) return false;
          if (
            resourceCommit &&
            itemResourceCommands &&
            !itemResourceCommands.revert(resourceCommit)
          )
            return false;
          undoHold?.();
          undoRegains();
          activation.restore();
          restoreConcentration(activation.activated);
          refundSpends(spends);
          useCharacterStore.getState().removeLogEntry(loggedId);
          useDamageTrayStore.getState().withdraw(loggedId);
          return true;
        };
      },
      { turnScoped: false }
    );
    clearPendingResolution(action);
  }

  // S6 — the picker disables the payments the character cannot afford right now.
  function paymentAffordable(cost: ActionCostOption["cost"]): boolean {
    return character ? paymentAffordableFor(character, trackerMap, cost) : false;
  }

  function paymentOptionLabel(cost: ActionCostOption["cost"]): string {
    if (cost.kind === "spell-slot") {
      return t("combat.paymentSpellSlot", { level: cost.minLevel });
    }
    if (cost.kind === "tracker") return grantSourceLabel(cost.trackerId, locale);
    if (cost.kind === "item-resource") {
      return localizeSrd("magic-item", cost.itemId, "name", locale);
    }
    return t("combat.paymentNoCost");
  }

  function paymentOptionRemaining(cost: ActionCostOption["cost"]): string | null {
    if (cost.kind === "tracker") {
      const tracker = trackerMap.get(cost.trackerId);
      return tracker ? `${tracker.total - tracker.used}/${tracker.total}` : null;
    }
    if (cost.kind === "item-resource" && character) {
      const availability = resolveItemResourceAvailability(character, cost);
      return availability ? `${availability.current}/${availability.capacity}` : null;
    }
    return null;
  }

  /**
   * What the cast gives back (Arcane Ward, Expert Divination): refunded and logged
   * after the cast's own line; the returned undo pays it again and drops the lines.
   */
  function applyOnCastRegains(
    spellId: string | undefined,
    slotLevel: number | null
  ): () => void {
    const cs = useCharacterStore.getState();
    if (!cs.character) return () => {};
    const regains = onCastRegains(cs.character, spellId, slotLevel);
    const refunds = regains.map((regain) => regain.refund);
    refundSpends(refunds);
    const logIds = regains.map((regain) => cs.logEvent(regain.event));
    return () => {
      paySpends(refunds);
      const live = useCharacterStore.getState();
      for (const id of logIds) live.removeLogEntry(id);
    };
  }

  /** Pay a use's sheet spends, and refund exactly them on undo (the same counters). */
  function paySpends(spends: ReadonlyArray<CastSpend>): void {
    const cs = useCharacterStore.getState();
    for (const spend of spends) {
      if (spend.kind === "slot") cs.useSpellSlot(spend.level, spend.pactMagic);
      else cs.useTracker(spend.trackerId, spend.amount);
    }
  }

  function refundSpends(spends: ReadonlyArray<CastSpend>): void {
    const cs = useCharacterStore.getState();
    for (const spend of spends) {
      if (spend.kind === "slot") cs.restoreSpellSlot(spend.level, spend.pactMagic);
      else cs.restoreTracker(spend.trackerId, spend.amount);
    }
  }

  // The commit revalidates against the LIVE character, never the render snapshot.
  function liveTrackerAffordable(trackerId: string, amount: number): boolean {
    const doc = useCharacterStore.getState().character;
    return doc ? trackerAffordable(doc, trackerId, amount) : false;
  }

  function metamagicAffordable(metamagicIds: ReadonlyArray<string>): boolean {
    const doc = useCharacterStore.getState().character;
    return doc ? metamagicAffordableFor(doc, metamagicIds) : false;
  }

  function actionPaymentAffordable(action: ResolvedAction): boolean {
    const doc = useCharacterStore.getState().character;
    return doc ? actionPaymentAffordableFor(doc, action) : false;
  }

  function castOptionAffordable(opt: CastCommitOption): boolean {
    const doc = useCharacterStore.getState().character;
    return doc ? castOptionAffordableFor(doc, opt) : false;
  }

  /**
   * One shared spell-configuration seam for both ordinary card commits and the
   * encounter resolver. `onConfigured` changes only the final destination: the
   * same option rows and Metamagic rules are used either way.
   */
  function actionForCastOption(
    action: ResolvedAction,
    option: CastCommitOption,
    castLevel: number
  ): ResolvedAction {
    const scaledAction = actionAtCastLevel(
      action,
      action.spellId ? getSpellById(action.spellId) : undefined,
      castLevel
    );
    if (option.kind !== "free-cast" || !action.spellId) return scaledAction;
    return applyCastSourceOverridesToAction(
      scaledAction,
      option.castOverrides,
      option.castOverrides?.maxRounds !== undefined
        ? castSourceActiveKey(
            option.attributionSourceId ?? option.sourceId,
            action.spellId
          )
        : undefined
    );
  }

  function configureSpellCast(
    action: ResolvedAction,
    slot: EconomySlot,
    ridesPip: boolean,
    onConfigured?: (
      action: ResolvedAction,
      option: CastCommitOption,
      metamagicIds: ReadonlyArray<string>
    ) => void,
    execution: ActionExecution = TURN_EXECUTION
  ): boolean {
    if (action.summary.recurringUse) return false;
    if (action.source !== "spell" || !character) return false;

    const isCantrip = (action.spellLevel ?? 0) === 0;
    const baseLevel = action.slotLevel ?? action.spellLevel ?? 1;
    const availableOptions = isCantrip
      ? []
      : action.spellId
        ? resolveSpellCastOptions(character, action.spellId, baseLevel, true, locale, {
            mastery: t("spellPrep.spellMasteryBadge"),
            signature: t("spellPrep.signatureSpellBadge"),
          })
        : buildCastOptions(
            character.character.spellSlots,
            character.session.spellSlots,
            baseLevel
          );
    if (execution.ritual) {
      const option: CastCommitOption = { kind: "ritual", level: baseLevel };
      const finalAction = actionForCastOption(action, option, baseLevel);
      if (onConfigured) onConfigured(finalAction, option, []);
      else void commitCastOption(finalAction, slot, option, [], false, execution);
      return true;
    }
    const options = availableOptions;
    if (!isCantrip && options.length === 0) {
      showToast({ message: t("combat.noSlotsRemaining"), duration: 2000 });
      return true;
    }

    const metamagic: MetamagicCastRow[] = action.spellId
      ? resolveMetamagicForCast(character, action.spellId).map((m) => ({
          id: m.id,
          name: localizeSrd("metamagic", m.id, "name", locale),
          cost: m.cost,
          affordable: m.affordable,
          appliesToSpell: m.appliesToSpell,
          stacksWithPrimary: m.stacksWithPrimary,
        }))
      : [];
    const spellData = action.spellId ? getSpellById(action.spellId) : undefined;
    const finish = (
      option: CastCommitOption,
      metamagicIds: ReadonlyArray<string>
    ): void => {
      const finalAction = actionForCastOption(action, option, option.level);
      if (onConfigured) onConfigured(finalAction, option, metamagicIds);
      else
        void commitCastOption(
          finalAction,
          slot,
          option,
          metamagicIds,
          ridesPip,
          execution
        );
    };

    if (metamagic.length === 0) {
      if (isCantrip) {
        finish({ kind: "cantrip", level: 0 }, []);
        return true;
      }
      if (options.length === 1 && options[0]) {
        finish(options[0], []);
        return true;
      }
    }

    setCastRequest({
      characterId: character.id,
      action,
      slot,
      baseLevel,
      options,
      metamagic: metamagic.length > 0 ? metamagic : undefined,
      sorceryRemaining: remainingSorceryPoints(character),
      execution,
      ...(ridesPip ? { ridesPip } : {}),
      ...(onConfigured ? { onConfigured } : {}),
      upcast: spellData
        ? {
            level: spellData.level,
            damageDice: spellData.damageDice,
            damageDicePerUpcast: spellData.damageDicePerUpcast,
            healDice: spellData.healDice,
            healDicePerUpcast: spellData.healDicePerUpcast,
            instances: spellData.instances,
            instancesPerUpcast: spellData.instancesPerUpcast,
            secondaryDamage: spellData.secondaryDamage,
          }
        : undefined,
    });
    return true;
  }

  // Handle card tap: commit immediately (deduct now). Reversal is EXCLUSIVELY
  // the session undo system (the 5s toast · the masthead Undo/Redo · ⌘Z) — the
  // CTA grammar: a card never carries an inline cancel.
  function handleSelect(
    action: ResolvedAction,
    onCommitted?: ResolutionApply,
    execution: ActionExecution = TURN_EXECUTION
  ) {
    if (!guardActionState(action)) return;
    const stagedResolution = pendingResolutionRef.current;
    pendingResolutionRef.current = onCommitted
      ? {
          actionId: action.id,
          apply: onCommitted,
          outcomes:
            stagedResolution?.actionId === action.id ? stagedResolution.outcomes : [],
          ...(stagedResolution?.actionId === action.id && stagedResolution.occurrenceId
            ? { occurrenceId: stagedResolution.occurrenceId }
            : {}),
          ...(stagedResolution?.actionId === action.id && stagedResolution.targets
            ? { targets: stagedResolution.targets }
            : {}),
        }
      : null;
    const slot = getEconomySlot(action);

    // Already the committed occupant → the card's CTA is disabled ("Used"), so
    // this is unreachable from the UI — kept as a silent defensive bail ("never
    // trust the view"): a stale tap must never double-commit or open a picker.
    if (
      execution.consumesTurnEconomy &&
      useCombatStore.getState().selected[slot].some((a) => a.id === action.id)
    ) {
      return;
    }

    const costOptions = getActionCostOptions(action);

    // A depleted PRIMARY resource does not make an alternate payment illegal.
    // Check the complete declarative payment set before bailing so Wild Companion
    // and item-backed actions can still use an affordable alternate.
    if (
      action.summary.uses &&
      action.summary.uses.current <= 0 &&
      !costOptions.some(({ cost }) => paymentAffordable(cost))
    ) {
      showToast({ message: t("combat.noUsesRemaining"), duration: 2000 });
      return;
    }

    // ATTACK-PIPS — an Extra-Attack character's weapon attack (or a War-Magic cast
    // replacing an attack) rides ONE pip of the Attack action instead of claiming a
    // fresh economy slot per swing. Only fires when `attackBudget > 1`; otherwise
    // the ordinary paths below own the commit (guard case — zero behavioural delta).
    // A WEAPON swing — or a CUSTOM/homebrew cantrip (no spellId ⇒ no Metamagic /
    // upcast to offer, and the rich-cast seam below is spellId-gated) — commits
    // directly here; an SRD SPELL swing FALLS THROUGH into the shared rich-cast
    // seam below with `ridesPip` set, so Metamagic/upcast choices surface on a pip
    // swing exactly as on any other cast (golden rule 6) — the picker runs first,
    // and the confirmed cast then consumes the pip.
    const ridesPip = execution.consumesTurnEconomy && isPipAttack(action);
    if (ridesPip) {
      // A fully-spent Attack action now DISABLES the card's CTA (see PlayTab
      // `ctaDisabled`), so this is unreachable from the UI — kept as a silent
      // defensive bail ("never trust the view"), no longer a redundant "already
      // used" toast (owner 2026-07-11).
      if (!canOpenAttackSwing()) return;
      if (action.source === "weapon" || !action.spellId) {
        void commitAttackSwing(action);
        return;
      }
    }

    // S4 — Arcane Recovery opens its guided picker instead of a bare commit. The
    // feature is identified by its stable tracker srdId (golden rule 7 — never a
    // display string). The picker enforces the ⌈level/2⌉ cap and applies the
    // recovery + use debit on confirm.
    if (action.costTracker === ARCANE_RECOVERY_FEATURE_ID && character) {
      const wizardLevel = classEntryLevel(character.character, "wizard");
      // RAW: Arcane Recovery restores expended NORMAL slots only — Pact-Magic
      // slots aren't Wizard slots. The `!pactMagic` filter is genuine RAW domain
      // logic (not a key-collision workaround — pact and normal now key distinctly
      // via slotUsageKey, so each non-pact slot reads its OWN counter unambiguously).
      const expended = character.character.spellSlots
        .filter((s) => !s.pactMagic)
        .map((s) => ({
          level: s.level,
          expended: character.session.spellSlots[slotUsageKey(s)]?.used ?? 0,
        }));
      setArcaneRecoveryRequest({ characterId: character.id, wizardLevel, expended });
      return;
    }

    // B6 — a commit APPENDS into the slot while budget remains ("Action 1/2");
    // a FULL slot disables every card that needs it (the CTA grammar's spent
    // state), so no commit ever reaches a full slot from the UI — the
    // `selectAction` bail inside each execute stays the defensive backstop.

    // Rich in-combat casting — any spell action (a slot-costing LEVELED spell OR
    // a slotless CANTRIP) flows through the SAME shared cast seam, so the Combat
    // page offers per-cast Metamagic exactly where the Spells page does (golden
    // rule 6 — no cross-surface drift). A LEVELED spell still requires a slot:
    // `resolveSpellCastOptions` returns its upcast/free-cast rows (empty ⇒ no
    // castable slot). A CANTRIP (`spellLevel 0`) is slotless — that helper
    // legitimately returns `[]` for it (G6/W3), and the modal/commit route it as a
    // `kind:"cantrip"` option (spends NO slot, only the selected Metamagic SP).
    if (configureSpellCast(action, slot, ridesPip, undefined, execution)) return;

    // Variable-cost (pool) action → prompt for the amount, THEN commit.
    if (action.costTracker && action.costTrackerIsPool && !action.trackerCost) {
      const tracker = trackerMap.get(action.costTracker);
      if (tracker) {
        setPendingPoolSpend({
          kind: "commit",
          characterId: character?.id,
          action,
          slot,
          execution,
        });
        setPoolSpendRequest({
          featureName: action.name,
          unit: action.costTrackerUnit ?? "uses",
          max: Math.max(1, tracker.total - tracker.used),
        });
        return;
      }
    }

    // S6 — alternate payment: when the action declares more than one legal way to
    // pay (a primary cost PLUS an `alternateCost`), open the payment picker so the
    // tap offers EVERY legal payment (Wild Companion: a Wild Shape use OR a slot;
    // a Psi Warrior maneuver: its tracker OR a Psionic Energy Die). One option →
    // skip the picker and commit it directly.
    if (costOptions.length > 1) {
      setPaymentRequest({
        characterId: character?.id,
        action,
        slot,
        options: costOptions,
        execution,
      });
      return;
    }

    void commitIntoSlot(action, slot, undefined, execution);
  }

  // S6 — commit a chosen alternate payment: remap the action's cost fields to the
  // picked payment, then route through the ONE `commitIntoSlot` (deduct + undo +
  // toast + concentration). Fire-and-forget — `commitIntoSlot` awaits the
  // concentration-break gate internally.
  function commitPayment(
    action: ResolvedAction,
    slot: EconomySlot,
    cost: ActionCostOption["cost"],
    execution: ActionExecution
  ) {
    void commitIntoSlot(actionWithCost(action, cost), slot, undefined, execution);
  }

  // Handle reaction use (immediate commit, not part of turn queue). Async — the
  // concentration-break gate (D24) is a promise-based confirm dialog.
  async function handleUseReaction(
    action: ResolvedAction,
    onCommitted?: ResolutionApply,
    cast?: {
      option: CastCommitOption;
      metamagicIds: ReadonlyArray<string>;
    }
  ) {
    if (!guardActionState(action)) return;
    const expendsSpellSlot =
      action.source === "spell" &&
      (cast ? castOptionExpendsSpellSlot(cast.option) : action.costsSlot);
    if (expendsSpellSlot && !spellSlotExpenditureAvailable()) {
      showSpellSlotExpenditureLimit();
      return;
    }
    const stagedResolution = pendingResolutionRef.current;
    pendingResolutionRef.current = onCommitted
      ? {
          actionId: action.id,
          apply: onCommitted,
          outcomes:
            stagedResolution?.actionId === action.id ? stagedResolution.outcomes : [],
          ...(stagedResolution?.actionId === action.id && stagedResolution.occurrenceId
            ? { occurrenceId: stagedResolution.occurrenceId }
            : {}),
          ...(stagedResolution?.actionId === action.id && stagedResolution.targets
            ? { targets: stagedResolution.targets }
            : {}),
        }
      : null;
    // A spent reaction DISABLES every reaction CTA ("Used" — the CTA grammar),
    // so this is unreachable from the UI — a silent defensive bail ("never
    // trust the view"), not a redundant "already used" toast.
    if (useCombatStore.getState().reactionUsed) return;
    if (!(await confirmConcentrationBreak(action))) return;
    if (expendsSpellSlot && !spellSlotExpenditureAvailable()) {
      showSpellSlotExpenditureLimit();
      return;
    }
    const reactionItemPayment = castItemPayment(action, cast?.option);
    const preparedResource = reactionItemPayment
      ? await itemResourceCommands?.prepare(
          itemResourceSpend(reactionItemPayment.payment, reactionItemPayment.amount),
          reactionItemPayment.label
        )
      : undefined;
    if (reactionItemPayment && (!itemResourceCommands || !preparedResource)) return;
    const resourceCycle =
      itemResourceCommands && preparedResource
        ? createItemResourcePaymentCycle(itemResourceCommands, preparedResource)
        : null;
    const applyResolution = pendingResolutionFor(action);
    const outcomeOccurrenceId = applyResolution?.occurrenceId;
    const message = t("combat.reactionToast", { name: action.name });
    // Register on the undo stack: `execute` marks the reaction used, deducts the
    // resource, applies concentration + any while-active buff, and logs the row,
    // returning the combined reverse. Redo re-runs the SAME resolved reaction.
    if (
      registerUndoableToast(
        { message },
        () => {
          if (!guardActionState(action)) return null;
          if (expendsSpellSlot && !spellSlotExpenditureAvailable()) return null;
          if (
            cast
              ? !castOptionAffordable(cast.option) ||
                !metamagicAffordable(cast.metamagicIds)
              : !actionPaymentAffordable(action)
          ) {
            return null;
          }
          const resourceCommit = resourceCycle?.apply() ?? null;
          if (resourceCycle && !resourceCommit) return null;
          const restoreSlotCast = expendsSpellSlot ? commitSpellSlotExpenditure() : null;
          if (expendsSpellSlot && !restoreSlotCast) {
            if (resourceCommit && itemResourceCommands) {
              itemResourceCommands.revert(resourceCommit);
            }
            return null;
          }
          const revertPaymentBoundary = () => {
            if (restoreSlotCast && !restoreSlotCast()) return false;
            return resourceCommit && itemResourceCommands
              ? itemResourceCommands.revert(resourceCommit)
              : true;
          };
          if (
            !markReactionUsed(action.id, outcomeOccurrenceId, applyResolution?.outcomes)
          ) {
            revertPaymentBoundary();
            return null;
          }
          const characterStore = useCharacterStore.getState();
          // Resolve the slot pool once (normal vs Pact for a pure Warlock) so the
          // spend and the reverse hit the SAME counter (B3). A bare tracker cost an
          // item resource already pays is not spent twice.
          const bareSpend = cast
            ? null
            : bareActionSpend(
                characterStore.character?.character.spellSlots ?? [],
                action
              );
          const spends = cast
            ? castOptionSpends(cast.option, cast.metamagicIds)
            : bareSpend && !(bareSpend.kind === "tracker" && action.resourcePayment)
              ? [bareSpend]
              : [];
          paySpends(spends);
          // Store the spell's STABLE id (golden rule 7); a custom spell stamps its
          // name behind the `custom:` marker, never a bare SRD name.
          const castLevel =
            cast?.option.level ?? action.slotLevel ?? action.spellLevel ?? undefined;
          const restoreConcentration = applyActionConcentration(action, castLevel);
          // S1 — a REACTION-cast while-active BUFF spell (Shield's +5 AC) ESTABLISHES
          // its standing state on use. Only flips when OFF so undo never clears a
          // hand-set state; arms the round countdown. Read state FRESH.
          const targets = applyResolution?.targets ?? [];
          const activation = activateActionState(
            withMetamagicDuration(
              withSelfRecipient(action, targets, selfCombatantId()),
              cast?.metamagicIds ?? []
            ),
            castLevel
          );
          // Log a STRUCTURED reaction-use event (always the reaction slot → red row).
          // Capture the id so the reverse removes only this line.
          const loggedId = characterStore.logEvent({
            kind: "reaction-use",
            action: action.nameLoc,
            effect: logTypeForAction(action),
            ...(targets.length > 0 ? { targets: [...targets] } : {}),
          });
          const undoRegains = applyOnCastRegains(
            action.spellId,
            expendedSlotLevel(cast?.option, spends)
          );
          return withResolutionUndo(
            () => {
              undoRegains();
              // Only undo reaction status — selections are unaffected (resetReaction).
              resetReaction();
              // Restore EXACTLY what was deducted (the same amount).
              refundSpends(spends);
              // SURGICAL concentration restore (mirrors `commitCastOption`'s reverse).
              activation.restore();
              restoreConcentration(activation.activated);
              useCharacterStore.getState().removeLogEntry(loggedId);
            },
            applyResolution,
            () => {
              if (useCombatStore.getState().reactionUsedId !== action.id) return false;
              return revertPaymentBoundary();
            }
          );
        },
        { turnScoped: true }
      ) === null
    )
      return;
    clearPendingResolution(action);
  }

  // Spend a CONSUMABLE on-hit rider on an attack — debit its backing resource
  // ONCE, log the spend, surface a 5s undo toast (the same immediate-commit-with-
  // undo model an action commit uses). Display-only riders (no `spend`) never
  // reach here (the card renders them static); the engine never auto-spends
  // (override-first) — this tap IS the explicit commit. The debit is the inverse-
  // applier's exact partner, so undo restores precisely what was spent.
  function spendRider(action: ResolvedAction, rider: RiderVM) {
    const spend = rider.spend;
    if (!spend) return;
    // The rider's semantic effect → the log glyph (extra damage → red Sword,
    // on-hit heal → green Heart). No economy slot — a rider rides a committed
    // attack, so the log row takes its semantic hue.
    const effect = rider.kind === "heal" ? "heal" : "damage";
    const message = t("combatLog.riderUse", {
      rider: rider.source,
      name: action.name,
    });
    // The availability guard lives INSIDE `execute` (returning null on a legal
    // bail), so redo re-validates it too — never trusting the history (§1.1). The
    // bail reason travels out on a holder object (a captured `let` would be narrowed
    // to its initial value by the closure-blind flow analysis).
    const bail: { message: string | null } = { message: null };
    if (
      registerUndoableToast(
        { message },
        () => {
          if (!guardLifeState()) return null;
          const cs = useCharacterStore.getState();
          let undoDebit: () => void;
          if (spend.kind === "tracker") {
            const trackerId = spend.trackerId;
            if (!liveTrackerAffordable(trackerId, 1)) {
              bail.message = t("combat.noUsesRemaining");
              return null;
            }
            cs.useTracker(trackerId, 1);
            undoDebit = () => useCharacterStore.getState().restoreTracker(trackerId, 1);
          } else {
            // Hit-die spend (Lifedrinker) — clamp to the live Hit-Die pool.
            const doc = cs.character;
            if (!doc) return null;
            const level = totalLevel(doc.character);
            const total = doc.character.hitDiceTotalOverride ?? level;
            const prevUsed = doc.session.hitDice.used;
            if (prevUsed >= total) {
              bail.message = t("combat.noHitDiceRemaining");
              return null;
            }
            cs.updateSession({ hitDice: { used: prevUsed + 1 } });
            undoDebit = () =>
              useCharacterStore.getState().updateSession({ hitDice: { used: prevUsed } });
          }
          // Log the rider spend as a STRUCTURED event — capture the id so the reverse
          // removes EXACTLY this line.
          const loggedId = cs.logEvent({
            kind: "rider-use",
            action: action.nameLoc,
            rider: rider.sourceLoc,
            effect,
          });
          return () => {
            undoDebit();
            useCharacterStore.getState().removeLogEntry(loggedId);
          };
        },
        { turnScoped: true }
      ) === null
    ) {
      if (bail.message) showToast({ message: bail.message, duration: 2000 });
      return;
    }
  }

  // S6 — apply a Rogue Cunning Strike option on an attack: debit the once-per-turn
  // Sneak Attack USE (the `rogue-sneak-attack` tracker, total 1) ONCE, log the
  // choice as a STRUCTURED rider-use event, and surface a 5s undo toast (the same
  // immediate-commit-with-undo model). The dice "cost" is the price the player
  // applies when rolling (no dice, ever) — the engine spends only the use. The
  // card disables an illegal option, but never trust the view: guard the live use.
  function applyCunningStrike(action: ResolvedAction, option: CunningStrikeVM) {
    const message = t("combat.cunningStrikeAppliedToast", {
      option: option.name,
      name: action.name,
    });
    if (
      registerUndoableToast(
        { message },
        () => {
          if (!guardLifeState()) return null;
          const cs = useCharacterStore.getState();
          // The once-per-turn use is the ONLY bail reason — a depleted tracker.
          if (!liveTrackerAffordable(SNEAK_ATTACK_TRACKER_ID, 1)) return null;
          cs.useTracker(SNEAK_ATTACK_TRACKER_ID, 1);
          const loggedId = cs.logEvent({
            kind: "rider-use",
            action: action.nameLoc,
            rider: option.nameLoc,
            effect: "damage",
          });
          return () => {
            useCharacterStore.getState().restoreTracker(SNEAK_ATTACK_TRACKER_ID, 1);
            useCharacterStore.getState().removeLogEntry(loggedId);
          };
        },
        { turnScoped: true }
      ) === null
    ) {
      showToast({ message: t("combat.noUsesRemaining"), duration: 2000 });
      return;
    }
  }

  // End Turn — PURE BOOKKEEPING (immediate-commit model). Resources were already
  // deducted when each action was used. SOLO it advances the local round (endTurn
  // folds round++ WITH the economy reset) and finalizes this turn's per-slot undos,
  // surfacing a 5s undo toast so a mis-tap restores the round + spent economy in one
  // go. ENCOUNTER (C5) it ADVANCES the shared turn pointer ONLY — the per-turn
  // economy resets at the START of your NEXT turn (when the shared pointer lands back
  // on your PC; the `useCombatStatusStore` subscription above), not here, so it is
  // robust even if you never formally End Turn (the DM advances you, you go AFK).
  function handleEndTurn() {
    const c = useCombatStore.getState();
    const charStore = useCharacterStore.getState();
    const combatStatusStore = useCombatStatusStore.getState();
    const encounterStatus = combatStatusStore.status;
    // A stale/off-turn control must be a true no-op. Check before any local
    // recovery, expiry, log, or boundary mutation; the shared CAS remains the
    // authoritative persistence guard.
    if (encounterStatus && !encounterStatus.isMyTurn) return;
    const boundaryAtEnd = charStore.expireEffectBoundaries({
      round: encounterStatus?.round ?? c.round,
      phase: "turn-end",
    });
    // USE-APPLIES (Task 2) — Rage-style `maintained` states end at the end of
    // your turn UNLESS a maintaining event happened this round. Two events are
    // AUTO-tracked from the durable per-round action receipts:
    //   • `"attack"` — an attack-roll or target-save action stamped this event.
    //     Merely occupying the Action slot (Dash/Help) never qualifies.
    // The `"bonus-extend"` maintainer (the dedicated "spend a Bonus Action to
    // extend") is NOT inferred from an arbitrary bonus action — that would over-
    // maintain; it is the prompt's own `Keep` affordance. A maintained state is
    // suppressed for THIS End Turn iff one of its declared `maintainedBy` events
    // actually happened this round; otherwise it surfaces a keep/end prompt —
    // never silently killed (the player may maintain off-app). Generic: reads the
    // metadata, no Rage special case. The check recomputes from scratch EVERY End
    // Turn (no latch) — a `Keep` clears only the current round, so the next idle
    // turn prompts AGAIN; a maintaining event clears only ITS round. Computed
    // BEFORE endTurn clears the per-round flags.
    const maintainedThisRound: ReadonlySet<string> = new Set(
      Object.values(c.selected)
        .flat()
        .flatMap((entry) => entry.triggerEvents ?? [])
    );
    // FRONTIER-S3 — run the turn/round recovery+expiry engine at this seam (the
    // owner's turn just ended → their next turn begins):
    //   • PER-TURN RECOVERY — auto-reset every `recovery: "per-turn"` tracker to
    //     full (Sneak Attack's once-per-turn use), so the rogue never un-ticks it.
    //   • TIMED EXPIRY — decrement every active `maxRounds` state's round timer and
    //     AUTO-DROP the ones that hit 0 (Rage at 100 rounds), logging an
    //     `effect-expired` line. Both return undo appliers folded into the End-Turn
    //     undo. Run BEFORE the maintenance prompt is committed so an EXPIRED state
    //     never also surfaces a keep/end prompt (a hard drop supersedes the soft one).
    const restorePerTurn = charStore.recoverPerTurnTrackers();
    const { expired, restore: restoreTimers } = charStore.advanceEffectTimers(
      encounterStatus?.round ?? c.round
    );
    const expiredKeys = new Set(expired.map((e) => e.activeKey));
    const doc = useCharacterStore.getState().character;
    const unmaintained = doc
      ? resolveActiveMaintainedEffects(doc).filter(
          (e) =>
            !expiredKeys.has(e.activeKey) &&
            !e.maintainedBy.some((m) => maintainedThisRound.has(m))
        )
      : [];
    setMaintenancePrompts(unmaintained);

    // ENCOUNTER (C5): End Turn just ADVANCES the shared turn pointer — the SAME
    // `advanceEncounterTurn` transaction the encounter's Next button calls (THE FIX
    // for the owner's live "round 6, 7, 8…" bug: never a private solo counter, never
    // the bogus solo "round started" toast that bumped `combatStore.round` while the
    // encounter stayed at round 1). The per-turn economy is NOT reset here — it
    // resets when the shared pointer LANDS BACK on this PC (turn-start, the
    // `useCombatStatusStore` subscription above), so the budget is always fresh at the
    // START of your turn even if you never formally End Turn (the DM advances you, you
    // go AFK, you join mid-combat). The just-committed economy + its 5s undo toasts
    // stay live through the brief hand-off (a mis-tap is still undoable right after
    // ending the turn; the toasts auto-expire). The per-turn recovery / timed-state
    // expiry above still ran — this player's turn just ended. Read the shared status
    // at CLICK time (getState — never a reactive subscription, so the §7.2
    // render-isolation of this provider holds).
    if (encounterStatus) {
      // DOUBLE-ACTIVATION CAS (optimistic layer): once the first End Turn optimistically
      // advanced, the status reads `isMyTurn === false`; a rapid second press then finds it
      // is no longer this PC's turn and no-ops here — so the optimistic pointer can't be
      // double-stepped even before the disarm re-renders (the persisted CAS mirrors this).
      // BUG 2 — flip the turn hand-off IMMEDIATELY (optimistic): publish the advanced status
      // + pip so the sheet band goes to its `waiting` state, the own-turn controls vanish,
      // and the pip flips quiet in THIS tick — instead of feeling dead for the
      // `runTransaction` server round-trip. The real snapshot reconciles it when it lands.
      const optimisticStatus = advanceGlobalCombat(encounterStatus);
      // FLICKER FIX — record the in-flight hand-off BEFORE publishing it: the producer's
      // reconcile keeps the turn optimistically advanced while the shared write is in flight,
      // so a lagging listener (the pip's shared-campaigns query re-firing first, or a peer's
      // `combat/state` echo re-running the status memo) can NEVER republish the pre-advance
      // "your turn" frame during the round-trip. Cleared the instant the real read lands (the
      // producer) or the write fails (`advanceSharedTurn`). See `combat-reconcile.ts`.
      combatStatusStore.setPendingTurn({
        campaignId: encounterStatus.campaignId,
        epoch: encounterStatus.encounter.epoch,
        fromId: encounterStatus.encounter.currentCombatantId ?? encounterStatus.myId,
        fromRound: encounterStatus.round,
      });
      combatStatusStore.set(
        optimisticStatus,
        syncPipToStatus(combatStatusStore.pip, optimisticStatus)
      );
      advanceSharedTurn(
        encounterStatus.campaignId,
        encounterStatus.myId,
        encounterStatus.encounter.currentCombatantId
      );
      // Timed-state expiry (Rage at its round cap) still surfaces its live feedback.
      for (const e of expired) {
        showToast({
          message: t("combatLog.effectExpired", {
            name: grantSourceLabel(e.sourceId, locale),
          }),
          duration: 4000,
        });
      }
      for (const e of boundaryAtEnd.expired) {
        showToast({
          message: t("combatLog.effectExpired", {
            name: grantSourceLabel(e.sourceId, locale),
          }),
          duration: 4000,
        });
      }
      return;
    }

    // SOLO — the immediate-next-turn path: `endTurn` bumps the local round AND clears
    // the turn economy (round++ folded with the reset), and we finalize this turn's
    // undo machinery NOW (the next turn starts right away). Snapshot the turn first so
    // a mis-tapped End Turn restores the round, the spent economy slots, the reaction
    // and the movement in one go (endTurn() replaces these wholesale, so the captured
    // references stay valid for restore).
    const prevTurn = {
      round: c.round,
      selected: c.selected,
      // B6 — restore the turn's budget too, so Undo-End-Turn re-allows the same
      // multi-action economy (an Action Surge turn stays a 2-action turn on undo).
      budget: c.budget,
      attacksUsed: c.attacksUsed,
      outcomeReceipts: c.outcomeReceipts,
      outcomeOrdinal: c.outcomeOrdinal,
      attackSwings: c.attackSwings,
      reactionUsed: c.reactionUsed,
      reactionUsedId: c.reactionUsedId,
      reactionOutcomeOccurrenceId: c.reactionOutcomeOccurrenceId,
      movementUsedFt: c.movementUsedFt,
      // Restored on Undo-End-Turn so the maintained-state check re-evaluates the
      // SAME round identically (a hit round stays a hit round through undo).
      damageTakenThisRound: c.damageTakenThisRound,
    };
    // COMPACTION (§1.4) — capture this turn's turn-scoped stack entries (each
    // committed slot's individual reverse-applier) and FOLD them into the single
    // End-Turn entry. `purgeTurnScoped` removes them from the stack and dismisses
    // their now-stale "X used — Undo" toasts (a turn-N toast left live into turn N+1
    // could otherwise fire a fresh commit's reverse-applier). Undoing End Turn
    // re-instates them, so every restored slot is again individually undoable — the
    // shipped re-arm behaviour, generalized onto the stack.
    const compacted = useUndoStore.getState().past.filter((e) => e.turnScoped);
    useUndoStore.getState().purgeTurnScoped();
    endTurn();
    // Fire the canonical engine turn boundary over the character's own world
    // (start lazily, complete-turn, mirror expiries) — fail-closed and
    // one-way; see `advanceSoloWorldTurn`. The legacy expiry engines below
    // keep running for every state the world does not own yet.
    advanceSoloWorldTurn(c.round);
    const boundaryAtStart = useCharacterStore.getState().expireEffectBoundaries({
      round: c.round + 1,
      phase: "turn-start",
    });
    const restoreReadied = expireReadiedSpell(c.round + 1);
    // Log the round advance as a STRUCTURED turn-end event (the new round number).
    // Undoable: removing the entry on undo keeps the log faithful to the restored turn.
    const turnLogId = useCharacterStore
      .getState()
      .logEvent({ kind: "turn-end", round: c.round + 1 });
    // FRONTIER-S3 — announce each auto-expired state (Rage at 100 rounds). The hard
    // drop already logged an `effect-expired` line + cleared the toggle; this is the
    // live feedback. Its undo rides the single End-Turn undo below.
    for (const e of expired) {
      // Reuse the combat-LOG expiry line — one semantic unit = one i18n key (rule 6).
      showToast({
        message: t("combatLog.effectExpired", {
          name: grantSourceLabel(e.sourceId, locale),
        }),
        duration: 4000,
      });
    }
    for (const e of [...boundaryAtEnd.expired, ...boundaryAtStart.expired]) {
      showToast({
        message: t("combatLog.effectExpired", {
          name: grantSourceLabel(e.sourceId, locale),
        }),
        duration: 4000,
      });
    }
    // Register the single, compaction-carrying End-Turn entry via the Pattern-B
    // helper: its reverse restores the round/economy AND re-instates the
    // compacted sub-entries, and its replay re-runs the whole `handleEndTurn`
    // (solo) so a fresh turn advance + compaction is re-performed and itself
    // undoable.
    registerUndoableResult(
      { message: t("combat.endTurnToast", { round: c.round + 1 }) },
      () => {
        useCombatStore.setState(prevTurn);
        useCharacterStore.getState().removeLogEntry(turnLogId);
        // FRONTIER-S3 — revert the turn/round engine's effects too: re-spend the
        // per-turn trackers we auto-reset, restore any auto-expired state's
        // timers/toggles/log. The whole step undoes atomically.
        restorePerTurn?.();
        restoreTimers();
        restoreReadied?.();
        boundaryAtStart.restore();
        boundaryAtEnd.restore();
        // Re-evaluate the maintenance prompt for the restored round (it was set for
        // the advanced round; undoing the round un-sets it).
        setMaintenancePrompts([]);
        // Re-instate the compacted sub-entries onto the stack WITHOUT clearing
        // `future` (the End-Turn entry was just moved there by the store's undo).
        useUndoStore.setState((s) => ({
          past: [...s.past, ...compacted].slice(-MAX_UNDO_DEPTH),
        }));
      },
      // The replay re-runs the whole solo End Turn — a fresh advance + compaction.
      () => handleEndTurn(),
      { turnScoped: true }
    );
  }

  // Pool-spend confirm. A plain pool commits now; a dice-healing pool turns the
  // selected dice into a concrete roll formula and continues to target review.
  function commitPreparedAction(
    defaultAction: ResolvedAction,
    execution: ActionExecution = TURN_EXECUTION
  ): PreparedCommit {
    return (afterCommit, artifact) => {
      const action = artifact?.action ?? defaultAction;
      pendingResolutionRef.current = {
        actionId: action.id,
        apply: afterCommit,
        ...(artifact?.outcomeOccurrenceId
          ? { occurrenceId: artifact.outcomeOccurrenceId }
          : {}),
        outcomes: artifact?.outcomes ?? [],
        ...(artifact?.targets ? { targets: artifact.targets } : {}),
      };
      return action.type === "reaction"
        ? void handleUseReaction(action, afterCommit)
        : handleSelect(action, afterCommit, execution);
    };
  }

  function handlePoolSpendConfirm(amount: number) {
    const pending = pendingPoolSpend;
    setPendingPoolSpend(null);
    setPoolSpendRequest(null);
    if (!pending || !canUseCharacter(pending.characterId)) return;
    if (pending.kind === "commit") {
      void commitIntoSlot(pending.action, pending.slot, amount, pending.execution);
      return;
    }
    const die = pending.action.summary.die;
    if (!die) return;
    const prepared: ResolvedAction = {
      ...pending.action,
      trackerCost: amount,
      summary: {
        ...pending.action.summary,
        healApply: { dice: `${amount}${die}`, bonus: 0 },
      },
    };
    pending.onPrepared(prepared, commitPreparedAction(prepared));
  }

  // Pool spend cancel — dismiss the prompt; nothing was committed.
  function handlePoolSpendCancel() {
    setPendingPoolSpend(null);
    setPoolSpendRequest(null);
  }

  // S4 — Arcane Recovery confirm: restore the chosen slots + debit the use in one
  // undoable flow (the picker already enforced the ⌈level/2⌉ cap).
  function handleArcaneRecoveryConfirm(slotLevels: number[]) {
    const characterId = arcaneRecoveryRequest?.characterId;
    setArcaneRecoveryRequest(null);
    if (!canUseCharacter(characterId) || slotLevels.length === 0) return;
    const count = slotLevels.length;
    const totalLevels = slotLevels.reduce((a, b) => a + b, 0);
    const message = t("combat.arcaneRecoveryToast", { count, levels: totalLevels });
    // `applyArcaneRecovery` mutates and returns its exact restore closure — the
    // `execute` the stack re-runs on redo (same chosen slots, deterministic).
    if (
      registerUndoableToast(
        { message },
        () => {
          if (!canUseCharacter(characterId) || !guardLifeState()) return null;
          const live = useCharacterStore.getState().character;
          if (!live || !liveTrackerAffordable(ARCANE_RECOVERY_FEATURE_ID, 1)) return null;
          if (
            !validateArcaneRecoveryPlan(
              classEntryLevel(live.character, "wizard"),
              slotLevels
            ).ok
          )
            return null;
          const remaining = new Map(
            live.character.spellSlots
              .filter((row) => !row.pactMagic)
              .map((row) => [
                row.level,
                live.session.spellSlots[slotUsageKey(row)]?.used ?? 0,
              ])
          );
          for (const level of slotLevels) {
            const used = remaining.get(level) ?? 0;
            if (used < 1) return null;
            remaining.set(level, used - 1);
          }
          return useCharacterStore
            .getState()
            .applyArcaneRecovery(slotLevels, ARCANE_RECOVERY_FEATURE_ID);
        },
        { turnScoped: true }
      ) === null
    )
      return;
  }

  // D4/S9 — resolve a spell chosen from a feature/item pool into the SAME
  // full-fidelity spell action every ordinary cast uses. The projection only
  // marks the chosen spell prepared in memory; it never mutates the build. Target
  // review then runs before the shared cast commit atomically claims economy,
  // spends the exact pool cost, records concentration/log state, applies effects,
  // and returns one undo for the whole act.
  function handleDivineInterventionCast(spellId: string) {
    const request = freeCastFromListRequest;
    if (
      request?.characterId !== useCharacterStore.getState().character?.id ||
      useCharacterStore.getState().readonly
    ) {
      setFreeCastFromListRequest(null);
      return;
    }
    setFreeCastFromListRequest(null);
    if (!request || !character) return;
    const { pool: requestedPool, opener, onPrepared } = request;
    const liveCharacter = useCharacterStore.getState().character;
    if (!liveCharacter) return;
    const pool = resolveFreeCastFromList(liveCharacter).find(
      (entry) => entry.sourceId === requestedPool.sourceId
    );
    if (!pool || !pool.spellIds.includes(spellId)) return;
    const cost = pool.costBySpell[spellId];
    if (cost === undefined) return;
    if (cost > pool.remaining) {
      showToast({ message: t("combat.noUsesRemaining"), duration: 2000 });
      return;
    }

    const existingSpell = liveCharacter.character.spells.find(
      (spell): spell is SrdSpellRef => !isCustomSpell(spell) && spell.srdId === spellId
    );
    const preparedSpell = {
      ...(existingSpell ?? { srdId: spellId }),
      prepared: true,
      ...(pool.casterAbility ? { spellAbilityOverride: pool.casterAbility } : {}),
    };
    const projectedSpells = existingSpell
      ? liveCharacter.character.spells.map((spell) =>
          spell === existingSpell ? preparedSpell : spell
        )
      : [...liveCharacter.character.spells, preparedSpell];
    const projected: typeof liveCharacter = {
      ...liveCharacter,
      character: { ...liveCharacter.character, spells: projectedSpells },
    };
    const baseAction = localizeActions(projected, locale).find(
      (action) => action.spellId === spellId && !action.summary.recurringUse
    );
    const spell = getSpellById(spellId);
    if (!baseAction || !spell) return;

    const option: CastLevelOption = {
      kind: "free-cast",
      sourceId: pool.payment?.kind === "tracker" ? pool.payment.trackerId : pool.sourceId,
      ...(pool.payment ? { payment: pool.payment } : {}),
      attributionSourceId: pool.sourceId,
      sourceName: pool.itemId
        ? localizeSrd("magic-item", pool.itemId, "name", locale)
        : grantSourceLabel(pool.sourceId, locale),
      level: spell.level,
      remaining: pool.remaining,
      total: pool.charges,
      recovery: pool.recovery,
      cost,
      ...(cost !== 1 ? { explicitCost: true as const } : {}),
      ...(pool.castOverrides ? { castOverrides: pool.castOverrides } : {}),
    };
    const action = actionForCastOption(
      {
        ...baseAction,
        type: opener.type,
        costsSlot: false,
        costTracker:
          pool.payment?.kind === "item-resource"
            ? undefined
            : pool.payment?.kind === "tracker"
              ? pool.payment.trackerId
              : pool.trackerId,
        ...(pool.payment?.kind === "item-resource"
          ? { resourcePayment: pool.payment, resourceCost: cost }
          : {}),
        costTrackerIsPool: true,
        trackerCost: cost,
      },
      option,
      spell.level
    );
    onPrepared(action, (afterCommit, artifact) => {
      const committedAction = artifact?.action ?? action;
      pendingResolutionRef.current = {
        actionId: committedAction.id,
        apply: afterCommit,
        ...(artifact?.outcomeOccurrenceId
          ? { occurrenceId: artifact.outcomeOccurrenceId }
          : {}),
        outcomes: artifact?.outcomes ?? [],
        ...(artifact?.targets ? { targets: artifact.targets } : {}),
      };
      void commitCastOption(committedAction, getEconomySlot(opener), option);
    });
  }

  // USE-APPLIES (Task 2) — keep an unmaintained state active (dismiss its
  // prompt); the override-first default that honors off-app maintenance.
  function keepMaintainedEffect(activeKey: string) {
    setMaintenancePrompts((prev) => prev.filter((e) => e.activeKey !== activeKey));
  }

  // End an unmaintained state now: clear its `activeFeatures` toggle (so every
  // while-active grant drops) and dismiss the prompt. Undoable via toast.
  function endMaintainedEffect(activeKey: string) {
    setMaintenancePrompts((prev) => prev.filter((e) => e.activeKey !== activeKey));
    const message = t("combat.maintainedEndedToast");
    // Character-state (not turn-scoped): survives an encounter turn-start purge.
    if (
      registerUndoableToast(
        { message },
        () => {
          const cs = useCharacterStore.getState();
          const wasActive = (cs.character?.session.activeFeatures ?? []).includes(
            activeKey
          );
          if (!wasActive) return null;
          cs.setActiveFeature(activeKey, false);
          return () => useCharacterStore.getState().setActiveFeature(activeKey, true);
        },
        { turnScoped: false }
      ) === null
    )
      return;
  }

  function prepareResolution(
    action: ResolvedAction,
    onPrepared: (action: ResolvedAction, commit: PreparedCommit) => void,
    execution: ActionExecution = TURN_EXECUTION
  ): void {
    if (!guardActionState(action)) return;
    const slot = getEconomySlot(action);
    const ridesPip = execution.consumesTurnEconomy && isPipAttack(action);
    if (action.castPoolSourceId && character) {
      const pool = resolveFreeCastFromList(character).find(
        (entry) => entry.sourceId === action.castPoolSourceId
      );
      if (pool) {
        setFreeCastFromListRequest({
          characterId: character.id,
          pool,
          opener: action,
          onPrepared,
        });
        return;
      }
    }
    if (
      action.summary.poolSpendEffect === "healing" &&
      action.costTracker &&
      action.costTrackerIsPool &&
      action.costTrackerUnit === "dice" &&
      !action.trackerCost &&
      action.summary.die
    ) {
      const tracker = trackerMap.get(action.costTracker);
      if (tracker) {
        setPendingPoolSpend({
          kind: "prepare",
          characterId: character?.id,
          action,
          onPrepared,
        });
        setPoolSpendRequest({
          featureName: action.name,
          unit: action.costTrackerUnit,
          max: Math.max(1, tracker.total - tracker.used),
        });
        return;
      }
    }
    if (
      configureSpellCast(
        action,
        slot,
        ridesPip,
        (finalAction, option, metamagicIds) =>
          onPrepared(finalAction, (afterCommit, artifact) => {
            const committedAction = artifact?.action ?? finalAction;
            pendingResolutionRef.current = {
              actionId: committedAction.id,
              apply: afterCommit,
              ...(artifact?.outcomeOccurrenceId
                ? { occurrenceId: artifact.outcomeOccurrenceId }
                : {}),
              outcomes: artifact?.outcomes ?? [],
              ...(artifact?.targets ? { targets: artifact.targets } : {}),
            };
            void commitCastOption(
              committedAction,
              slot,
              option,
              metamagicIds,
              ridesPip,
              execution
            );
          }),
        execution
      )
    )
      return;

    onPrepared(action, commitPreparedAction(action, execution));
  }

  function executeAction(action: ResolvedAction, intent?: ExecuteActionIntent): void {
    const execution = executionFor(action, intent?.ritual === true);
    if (!execution) return;
    const executable = execution.ritual ? asRitualAction(action) : action;
    prepareResolution(
      executable,
      (prepared, commit) => {
        const step = targetStepFor(prepared, targetRoster());
        if (!step) {
          commit(() => undefined, { action: prepared });
          return;
        }
        setTargetRequest({ characterId: character?.id, action: prepared, step, commit });
      },
      execution
    );
  }

  /** This player's combatant id: the live encounter's, else the uid-derived one. */
  /** The round this sheet is in: the shared encounter's, else the solo counter. */
  function currentRound(): number {
    const status = sheetEncounter(
      useCombatStatusStore.getState().status,
      useCharacterStore.getState().character?.id ?? null
    );
    return status?.round ?? useCombatStore.getState().round;
  }

  /** The readied spell as a castable action at the level it was cast with. */
  function readiedAction(): ResolvedAction | null {
    const doc = useCharacterStore.getState().character;
    const spellId = doc?.session.concentration;
    if (!doc?.session.readiedSpell || !spellId) return null;
    const spell = getSpellById(spellId);
    const base = spell
      ? localizeActions(doc, locale).find(
          (action) => action.spellId === spellId && !action.summary.recurringUse
        )
      : undefined;
    if (!spell || !base) return null;
    return actionAtCastLevel(
      base,
      spell,
      doc.session.concentrationCastLevel ?? spell.level
    );
  }

  /**
   * Release the readied spell with the Reaction (2024 Ready): the Reaction is spent,
   * the release is logged, a spell that needs no Concentration lets it go, and the
   * spell's follow-ups (the damage tray) open on the targets the cast picked. One undo.
   */
  function releaseReadiedSpell(): void {
    const doc = useCharacterStore.getState().character;
    const action = readiedAction();
    if (!doc || !action || useCombatStore.getState().reactionUsed) return;
    const targets = readiedTargets(doc);
    registerUndoableToast(
      { message: t("combat.readiedSpellReleasedToast", { name: action.name }) },
      () => {
        const live = useCharacterStore.getState();
        if (!live.character?.session.readiedSpell || live.readonly) return null;
        if (!markReactionUsed(READIED_SPELL_REACTION_ID)) return null;
        const loggedId = live.logEvent({
          kind: "reaction-use",
          action: action.nameLoc,
          effect: logTypeForAction(action),
          ...(targets.length > 0 ? { targets } : {}),
        });
        let restoreConcentration: (() => void) | undefined;
        const concentrationLogIds = releaseKeepsConcentration(live.character.session)
          ? []
          : live.setConcentration("", {
              undoable: false,
              captureUndo: (undo) => {
                restoreConcentration = undo;
              },
            });
        const undoDrop = restoreConcentration
          ? null
          : useCharacterStore.getState().setReadiedSpell(undefined);
        offerFollowUps(action, targets, loggedId);
        return () => {
          undoDrop?.();
          restoreConcentration?.();
          const current = useCharacterStore.getState();
          for (const id of [loggedId, ...concentrationLogIds]) current.removeLogEntry(id);
          useDamageTrayStore.getState().withdraw(loggedId);
          resetReaction();
        };
      },
      { turnScoped: false }
    );
  }

  /** {@link expireReadiedHold}, announced. */
  function expireReadiedSpell(round: number): (() => void) | null {
    const lost = expireReadiedHold(round);
    if (!lost) return null;
    showToast({
      message: t("combat.readiedSpellLostToast", {
        name: concentrationLabel(lost.spell, locale),
      }),
      duration: 4000,
    });
    return lost.restore;
  }

  function selfCombatantId(): string {
    const status = useCombatStatusStore.getState().status;
    const uid = useAuthStore.getState().user?.uid;
    return status?.myId ?? (uid ? `pc-${uid}` : "self");
  }

  function targetRoster() {
    const status = useCombatStatusStore.getState().status;
    return {
      selfId: selfCombatantId(),
      selfName: useCharacterStore.getState().character?.character.name ?? "",
      rows: status?.view.rows ?? [],
    };
  }

  // The async reaction handler is exposed as a fire-and-forget `() => void` on
  // the API (its concentration-break confirm runs internally); `void` keeps the
  // promise from leaking through the void-typed contract.
  const api: TurnEconomyApi = {
    executeAction,
    prepareResolution,
    handleSelect,
    handleUseReaction: (action) => void handleUseReaction(action),
    spendRider,
    applyCunningStrike,
    handleEndTurn,
    maintenancePrompts,
    keepMaintainedEffect,
    endMaintainedEffect,
    releaseReadiedSpell,
  };

  return (
    <TurnEconomyContext.Provider value={api}>
      {children}

      {/* Pool spend modal (Lay on Hands, etc.) — mounts fresh on each new request */}
      {poolSpendRequest && (
        <PoolSpendModal
          request={poolSpendRequest}
          onConfirm={handlePoolSpendConfirm}
          onCancel={handlePoolSpendCancel}
        />
      )}

      {/* Rich in-combat cast-level picker (upcast / free cast) — commits the
          chosen option immediately with undo. */}
      <CastLevelModal
        request={
          castRequest
            ? {
                spellName: castRequest.action.name,
                baseLevel: castRequest.baseLevel,
                options: castRequest.options,
                metamagic: castRequest.metamagic,
                sorceryRemaining: castRequest.sorceryRemaining,
                upcast: castRequest.upcast,
              }
            : null
        }
        onConfirm={(level, opt, metamagicIds) => {
          if (
            castRequest &&
            castRequest.characterId === useCharacterStore.getState().character?.id &&
            !useCharacterStore.getState().readonly
          ) {
            const finalAction = actionForCastOption(castRequest.action, opt, level);
            if (castRequest.onConfigured)
              castRequest.onConfigured(finalAction, opt, metamagicIds);
            else
              void commitCastOption(
                finalAction,
                castRequest.slot,
                opt,
                metamagicIds,
                castRequest.ridesPip ?? false,
                castRequest.execution
              );
          }
          setCastRequest(null);
        }}
        onCancel={() => setCastRequest(null)}
      />

      {/* The optional "On whom?" step: a pick (or Skip) commits; closing spends nothing. */}
      <TargetPickerModal
        request={
          targetRequest
            ? {
                actionName: targetRequest.action.name,
                isSpell: targetRequest.action.source === "spell",
                step: targetRequest.step,
              }
            : null
        }
        onConfirm={(targets) => {
          const request = targetRequest;
          setTargetRequest(null);
          if (request && canUseCharacter(request.characterId))
            request.commit(() => undefined, { action: request.action, targets });
        }}
        onCancel={() => setTargetRequest(null)}
      />

      {/* The damage tray right after the use: one rolled total, one row per target. */}
      <DamageTray />

      {/* S4 — Arcane Recovery guided picker (enforces the ⌈level/2⌉ cap).
          Conditional mounting gives every use a fresh, cancel-safe draft. */}
      {arcaneRecoveryRequest && (
        <ArcaneRecoveryModal
          request={arcaneRecoveryRequest}
          onConfirm={handleArcaneRecoveryConfirm}
          onCancel={() => setArcaneRecoveryRequest(null)}
        />
      )}

      {/* S6 — alternate-payment picker: every legal way to pay for an action, the
          primary cost + any `alternateCost`. Commits the chosen payment with undo. */}
      <PaymentPickerModal
        request={
          paymentRequest
            ? {
                actionName: paymentRequest.action.name,
                rows: paymentRequest.options.map((opt, index) => ({
                  index,
                  label: paymentOptionLabel(opt.cost),
                  remaining: paymentOptionRemaining(opt.cost),
                  affordable: paymentAffordable(opt.cost),
                  primary: opt.kind === "primary",
                })),
              }
            : null
        }
        onConfirm={(index) => {
          const opt = paymentRequest?.options[index];
          if (paymentRequest && opt && canUseCharacter(paymentRequest.characterId)) {
            commitPayment(
              paymentRequest.action,
              paymentRequest.slot,
              opt.cost,
              paymentRequest.execution
            );
          }
          setPaymentRequest(null);
        }}
        onCancel={() => setPaymentRequest(null)}
      />

      {/* D4 — Cleric Divine Intervention guided spell picker (any Cleric spell ≤ 5th,
          1/LR, no slot). Choosing a spell casts it + debits the tracker, with undo. */}
      <DivineInterventionModal
        pool={freeCastFromListRequest?.pool ?? null}
        locale={locale}
        onCast={handleDivineInterventionCast}
        onCancel={() => setFreeCastFromListRequest(null)}
      />
    </TurnEconomyContext.Provider>
  );
}
