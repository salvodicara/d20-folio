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
import { useCharacterStore } from "@/stores/characterStore";
import {
  useCombatStore,
  type EconomySlot,
  type SelectedAction,
} from "@/stores/combatStore";
import {
  snapshotTurnEconomy,
  syncCombatFromSession,
  turnEconomyKey,
} from "@/features/character/center/combat-hydration";
import { useToastStore } from "@/stores/toastStore";
import {
  useUndoStore,
  registerUndoableToast,
  registerUndoableResult,
  MAX_UNDO_DEPTH,
} from "@/stores/undoStore";
import {
  useCombatStatusStore,
  turnStartKey,
  shouldToastTurnStart,
} from "@/features/campaigns/global-combat-context";
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
import type { RiderVM } from "@/lib/views/rider-view";
import type { CunningStrikeVM } from "@/lib/views/cunning-strike-view";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { concentrationValue, customConcentrationValue } from "@/lib/concentration";
import { confirmConcentrationSwap } from "@/features/character/confirm-concentration";
import {
  resolveOnCastTrackerRefills,
  applyOnCastTrackerRefills,
  resolveOnCastSlotRegain,
  applyOnCastSlotRegain,
  resolveOnCastSurgeReminder,
} from "@/lib/on-cast-effects";
import {
  activeKeysForConcentration,
  aggregateCharacterGrants,
} from "@/lib/aggregate-character";
import { turnBoundaryAfter } from "@/lib/combat-effects";
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
import { METAMAGIC_BY_ID } from "@/data/metamagic";
import { getSpellById } from "@/data/spells";
import { slotUsageKey, bareSlotIsPact } from "@/lib/cast-options";
import { actionAtCastLevel } from "@/lib/cast-resolution";
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
} from "./useTurnEconomy";
import { advanceSharedTurn } from "./turn-state";
import type { StoredConcentration } from "@/types/ids";
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
    state.attackSwingIds !== prev.attackSwingIds ||
    state.reactionUsed !== prev.reactionUsed ||
    state.reactionUsedId !== prev.reactionUsedId ||
    state.movementUsedFt !== prev.movementUsedFt ||
    state.dashesThisTurn !== prev.dashesThisTurn ||
    state.spellSlotCastsThisTurn !== prev.spellSlotCastsThisTurn ||
    state.damageTakenThisRound !== prev.damageTakenThisRound ||
    state.nextAttackAdvantage !== prev.nextAttackAdvantage ||
    state.movementLocked !== prev.movementLocked
  );
}

/** The Rogue Sneak Attack feature's stable srdId — its once-per-turn use tracker
 *  is the resource a Cunning Strike option debits (golden rule 7 — a stable id). */
const SNEAK_ATTACK_TRACKER_ID = "rogue-sneak-attack";

/**
 * S1 — SURGICAL undo restore of a buff-cast's concentration chips.
 *
 * Undoing a concentration-buff cast restores `prevConc` via `setConcentration`,
 * whose LEG-2 clear strips the keys of the spell that WAS being concentrated on
 * (the cast spell). A blanket "re-add the whole pre-commit snapshot" restore would
 * RESURRECT a chip the player MANUALLY toggled OFF during the 5s undo window. So
 * re-add ONLY the keys that LEG-2 clear actually stripped — the chips the undo's
 * `setConcentration` retracted — and nothing else.
 *
 * The single exception is the cast's OWN `activatesKey` WHEN this commit auto-lit
 * it (`activated`): the OFF-guard already cleared it and its standing state ended
 * with the spell, so it must NOT come back. When the player had that chip lit BY
 * HAND before casting (`!activated`), it is NOT skipped — it returns like any other
 * hand-lit chip. Called AFTER the OFF-guard + BEFORE `setConcentration(prevConc)`,
 * reading the still-live cast concentration.
 */
function concentrationKeysToRestoreOnUndo(
  action: ResolvedAction,
  activated: boolean
): string[] {
  // Only a CONCENTRATION cast restores concentration in its undo, so only then is
  // there a LEG-2 strip to make surgical. A non-concentration cast (Shield) never
  // touches `setConcentration`, so it has nothing to re-add (the OFF-guard alone
  // reverts its chip) — return [] so an UNRELATED standing concentration buff can't
  // be re-lit here.
  if (!action.concentration) return [];
  const cur = useCharacterStore.getState().character;
  if (!cur) return [];
  const stripped = activeKeysForConcentration(
    cur.character,
    cur.session,
    cur.session.concentration
  );
  return activated ? stripped.filter((k) => k !== action.activatesKey) : stripped;
}

/** Apply the one shared active-state/cast-level/timer transaction and return its
 * surgical inverse. Feature and spell commit paths differ only in payment. */
function activateActionState(
  action: ResolvedAction,
  castLevel?: number
): { activated: boolean; restore: () => void } {
  const store = useCharacterStore.getState();
  const key = action.activatesKey;
  if (!key) return { activated: false, restore: () => undefined };
  const previousLevel = store.character?.session.activeSpellCastLevels?.[key];
  const previousConcentration = store.character?.session.concentration ?? "";
  const previousConcentrationCastLevel = store.character?.session.concentrationCastLevel;
  const previousConcentrationKeys = store.character
    ? activeKeysForConcentration(
        store.character.character,
        store.character.session,
        previousConcentration
      )
    : [];
  const previousConcentrationKeyLevels = Object.fromEntries(
    previousConcentrationKeys.flatMap((activeKey) => {
      const level = store.character?.session.activeSpellCastLevels?.[activeKey];
      return level === undefined ? [] : [[activeKey, level] as const];
    })
  );
  const activated = !(store.character?.session.activeFeatures ?? []).includes(key);
  if (activated) store.setActiveFeature(key, true);
  const restoreActivationTrackers = activated
    ? store.refreshTrackersOnActivation(key)
    : null;
  if (action.source === "spell") store.setActiveSpellCastLevel(key, castLevel);
  // An activated state can declaratively forbid Concentration (2024 Rage).
  // End the held spell through the ONE concentration seam so its standing chips
  // retract and the combat log remains truthful. The surrounding action undo
  // restores the whole prior concentration state atomically.
  const activatedCharacter = useCharacterStore.getState().character;
  const concentrationLogIds =
    activated &&
    previousConcentration &&
    activatedCharacter &&
    aggregateCharacterGrants(activatedCharacter.character, activatedCharacter.session)
      .concentrationBlocked
      ? useCharacterStore.getState().setConcentration("", { undoable: false })
      : [];
  const restoreTimer = action.activeDurationRounds
    ? store.armEffectTimer(key, action.activeDurationRounds)
    : null;
  const status = useCombatStatusStore.getState().status;
  const relativeBoundary = action.activeTurnBoundary
    ? turnBoundaryAfter(
        status?.myId ?? "self",
        action.activeTurnBoundary.turns,
        action.activeTurnBoundary.phase,
        status
          ? {
              round: status.round,
              currentCombatantId: status.encounter.currentCombatantId,
              phase: "turn-start",
              order: status.encounter.order ?? status.view.turnOrderIds,
            }
          : {
              round: useCombatStore.getState().round,
              currentCombatantId: "self",
              phase: "turn-start",
              order: ["self"],
            }
      )
    : null;
  const restoreBoundary = relativeBoundary
    ? store.armEffectBoundary(key, {
        round: relativeBoundary.round,
        phase: relativeBoundary.phase,
      })
    : null;
  return {
    activated,
    restore: () => {
      const current = useCharacterStore.getState();
      const canRestoreConcentration =
        concentrationLogIds.length > 0 &&
        current.character?.session.concentration === "" &&
        (current.character.session.activeFeatures ?? []).includes(key);
      if (activated) current.setActiveFeature(key, false);
      if (action.source === "spell") current.setActiveSpellCastLevel(key, previousLevel);
      restoreTimer?.();
      restoreBoundary?.();
      restoreActivationTrackers?.();
      if (canRestoreConcentration) {
        current.setConcentration(previousConcentration, {
          castLevel: previousConcentrationCastLevel,
          undoable: false,
          silent: true,
        });
        for (const activeKey of previousConcentrationKeys) {
          current.setActiveFeature(activeKey, true);
          current.setActiveSpellCastLevel(
            activeKey,
            previousConcentrationKeyLevels[activeKey]
          );
        }
      }
      for (const id of concentrationLogIds) current.removeLogEntry(id);
    },
  };
}

function applyActionConcentration(
  action: ResolvedAction,
  castLevel: number | undefined
): (activated: boolean) => void {
  const store = useCharacterStore.getState();
  const previousSpell: StoredConcentration = store.character?.session.concentration ?? "";
  const previousCastLevel = store.character?.session.concentrationCastLevel;
  const loggedIds = action.concentration
    ? store.setConcentration(
        action.spellId
          ? concentrationValue(action.spellId)
          : customConcentrationValue(action.name),
        { castLevel }
      )
    : [];
  return (activated) => {
    const restoreKeys = concentrationKeysToRestoreOnUndo(action, activated);
    const current = useCharacterStore.getState();
    if (action.concentration) {
      current.setConcentration(previousSpell, {
        castLevel: previousCastLevel,
        undoable: false,
        silent: true,
      });
    }
    for (const key of restoreKeys) current.setActiveFeature(key, true);
    for (const id of loggedIds) current.removeLogEntry(id);
  };
}

export function TurnEconomyProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const appendSelectedAction = useCombatStore((s) => s.selectAction);
  const deselectAction = useCombatStore((s) => s.deselectAction);
  const setBudget = useCombatStore((s) => s.setBudget);
  const setAttackBudget = useCombatStore((s) => s.setAttackBudget);
  const markReactionUsed = useCombatStore((s) => s.useReaction);
  const resetReaction = useCombatStore((s) => s.resetReaction);
  const endTurn = useCombatStore((s) => s.endTurn);
  const resetTurn = useCombatStore((s) => s.resetTurn);
  const showToast = useToastStore((s) => s.showToast);

  /** Shared live-state gate for deterministic action restrictions. Cards render
   * the same reason, while every commit entry point repeats the guard so stale
   * UI and prepared target flows cannot bypass it. */
  function actionStateBlockMessage(action: ResolvedAction): string | null {
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

  function guardActionState(action: ResolvedAction): boolean {
    const message = actionStateBlockMessage(action);
    if (!message) return true;
    showToast({ message, duration: 2500 });
    return false;
  }

  // Pool-spend prompt state. Ordinary variable-cost actions commit after the
  // amount; dice-healing pools configure their concrete roll first, then rejoin
  // the shared target resolver before any resource is spent.
  const [poolSpendRequest, setPoolSpendRequest] = useState<PoolSpendRequest | null>(null);
  const [pendingPoolSpend, setPendingPoolSpend] = useState<
    | { kind: "commit"; action: ResolvedAction; slot: EconomySlot }
    | {
        kind: "prepare";
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
  const [castRequest, setCastRequest] = useState<{
    action: ResolvedAction;
    slot: EconomySlot;
    baseLevel: number;
    options: CastLevelOption[];
    metamagic?: MetamagicCastRow[];
    sorceryRemaining?: number;
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
      option: CastLevelOption,
      metamagicIds: ReadonlyArray<string>
    ) => void;
  } | null>(null);

  // S4 — Arcane Recovery: tapping the 1/LR action opens a guided cap-enforcing
  // picker (instead of committing a bare tracker spend), then restores the chosen
  // slots + debits the use in one undoable flow.
  const [arcaneRecoveryRequest, setArcaneRecoveryRequest] =
    useState<ArcaneRecoveryRequest | null>(null);

  // S6 — alternate-payment: an action with MORE THAN ONE legal way to pay (a
  // declared `alternateCost`) opens this picker (the same `.cl-opts` recipe), then
  // commits the chosen payment immediately with undo. The engine
  // (`getActionCostOptions`) enumerates every payment; the player picks.
  const [paymentRequest, setPaymentRequest] = useState<{
    action: ResolvedAction;
    slot: EconomySlot;
    options: ActionCostOption[];
  } | null>(null);

  // D4 — Cleric Divine Intervention: tapping the 1/LR action opens a guided picker
  // over the Cleric spell list ≤ 5th (the engine-resolved pool); choosing a spell
  // casts it without a slot and debits the 1/LR tracker (immediate-commit-with-undo).
  const [freeCastFromListRequest, setFreeCastFromListRequest] = useState<{
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
  // intact combatStore instead of re-hydrating (and resetting) it.
  //
  // Sync combatStore from the persisted session on every snapshot (the payload
  // arrives async from Firestore, so this keys on the character — not the mount).
  // A FRESH character resets + seeds round/initiative hydrate-once; a LATER snapshot
  // of the SAME character reconciles the cross-client INITIATIVE (issue #41 — a
  // remotely-edited roll must re-sync onto the open sheet, never stay stale until
  // reload) while the solo round bookkeeping stays put. Both cases route through the
  // one shared policy (`syncCombatFromSession`); no extra listener (golden rule 24).
  const hydratedCharIdRef = useRef<string | null>(null);
  // The target resolver can finish before an upcast/payment picker. Hold its reviewed
  // consequences until the action truly commits; cancelling a later picker therefore
  // spends and applies nothing. Only one modal flow can be active at a time.
  type ResolutionUndo = () => void;
  type ResolutionApply = () => ResolutionUndo | undefined;
  const pendingResolutionRef = useRef<{
    actionId: string;
    apply: ResolutionApply;
  } | null>(null);
  const pendingResolutionFor = (action: ResolvedAction): ResolutionApply | null => {
    const pending = pendingResolutionRef.current;
    return pending?.actionId === action.id ? pending.apply : null;
  };
  const clearPendingResolution = (action: ResolvedAction): void => {
    const pending = pendingResolutionRef.current;
    if (!pending || pending.actionId !== action.id) return;
    pendingResolutionRef.current = null;
  };
  const withResolutionUndo = (
    undoAction: () => void,
    applyResolution: ResolutionApply | null
  ): (() => void) => {
    const undoResolution = applyResolution?.();
    return () => {
      undoResolution?.();
      undoAction();
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
      hydratedCharIdRef.current,
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
      hydratedCharIdRef.current = character.id;
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

  // C5 — RESET THE PER-TURN ECONOMY AT TURN-START (encounter). The action / bonus /
  // reaction / movement budget refreshes when the SHARED turn pointer LANDS on this
  // PC (the start of YOUR turn), not when you press End Turn — so it is always fresh
  // even if you never formally end your turn (the DM advances you, you go AFK, the DM
  // rewinds, you join mid-combat). REUSES the C4 turn-start signal (`turnStartKey` +
  // `shouldToastTurnStart` — the SAME pure transition the pip's "it's your turn" toast
  // fires on, never a second isMyTurn detector); we observe it HERE too because this
  // provider owns the transient per-slot undo refs the reset must finalize alongside
  // `resetTurn`. A NON-reactive store subscription (never a selector), so the provider
  // doesn't re-render on a combat tick (§7.2 render-isolation) — mirroring the
  // round/initiative persistence subscription above. Solo (status always null →
  // `turnStartKey` always null) this never fires; the solo End-Turn `endTurn()` resets
  // the economy there (every turn is yours), so there is no double-reset.
  useEffect(() => {
    const initialStatus = useCombatStatusStore.getState().status;
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
    // Prime to the CURRENT key (not `undefined`) so a reload while already on your
    // turn never spuriously resets — the reset fires only on a genuine entry into a
    // NEW turn (the key moving to a fresh non-null value).
    let seenTurnKey = turnStartKey(useCombatStatusStore.getState().status);
    return useCombatStatusStore.subscribe((s) => {
      const key = turnStartKey(s.status);
      if (shouldToastTurnStart(seenTurnKey, key)) {
        const boundaryExpiry = s.status
          ? useCharacterStore.getState().expireEffectBoundaries({
              round: s.status.round,
              phase: "turn-start",
            })
          : { expired: [], restore: () => undefined };
        resetTurn();
        // Finalize the just-ended turn's undo machinery: PURGE the turn-scoped
        // entries (dismissing their lingering toasts) — the economy they reversed was
        // reset by the DM-driven turn cycle, so un-committing a last-turn action would
        // refund resources while its slot-legs no-op (an asymmetric half-undo).
        // Character-state entries (HP, conditions) SURVIVE: their reverse-appliers
        // don't touch the per-turn economy (§1.4 encounter turn-start).
        useUndoStore.getState().purgeTurnScoped();
        for (const effect of boundaryExpiry.expired) {
          showToast({
            message: t("combatLog.effectExpired", {
              name: grantSourceLabel(effect.sourceId, locale),
            }),
            duration: 4000,
          });
        }
      }
      seenTurnKey = key;
    });
  }, [character?.id, locale, resetTurn, showToast, t]);

  // ENCOUNTER ENDED → SOLO AT BASELINE (owner-ratified 2026-07-03). When the OPEN hero's
  // encounter ends (the DM ends the fight, or this PC is removed), the shell status for this
  // sheet drops to absent, so the band reverts to solo. The sheet must return to BASELINE —
  // round 1, economy re-armed, movement full, initiative cleared — even if the sheet was open
  // when it happened (no stuck `waiting` economy): the encounter WAS the combat, so no stale
  // pre-encounter solo state resumes. `endCombat()` resets the whole combat-turn store (round
  // / selected / budget / reaction / movement / initiative); the round+initiative persistence
  // subscription writes the baseline back. A NON-reactive store subscription (never a
  // selector) so the provider doesn't re-render on a combat tick (§7.2), mirroring the
  // turn-start reset above. Scoped to the OPEN hero (`characterId` match) so ending ANOTHER
  // hero's fight — while a non-encounter hero of the same user is open — never resets this
  // sheet. A character SWITCH is owned by the hydrate effect (it doesn't fire here — a switch
  // changes the open id, not the status). Solo throughout (status always null) → never fires.
  useEffect(() => {
    const matches = (
      status: ReturnType<typeof useCombatStatusStore.getState>["status"]
    ): boolean => {
      const openId = useCharacterStore.getState().character?.id ?? null;
      return status != null && status.characterId === openId;
    };
    return useCombatStatusStore.subscribe((s, prev) => {
      // The open hero WAS in this encounter and now is not → return to solo baseline.
      if (!matches(prev.status) || matches(s.status)) return;
      useCombatStore.getState().endCombat();
      // Encounter ended / PC removed → purge the turn-scoped economy entries
      // (same reasoning as turn-start; §1.4). Character-state undos survive.
      useUndoStore.getState().purgeTurnScoped();
    });
  }, []);

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
    attackOf?: { n: number; total: number }
  ): () => void {
    const cs = useCharacterStore.getState();
    const prevEquipment = cs.character?.character.equipment ?? [];
    // USE-APPLIES — snapshot temp HP BEFORE applying this action's deterministic
    // effects, so undo restores the exact prior pool (temp HP don't stack — we
    // apply the higher of current/granted, then the reverse-applier sets it back).
    const prevTempHp = cs.character?.session.hp.temp ?? 0;
    // A bare slot cost (no cast-option pool pick — a feature/custom-spell commit)
    // resolves its pool from the slot table: normal when one exists, else Pact
    // (a pure Warlock). Computed ONCE so spend + undo target the SAME counter (B3).
    const slotIsPact =
      action.costsSlot && action.slotLevel != null
        ? bareSlotIsPact(cs.character?.character.spellSlots ?? [], action.slotLevel)
        : false;
    if (action.costsSlot && action.slotLevel != null) {
      cs.useSpellSlot(action.slotLevel, slotIsPact);
    } else if (action.costTracker) {
      cs.useTracker(action.costTracker, trackerAmount ?? action.trackerCost);
    } else if (action.costEquipment) {
      cs.useEquipmentItem(action.costEquipment);
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
    });
    return () => {
      const c2 = useCharacterStore.getState();
      if (action.costsSlot && action.slotLevel != null) {
        c2.restoreSpellSlot(action.slotLevel, slotIsPact);
      } else if (action.costTracker) {
        c2.restoreTracker(action.costTracker, trackerAmount ?? action.trackerCost);
      } else if (action.costEquipment) {
        const cur = c2.character;
        if (cur) {
          c2.setCharacter({
            ...cur,
            character: { ...cur.character, equipment: prevEquipment },
          });
        }
      }
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
    };
  }

  // Display record for the economy slot.
  function toSelectedAction(
    action: ResolvedAction,
    slot: EconomySlot,
    castOption?: CastLevelOption
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
      cost,
    };
  }

  /** Allocate a proposed Action against the live mix of ordinary and restricted
   * slots. The assignment is order-independent: a Haste-legal Dash taken first
   * cannot accidentally consume the only unrestricted Action needed by a spell. */
  function appendWithinActionRules(action: SelectedAction): boolean {
    if (action.slot !== "action") return appendSelectedAction(action);
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
    return appendSelectedAction(action);
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
    if (!(await confirmConcentrationBreak(action))) return;
    const store = useCombatStore.getState();
    const total = store.attackBudget;
    const n = (store.attacksUsed % total) + 1;
    const message = t("combat.attackSwingToast", { name: action.name, n, total });
    const applyResolution = pendingResolutionFor(action);
    // Register on the undo stack: `execute` logs the swing (via the shared
    // `commitAction`, stamped with the count) + claims/rides an Attack action; it
    // bails (null) when no Attack slot is free (nothing spent). Redo re-runs it.
    if (
      registerUndoableToast(
        { message },
        () => {
          // The swing's own effects (log line stamped with the count;
          // concentration/buff for a War-Magic cantrip; weapons carry none).
          const undoEffects = commitAction(action, undefined, { n, total });
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
            useCombatStore.getState().commitAttackSwing(groupEntry, action.id) === null
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
    trackerAmount?: number
  ) {
    if (!guardActionState(action)) return;
    if (!(await confirmConcentrationBreak(action))) return;
    const applyResolution = pendingResolutionFor(action);
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
          if (action.costTracker && action.costTrackerIsPool) {
            const cost = trackerAmount ?? action.trackerCost ?? 1;
            const live = useCharacterStore.getState().character;
            const tracker = live
              ? resolveTrackers(live).find((entry) => entry.id === action.costTracker)
              : undefined;
            if (!tracker || tracker.total - tracker.used < cost) return null;
          }
          const undoCost = commitAction(action, trackerAmount);
          if (!appendWithinActionRules(toSelectedAction(action, slot))) {
            undoCost();
            return null;
          }
          return withResolutionUndo(() => {
            // Occupant-checked (idempotent): a no-op if this action already left its
            // slot, so a stray reverse can never double-refund (§5.2).
            if (!useCombatStore.getState().selected[slot].some((a) => a.id === action.id))
              return;
            undoCost();
            deselectAction(action.id);
          }, applyResolution);
        },
        { turnScoped: true }
      ) === null
    )
      return;
    clearPendingResolution(action);
  }

  // Commit a spell at a CHOSEN cast option (upcast slot level / free cast /
  // at-will mastery), deducting the right resource immediately with undo. Async
  // — awaits the promise-based concentration-break gate before any deduction.
  // ATTACK-PIPS — `ridesPip` (War Magic) makes the confirmed cast REPLACE one
  // attack of the in-progress Attack action: it consumes an attack pip via
  // `commitAttackSwing` instead of appending into a fresh Action slot; every
  // resource/Metamagic/concentration leg above is IDENTICAL (rule 6 — one cast
  // commit path, the pip only swaps the economy claim at the end).
  async function commitCastOption(
    action: ResolvedAction,
    slot: EconomySlot,
    opt: CastLevelOption,
    metamagicIds: ReadonlyArray<string> = [],
    ridesPip = false
  ) {
    if (!guardActionState(action)) return;
    if (!(await confirmConcentrationBreak(action))) return;
    const applyResolution = pendingResolutionFor(action);
    // ATTACK-PIPS — a pip-riding cast is a counted swing: read the swing position
    // BEFORE the commit runs so the log line + toast carry "attack n of total".
    const pipStore = ridesPip ? useCombatStore.getState() : null;
    const attackOf = pipStore
      ? {
          n: (pipStore.attacksUsed % pipStore.attackBudget) + 1,
          total: pipStore.attackBudget,
        }
      : undefined;
    const message = attackOf
      ? t("combat.attackSwingToast", {
          name: action.name,
          n: attackOf.n,
          total: attackOf.total,
        })
      : t("combat.actionUsedToast", { name: action.name });
    // Register on the undo stack: `execute` deducts the resource, applies every
    // cast leg (ward refill / slot regain / Metamagic / concentration / while-active
    // buff / log), and claims the economy (a pip swing OR a fresh slot), returning
    // the combined reverse; it bails (null, refunding) when no swing/slot fits. Redo
    // re-runs the SAME resolved cast (same slot level, same Metamagic) — never
    // re-opening a picker (golden rule 21).
    if (
      registerUndoableToast(
        { message },
        () => {
          if (!castOptionAffordable(opt)) return null;
          const cs = useCharacterStore.getState();
          if (opt.kind === "slot") cs.useSpellSlot(opt.level, opt.pactMagic);
          else if (opt.kind === "free-cast") cs.useTracker(opt.sourceId, opt.cost);
          // RA-08 — a SLOT-paid cast counts toward the 2024 one-spell-slot-per-turn
          // advisory (cantrips + free casts spend no slot, so they don't count). The
          // banner surfaces a hint when >1 has been spent — never a block; undo below
          // decrements it.
          const restoreSlotCast =
            opt.kind === "slot" ? useCombatStore.getState().commitSpellSlotCast() : null;
          // "mastery" → at-will, no resource.
          // On-cast trigger (S4 follow-on) — a SLOT-paid cast can refill a feature's
          // tracker (Wizard Abjurer Arcane Ward: an Abjuration spell of slot level N
          // regains 2×N ward HP). The resolver branches on the cast spell's stable
          // school token + the feature srdId (rule 7). `restoreTracker` reduces
          // `used`, clamped at 0 — override-first (the ward stays editable). Each
          // refill's inverse (re-spend) is folded into the reverse below.
          const wardRefills =
            opt.kind === "slot" && cs.character
              ? resolveOnCastTrackerRefills(cs.character, action.spellId, opt.level)
              : [];
          const undoWardRefills = applyOnCastTrackerRefills(cs, wardRefills);
          // On-cast slot regain (S4) — a slot-paid Divination cast can un-expend ONE
          // lower spell slot (Wizard Diviner Expert Divination). Its inverse folds in.
          const slotRegain =
            opt.kind === "slot" && cs.character
              ? resolveOnCastSlotRegain(cs.character, action.spellId, opt.level)
              : null;
          const undoSlotRegain = applyOnCastSlotRegain(cs, slotRegain);
          // Per-cast Metamagic (Sorcerer) — debit one Sorcery-Point cost per selected
          // option from the `sorcerer-font-of-magic` pool (stable id only, rule 7).
          const metamagicCost = metamagicIds.reduce(
            (sum, id) => sum + (METAMAGIC_BY_ID.get(id)?.cost ?? 0),
            0
          );
          if (metamagicCost > 0) cs.useTracker("sorcerer-font-of-magic", metamagicCost);
          // Store the spell's STABLE id (golden rule 7); a custom spell stamps its
          // name behind the `custom:` marker — never a bare SRD name.
          const restoreConcentration = applyActionConcentration(action, opt.level);
          // S1 — casting a while-active BUFF spell ESTABLISHES its standing state, so
          // light its chip + every while-active grant now. Only flips when OFF so undo
          // never clears a hand-set state; arms the round countdown. Read state FRESH.
          const activation = activateActionState(action, opt.level);
          // Log a STRUCTURED action-use event (semantic effect → glyph, economy slot →
          // colour). Capture the id so the reverse removes only THIS line.
          const loggedId = cs.logEvent({
            kind: "action-use",
            action: action.nameLoc,
            effect: logTypeForAction(action),
            slot: action.type,
            ...(attackOf ? { attackOf } : {}),
          });
          const undoLegs = () => {
            const c2 = useCharacterStore.getState();
            if (opt.kind === "slot") c2.restoreSpellSlot(opt.level, opt.pactMagic);
            else if (opt.kind === "free-cast") c2.restoreTracker(opt.sourceId, opt.cost);
            // RA-08 — decrement the one-slot-per-turn advisory counter on undo.
            restoreSlotCast?.();
            if (metamagicCost > 0)
              c2.restoreTracker("sorcerer-font-of-magic", metamagicCost);
            undoWardRefills();
            undoSlotRegain();
            // SURGICAL concentration restore: clear the chip THIS commit auto-lit,
            // compute the hand-lit chips the concentration restore will strip, restore
            // concentration (strips them), re-add ONLY those (the cast's own key
            // excluded) — never resurrecting a chip the player toggled OFF (S1).
            activation.restore();
            restoreConcentration(activation.activated);
            c2.removeLogEntry(loggedId);
          };
          // ATTACK-PIPS (War Magic) — the cast consumes an attack pip instead of a
          // fresh Action slot: claim/ride the Attack action. Bail (refunding) if none.
          if (ridesPip && attackOf) {
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
              useCombatStore.getState().commitAttackSwing(groupEntry, action.id) === null
            ) {
              undoLegs();
              return null;
            }
            return withResolutionUndo(() => {
              useCombatStore.getState().undoAttackSwing();
              undoLegs();
            }, applyResolution);
          }
          // Append into the slot; bail (refunding) if the budget is already full.
          if (!appendWithinActionRules(toSelectedAction(action, slot, opt))) {
            undoLegs();
            return null;
          }
          return withResolutionUndo(() => {
            // Occupant-checked (idempotent): a no-op if this action already left its
            // slot, so a stray reverse can never double-refund (§5.2).
            if (!useCombatStore.getState().selected[slot].some((a) => a.id === action.id))
              return;
            undoLegs();
            deselectAction(action.id);
          }, applyResolution);
        },
        // The one-snackbar rule folds a pip cast into the same evolving
        // Attack-action announcement (no stacking).
        { turnScoped: true }
      ) === null
    ) {
      // A pip swing that found no room says so; a full ordinary slot bails silently
      // (the card guard should have prevented it — never trust the view).
      if (ridesPip) showToast({ message: t("combat.noAttackSlots"), duration: 2500 });
      return;
    }
    clearPendingResolution(action);
    // Wild Magic Surge (Sorcerer Wild Magic) — a DISPLAY-ONLY post-cast reminder,
    // independent of the cast's undo. No mutation, no dice (golden rule 21).
    if (opt.kind === "slot") {
      const doc = useCharacterStore.getState().character;
      if (doc && resolveOnCastSurgeReminder(doc, action.spellId, opt.level)) {
        showToast({ message: t("combat.wildMagicSurgeReminder"), duration: 6000 });
      }
    }
  }

  // S6 — project a chosen alternate payment onto the action's cost fields so the
  // ONE `commitIntoSlot` machinery (deduct + undo + toast + concentration) commits
  // it. The two payment kinds in play are a spell slot or a tracker spend (the
  // only `alternateCost` kinds in the data); each maps cleanly onto the cost
  // fields `commitAction` reads — no parallel commit path.
  function actionWithCost(action: ResolvedAction, cost: ActionCostOption["cost"]) {
    if (cost.kind === "spell-slot") {
      return {
        ...action,
        costsSlot: true,
        slotLevel: cost.minLevel,
        costTracker: undefined,
        costEquipment: undefined,
      };
    }
    if (cost.kind === "tracker") {
      return {
        ...action,
        costsSlot: false,
        slotLevel: undefined,
        costTracker: cost.trackerId,
        trackerCost: cost.amount ?? 1,
        costTrackerIsPool: cost.pool ?? false,
        costEquipment: undefined,
      };
    }
    // Equipment / mastery / none — commit the action as declared (no remap).
    return action;
  }

  // S6 — whether a payment is affordable right now (the picker disables the rest;
  // constrained input). A slot payment needs an open slot ≥ its minLevel; a tracker
  // payment needs remaining uses. Other kinds (mastery/none) are always affordable.
  function paymentAffordable(cost: ActionCostOption["cost"]): boolean {
    if (!character) return false;
    if (cost.kind === "spell-slot") {
      return character.character.spellSlots.some((s) => {
        if (s.level < cost.minLevel) return false;
        // Each pool (normal vs pact) is checked against its OWN counter (B3) —
        // a slot is affordable iff THAT pool has an opening, never the conflation
        // of both pools' totals against one key.
        const used = character.session.spellSlots[slotUsageKey(s)]?.used ?? 0;
        return used < s.total;
      });
    }
    if (cost.kind === "tracker") {
      const tr = trackerMap.get(cost.trackerId);
      return tr ? tr.total - tr.used >= (cost.amount ?? 1) : false;
    }
    return true;
  }

  /** Revalidate a configured cast against LIVE state. The picker is only a
   * proposal: a sync, another action, or redo may have spent the resource in the
   * meantime, and no commit path may overdraw it. */
  function castOptionAffordable(opt: CastLevelOption): boolean {
    const doc = useCharacterStore.getState().character;
    if (!doc) return false;
    if (!opt.kind || opt.kind === "slot") {
      const row = doc.character.spellSlots.find(
        (entry) =>
          entry.level === opt.level && Boolean(entry.pactMagic) === Boolean(opt.pactMagic)
      );
      return Boolean(
        row && (doc.session.spellSlots[slotUsageKey(row)]?.used ?? 0) < row.total
      );
    }
    if (opt.kind === "free-cast") {
      const tracker = resolveTrackers(doc).find((entry) => entry.id === opt.sourceId);
      return tracker !== undefined && tracker.total - tracker.used >= opt.cost;
    }
    return true;
  }

  /**
   * One shared spell-configuration seam for both ordinary card commits and the
   * encounter resolver. `onConfigured` changes only the final destination: the
   * same option rows and Metamagic rules are used either way.
   */
  function configureSpellCast(
    action: ResolvedAction,
    slot: EconomySlot,
    ridesPip: boolean,
    onConfigured?: (
      action: ResolvedAction,
      option: CastLevelOption,
      metamagicIds: ReadonlyArray<string>
    ) => void
  ): boolean {
    if (action.summary.recurringUse) return false;
    if (action.source !== "spell" || !action.spellId || !character) return false;

    const isCantrip = (action.spellLevel ?? 0) === 0;
    const baseLevel = action.slotLevel ?? action.spellLevel ?? 1;
    const options = isCantrip
      ? []
      : resolveSpellCastOptions(character, action.spellId, baseLevel, true, locale, {
          mastery: t("spellPrep.spellMasteryBadge"),
          signature: t("spellPrep.signatureSpellBadge"),
        });
    if (!isCantrip && options.length === 0) {
      showToast({ message: t("combat.noSlotsRemaining"), duration: 2000 });
      return true;
    }

    const metamagic: MetamagicCastRow[] = resolveMetamagicForCast(
      character,
      action.spellId
    ).map((m) => ({
      id: m.id,
      name: localizeSrd("metamagic", m.id, "name", locale),
      cost: m.cost,
      affordable: m.affordable,
      appliesToSpell: m.appliesToSpell,
      stacksWithPrimary: m.stacksWithPrimary,
    }));
    const spellData = getSpellById(action.spellId);
    const finish = (
      option: CastLevelOption,
      metamagicIds: ReadonlyArray<string>
    ): void => {
      const finalAction = actionAtCastLevel(action, spellData, option.level);
      if (onConfigured) onConfigured(finalAction, option, metamagicIds);
      else void commitCastOption(finalAction, slot, option, metamagicIds, ridesPip);
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
      action,
      slot,
      baseLevel,
      options,
      metamagic: metamagic.length > 0 ? metamagic : undefined,
      sorceryRemaining: remainingSorceryPoints(character),
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
  function handleSelect(action: ResolvedAction, onCommitted?: ResolutionApply) {
    if (!guardActionState(action)) return;
    pendingResolutionRef.current = onCommitted
      ? { actionId: action.id, apply: onCommitted }
      : null;
    const slot = getEconomySlot(action);

    // Already the committed occupant → the card's CTA is disabled ("Used"), so
    // this is unreachable from the UI — kept as a silent defensive bail ("never
    // trust the view"): a stale tap must never double-commit or open a picker.
    if (useCombatStore.getState().selected[slot].some((a) => a.id === action.id)) {
      return;
    }

    // Condition gate — the Incapacitated family forbids the slot.
    const blockedSlots = resolveConditionEffects(
      character ? effectiveSessionConditions(character.session) : []
    ).blockedSlots;
    if (slot !== "free" && blockedSlots.has(slot)) {
      showToast({ message: t("combat.slotBlockedByCondition"), duration: 2500 });
      return;
    }

    // Exhausted tracker → can't use.
    if (action.summary.uses && action.summary.uses.current <= 0) {
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
    const ridesPip = isPipAttack(action);
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
      setArcaneRecoveryRequest({ wizardLevel, expended });
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
    if (configureSpellCast(action, slot, ridesPip)) return;

    // Variable-cost (pool) action → prompt for the amount, THEN commit.
    if (action.costTracker && action.costTrackerIsPool && !action.trackerCost) {
      const tracker = trackerMap.get(action.costTracker);
      if (tracker) {
        setPendingPoolSpend({ kind: "commit", action, slot });
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
    const costOptions = getActionCostOptions(action);
    if (costOptions.length > 1) {
      setPaymentRequest({ action, slot, options: costOptions });
      return;
    }

    void commitIntoSlot(action, slot);
  }

  // S6 — commit a chosen alternate payment: remap the action's cost fields to the
  // picked payment, then route through the ONE `commitIntoSlot` (deduct + undo +
  // toast + concentration). Fire-and-forget — `commitIntoSlot` awaits the
  // concentration-break gate internally.
  function commitPayment(
    action: ResolvedAction,
    slot: EconomySlot,
    cost: ActionCostOption["cost"]
  ) {
    void commitIntoSlot(actionWithCost(action, cost), slot);
  }

  // Handle reaction use (immediate commit, not part of turn queue). Async — the
  // concentration-break gate (D24) is a promise-based confirm dialog.
  async function handleUseReaction(
    action: ResolvedAction,
    onCommitted?: ResolutionApply,
    cast?: {
      option: CastLevelOption;
      metamagicIds: ReadonlyArray<string>;
    }
  ) {
    if (!guardActionState(action)) return;
    pendingResolutionRef.current = onCommitted
      ? { actionId: action.id, apply: onCommitted }
      : null;
    // A spent reaction DISABLES every reaction CTA ("Used" — the CTA grammar),
    // so this is unreachable from the UI — a silent defensive bail ("never
    // trust the view"), not a redundant "already used" toast.
    if (useCombatStore.getState().reactionUsed) return;
    // Incapacitated and its kin forbid reactions too.
    const blockedSlots = resolveConditionEffects(
      character ? effectiveSessionConditions(character.session) : []
    ).blockedSlots;
    if (blockedSlots.has("reaction")) {
      showToast({ message: t("combat.slotBlockedByCondition"), duration: 2500 });
      return;
    }

    if (!(await confirmConcentrationBreak(action))) return;
    const applyResolution = pendingResolutionFor(action);
    const message = t("combat.reactionToast", { name: action.name });
    // Register on the undo stack: `execute` marks the reaction used, deducts the
    // resource, applies concentration + any while-active buff, and logs the row,
    // returning the combined reverse. Redo re-runs the SAME resolved reaction.
    if (
      registerUndoableToast(
        { message },
        () => {
          markReactionUsed(action.id);
          const characterStore = useCharacterStore.getState();
          // Resolve the slot pool once (normal vs Pact for a pure Warlock) so the
          // spend and the reverse hit the SAME counter (B3).
          const reactionSlotIsPact =
            cast?.option.kind === "slot"
              ? cast.option.pactMagic
              : action.costsSlot && action.slotLevel != null
                ? bareSlotIsPact(
                    characterStore.character?.character.spellSlots ?? [],
                    action.slotLevel
                  )
                : false;
          if (cast?.option.kind === "slot") {
            characterStore.useSpellSlot(cast.option.level, cast.option.pactMagic);
          } else if (cast?.option.kind === "free-cast") {
            characterStore.useTracker(cast.option.sourceId, cast.option.cost);
          } else if (!cast && action.costsSlot && action.slotLevel != null) {
            characterStore.useSpellSlot(action.slotLevel, reactionSlotIsPact);
          } else if (action.costTracker) {
            characterStore.useTracker(action.costTracker, action.trackerCost);
          }
          const metamagicCost = (cast?.metamagicIds ?? []).reduce(
            (sum, id) => sum + (METAMAGIC_BY_ID.get(id)?.cost ?? 0),
            0
          );
          if (metamagicCost > 0)
            characterStore.useTracker("sorcerer-font-of-magic", metamagicCost);
          // Store the spell's STABLE id (golden rule 7); a custom spell stamps its
          // name behind the `custom:` marker, never a bare SRD name.
          const castLevel =
            cast?.option.level ?? action.slotLevel ?? action.spellLevel ?? undefined;
          const restoreConcentration = applyActionConcentration(action, castLevel);
          // S1 — a REACTION-cast while-active BUFF spell (Shield's +5 AC) ESTABLISHES
          // its standing state on use. Only flips when OFF so undo never clears a
          // hand-set state; arms the round countdown. Read state FRESH.
          const activation = activateActionState(action, castLevel);
          // Log a STRUCTURED reaction-use event (always the reaction slot → red row).
          // Capture the id so the reverse removes only this line.
          const loggedId = characterStore.logEvent({
            kind: "reaction-use",
            action: action.nameLoc,
            effect: logTypeForAction(action),
          });
          return withResolutionUndo(() => {
            // Only undo reaction status — selections are unaffected (resetReaction).
            resetReaction();
            const c2 = useCharacterStore.getState();
            // Restore EXACTLY what was deducted (the same amount).
            if (cast?.option.kind === "slot") {
              c2.restoreSpellSlot(cast.option.level, cast.option.pactMagic);
            } else if (cast?.option.kind === "free-cast") {
              c2.restoreTracker(cast.option.sourceId, cast.option.cost);
            } else if (!cast && action.costsSlot && action.slotLevel != null) {
              c2.restoreSpellSlot(action.slotLevel, reactionSlotIsPact);
            } else if (action.costTracker) {
              c2.restoreTracker(action.costTracker, action.trackerCost);
            }
            if (metamagicCost > 0)
              c2.restoreTracker("sorcerer-font-of-magic", metamagicCost);
            // SURGICAL concentration restore (mirrors `commitCastOption`'s reverse).
            activation.restore();
            restoreConcentration(activation.activated);
            useCharacterStore.getState().removeLogEntry(loggedId);
          }, applyResolution);
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
          const cs = useCharacterStore.getState();
          let undoDebit: () => void;
          if (spend.kind === "tracker") {
            const trackerId = spend.trackerId;
            const tr = trackerMap.get(trackerId);
            if (tr && tr.total - tr.used <= 0) {
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
          const cs = useCharacterStore.getState();
          const tr = trackerMap.get(SNEAK_ATTACK_TRACKER_ID);
          // The once-per-turn use is the ONLY bail reason — a depleted tracker.
          if (tr && tr.total - tr.used <= 0) return null;
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
    const { expired, restore: restoreTimers } = charStore.advanceEffectTimers();
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
      reactionUsed: c.reactionUsed,
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
    const boundaryAtStart = useCharacterStore.getState().expireEffectBoundaries({
      round: c.round + 1,
      phase: "turn-start",
    });
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
  function commitPreparedAction(defaultAction: ResolvedAction): PreparedCommit {
    return (afterCommit, actionOverride) => {
      const action = actionOverride ?? defaultAction;
      return action.type === "reaction"
        ? void handleUseReaction(action, afterCommit)
        : handleSelect(action, afterCommit);
    };
  }

  function handlePoolSpendConfirm(amount: number) {
    const pending = pendingPoolSpend;
    setPendingPoolSpend(null);
    setPoolSpendRequest(null);
    if (!pending) return;
    if (pending.kind === "commit") {
      void commitIntoSlot(pending.action, pending.slot, amount);
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
    setArcaneRecoveryRequest(null);
    if (slotLevels.length === 0) return;
    const count = slotLevels.length;
    const totalLevels = slotLevels.reduce((a, b) => a + b, 0);
    const message = t("combat.arcaneRecoveryToast", { count, levels: totalLevels });
    // `applyArcaneRecovery` mutates and returns its exact restore closure — the
    // `execute` the stack re-runs on redo (same chosen slots, deterministic).
    if (
      registerUndoableToast(
        { message },
        () =>
          useCharacterStore
            .getState()
            .applyArcaneRecovery(slotLevels, ARCANE_RECOVERY_FEATURE_ID),
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
    setFreeCastFromListRequest(null);
    if (!request || !character) return;
    const { pool: requestedPool, opener, onPrepared } = request;
    const liveCharacter = useCharacterStore.getState().character;
    if (!liveCharacter) return;
    const pool = resolveFreeCastFromList(liveCharacter).find(
      (entry) =>
        entry.sourceId === requestedPool.sourceId &&
        entry.trackerId === requestedPool.trackerId
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

    const sourceDuration = pool.castOverrides?.maxRounds;
    const sourceActiveKey =
      !baseAction.standingEffect && sourceDuration !== undefined
        ? castSourceActiveKey(pool.sourceId, spellId)
        : undefined;
    const sourceAction: ResolvedAction = {
      ...baseAction,
      concentration: pool.castOverrides?.concentration ?? baseAction.concentration,
      summary: {
        ...baseAction.summary,
        ...(pool.castOverrides?.saveDC !== undefined
          ? { saveDC: pool.castOverrides.saveDC }
          : {}),
      },
      ...(baseAction.standingEffect && sourceDuration !== undefined
        ? {
            standingEffect: {
              ...baseAction.standingEffect,
              maxRounds: sourceDuration,
            },
          }
        : {}),
      ...(sourceActiveKey && sourceDuration !== undefined
        ? {
            activatesKey: sourceActiveKey,
            activeDurationRounds: sourceDuration,
          }
        : {}),
    };
    const action = actionAtCastLevel(
      {
        ...sourceAction,
        type: opener.type,
        costsSlot: false,
        costTracker: pool.trackerId,
        costTrackerIsPool: true,
        trackerCost: cost,
      },
      spell,
      spell.level
    );
    const option: CastLevelOption = {
      kind: "free-cast",
      sourceId: pool.trackerId,
      sourceName: grantSourceLabel(pool.sourceId, locale),
      level: spell.level,
      remaining: pool.remaining,
      total: pool.charges,
      rest: pool.rest,
      cost,
      ...(cost !== 1 ? { explicitCost: true as const } : {}),
    };
    onPrepared(action, (afterCommit, actionOverride) => {
      const committedAction = actionOverride ?? action;
      pendingResolutionRef.current = {
        actionId: committedAction.id,
        apply: afterCommit,
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
    onPrepared: (action: ResolvedAction, commit: PreparedCommit) => void
  ): void {
    if (!guardActionState(action)) return;
    const slot = getEconomySlot(action);
    const ridesPip = isPipAttack(action);
    if (action.castPoolSourceId && action.costTracker && character) {
      const pool = resolveFreeCastFromList(character).find(
        (entry) =>
          entry.sourceId === action.castPoolSourceId &&
          entry.trackerId === action.costTracker
      );
      if (pool) {
        setFreeCastFromListRequest({ pool, opener: action, onPrepared });
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
        setPendingPoolSpend({ kind: "prepare", action, onPrepared });
        setPoolSpendRequest({
          featureName: action.name,
          unit: action.costTrackerUnit,
          max: Math.max(1, tracker.total - tracker.used),
        });
        return;
      }
    }
    if (
      configureSpellCast(action, slot, ridesPip, (finalAction, option, metamagicIds) =>
        onPrepared(finalAction, (afterCommit, actionOverride) => {
          const committedAction = actionOverride ?? finalAction;
          if (committedAction.type === "reaction") {
            void handleUseReaction(committedAction, afterCommit, {
              option,
              metamagicIds,
            });
          } else {
            pendingResolutionRef.current = {
              actionId: committedAction.id,
              apply: afterCommit,
            };
            void commitCastOption(committedAction, slot, option, metamagicIds, ridesPip);
          }
        })
      )
    )
      return;

    onPrepared(action, commitPreparedAction(action));
  }

  // The async reaction handler is exposed as a fire-and-forget `() => void` on
  // the API (its concentration-break confirm runs internally); `void` keeps the
  // promise from leaking through the void-typed contract.
  const api: TurnEconomyApi = {
    prepareResolution,
    handleSelect,
    handleUseReaction: (action) => void handleUseReaction(action),
    spendRider,
    applyCunningStrike,
    handleEndTurn,
    maintenancePrompts,
    keepMaintainedEffect,
    endMaintainedEffect,
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
          if (castRequest) {
            const finalAction = actionAtCastLevel(
              castRequest.action,
              castRequest.action.spellId
                ? getSpellById(castRequest.action.spellId)
                : undefined,
              level
            );
            if (castRequest.onConfigured)
              castRequest.onConfigured(finalAction, opt, metamagicIds);
            else
              void commitCastOption(
                finalAction,
                castRequest.slot,
                opt,
                metamagicIds,
                castRequest.ridesPip ?? false
              );
          }
          setCastRequest(null);
        }}
        onCancel={() => setCastRequest(null)}
      />

      {/* S4 — Arcane Recovery guided picker (enforces the ⌈level/2⌉ cap). */}
      <ArcaneRecoveryModal
        request={arcaneRecoveryRequest}
        onConfirm={handleArcaneRecoveryConfirm}
        onCancel={() => setArcaneRecoveryRequest(null)}
      />

      {/* S6 — alternate-payment picker: every legal way to pay for an action, the
          primary cost + any `alternateCost`. Commits the chosen payment with undo. */}
      <PaymentPickerModal
        request={
          paymentRequest
            ? {
                actionName: paymentRequest.action.name,
                rows: paymentRequest.options.map((opt, index) => ({
                  index,
                  label:
                    opt.cost.kind === "spell-slot"
                      ? t("combat.paymentSpellSlot", { level: opt.cost.minLevel })
                      : opt.cost.kind === "tracker"
                        ? grantSourceLabel(opt.cost.trackerId, locale)
                        : t("combat.paymentNoCost"),
                  remaining:
                    opt.cost.kind === "tracker"
                      ? (() => {
                          const tr = trackerMap.get(opt.cost.trackerId);
                          return tr ? `${tr.total - tr.used}/${tr.total}` : null;
                        })()
                      : null,
                  affordable: paymentAffordable(opt.cost),
                  primary: opt.kind === "primary",
                })),
              }
            : null
        }
        onConfirm={(index) => {
          const opt = paymentRequest?.options[index];
          if (paymentRequest && opt) {
            commitPayment(paymentRequest.action, paymentRequest.slot, opt.cost);
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
