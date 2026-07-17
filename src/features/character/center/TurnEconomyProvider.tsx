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
import { syncCombatFromSession } from "@/features/character/center/combat-hydration";
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
import {
  resolveTrackers,
  resolveActiveMaintainedEffects,
  getActionCostOptions,
  extraActionsThisTurn,
  attacksPerActionForCharacter,
  resolveReplaceAttackWithCast,
  resolveFreeCastFromList,
  type ResolvedAction,
  type ActiveMaintainedEffect,
  type ActionCostOption,
  type FreeCastFromListPool,
} from "@/lib/smart-tracker";
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
import { activeKeysForConcentration } from "@/lib/aggregate-character";
import {
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
import { PaymentPickerModal } from "@/components/sheet/PaymentPickerModal";
import {
  ArcaneRecoveryModal,
  type ArcaneRecoveryRequest,
} from "@/components/sheet/ArcaneRecoveryModal";
import { DivineInterventionModal } from "@/components/sheet/DivineInterventionModal";
import { getMagicItem } from "@/data/magic-items";
import { localizeSrd } from "@/i18n/resolver";
import { classEntryLevel, totalLevel } from "@/lib/classes";
import {
  TurnEconomyContext,
  getEconomySlot,
  type TurnEconomyApi,
} from "./useTurnEconomy";
import { advanceSharedTurn } from "./turn-state";
import {
  advanceGlobalCombat,
  syncPipToStatus,
} from "@/features/campaigns/combat-reconcile";

/** The Wizard Arcane Recovery feature's stable srdId (its tracker id too). */
const ARCANE_RECOVERY_FEATURE_ID = "wizard-arcane-recovery";

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

export function TurnEconomyProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const selectAction = useCombatStore((s) => s.selectAction);
  const deselectAction = useCombatStore((s) => s.deselectAction);
  const setBudget = useCombatStore((s) => s.setBudget);
  const setAttackBudget = useCombatStore((s) => s.setAttackBudget);
  const markReactionUsed = useCombatStore((s) => s.useReaction);
  const resetReaction = useCombatStore((s) => s.resetReaction);
  const endTurn = useCombatStore((s) => s.endTurn);
  const resetTurn = useCombatStore((s) => s.resetTurn);
  const showToast = useToastStore((s) => s.showToast);

  // Pool spend prompt state. Immediate-commit model: a variable-cost (pool)
  // action prompts for its amount AT SELECT TIME, then commits.
  const [poolSpendRequest, setPoolSpendRequest] = useState<PoolSpendRequest | null>(null);
  const [pendingSelect, setPendingSelect] = useState<{
    action: ResolvedAction;
    slot: EconomySlot;
  } | null>(null);
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
      secondaryDamage?: { dice: string; damageType: string; dicePerUpcast?: string };
    };
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
  const [divineInterventionPool, setDivineInterventionPool] =
    useState<FreeCastFromListPool | null>(null);

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
  useEffect(() => {
    if (!character) return;
    const fresh = syncCombatFromSession(
      character.id,
      // The SOLO round now lives in the `combat/state` subdoc, mirrored onto the character
      // store as `combatRound` (the session no longer carries it); initiative reconciles
      // from the same subdoc via `session.initiative`.
      useCharacterStore.getState().combatRound,
      character.session.initiative,
      hydratedCharIdRef.current
    );
    if (fresh) {
      // Switching characters finalizes the previous character's turn: clear the
      // undo stack (dismissing its live toasts) and REBIND it to the new character,
      // so a stale reverse-applier from character A can never fire against character
      // B (whose resources/log it would corrupt) — the §1.4 character-switch fence.
      useUndoStore.getState().clear(character.id);
      hydratedCharIdRef.current = character.id;
    }
  }, [character]);

  // COMBAT-DUP — persist round / initiative back to the `combat/state` subdoc whenever
  // combat advances. A NON-reactive store subscription (not a selector) so this provider
  // never re-renders on a combat tick: §7.2 render-isolation holds (the meter + the Play
  // cards own their own combat subscriptions; the HUDs are untouched). Both round and
  // initiative now share the subdoc as their sole persisted home (round moved off the
  // parent doc), so each persists through its dedicated combat-state write.
  useEffect(() => {
    return useCombatStore.subscribe((state, prev) => {
      if (state.round === prev.round && state.initiative === prev.initiative) return;
      const cs = useCharacterStore.getState();
      if (!cs.character) return;
      // Round: mirror + persist to the subdoc (only when it actually changed).
      if (state.round !== prev.round && cs.combatRound !== state.round) {
        cs.persistCombatRound(state.round);
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
    // Prime to the CURRENT key (not `undefined`) so a reload while already on your
    // turn never spuriously resets — the reset fires only on a genuine entry into a
    // NEW turn (the key moving to a fresh non-null value).
    let seenTurnKey = turnStartKey(useCombatStatusStore.getState().status);
    return useCombatStatusStore.subscribe((s) => {
      const key = turnStartKey(s.status);
      if (shouldToastTurnStart(seenTurnKey, key)) {
        resetTurn();
        // Finalize the just-ended turn's undo machinery: PURGE the turn-scoped
        // entries (dismissing their lingering toasts) — the economy they reversed was
        // reset by the DM-driven turn cycle, so un-committing a last-turn action would
        // refund resources while its slot-legs no-op (an asymmetric half-undo).
        // Character-state entries (HP, conditions) SURVIVE: their reverse-appliers
        // don't touch the per-turn economy (§1.4 encounter turn-start).
        useUndoStore.getState().purgeTurnScoped();
      }
      seenTurnKey = key;
    });
  }, [resetTurn]);

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
    const prevConc = cs.character?.session.concentration ?? "";
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
    // RA-09 — the Dash action grants extra movement equal to your Speed: extend
    // the turn's movement budget by one Speed (undoable, per-turn — resets at the
    // turn boundary). Future speed riders (Tactical Shift, Cunning-Strike speed)
    // route through the SAME `commitDash` seam.
    const restoreDash =
      action.id === "base-dash" ? useCombatStore.getState().commitDash() : null;
    // Store the spell's STABLE id (golden rule 7); custom spells carry no id, so
    // custom spells stamp their name behind the `custom:` marker — never a bare SRD
    // name (which would leak the English title in IT).
    if (action.concentration)
      cs.setConcentration(
        action.spellId
          ? concentrationValue(action.spellId)
          : customConcentrationValue(action.name)
      );
    // Activation seam (issue #27 dogfood) — an action that ESTABLISHES a
    // while-active state (Rage, Bladesong, Innate Sorcery) lights it now: the
    // rail chip activates automatically and every while-active grant (Rage's
    // damage bonus, resistances, advantage) flows into the sheet. Only flipped
    // when it was OFF, so undo never clears a state the player set by hand;
    // the player taps the lit chip when the state ends (toggleActiveFeature).
    const activated = Boolean(
      action.activatesKey &&
      !(cs.character?.session.activeFeatures ?? []).includes(action.activatesKey)
    );
    if (action.activatesKey && activated) {
      cs.setActiveFeature(action.activatesKey, true);
      // FRONTIER-S3 — arm the round countdown for the state we just lit (Rage →
      // 10 rounds), so its timer shows immediately and the End-Turn seam ticks it.
      cs.armEffectTimers();
    }
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
      // RA-09 — undo the Dash's movement-budget extension.
      restoreDash?.();
      // Clear the state THIS commit lit (never a hand-set one); compute the hand-lit
      // concentration chips the upcoming `setConcentration(prevConc)` LEG-2 clear is
      // about to strip; restore concentration (strips them); then re-add ONLY those —
      // a SURGICAL restore that can't resurrect a DIFFERENT chip the player toggled
      // OFF during the undo window (the cast's own auto-lit key is excluded).
      if (action.activatesKey && activated) {
        c2.setActiveFeature(action.activatesKey, false);
      }
      const restoreKeys = concentrationKeysToRestoreOnUndo(action, activated);
      if (action.concentration) useCharacterStore.getState().setConcentration(prevConc);
      for (const key of restoreKeys) {
        useCharacterStore.getState().setActiveFeature(key, true);
      }
      // USE-APPLIES — restore the exact temp-HP pool the commit overwrote, so
      // undoing the action reverts its applied effect too (not just the pip).
      if ((action.useEffects ?? []).length > 0) {
        c2.setTempHP(prevTempHp);
      }
      c2.removeLogEntry(loggedId);
    };
  }

  // Display record for the economy slot.
  function toSelectedAction(action: ResolvedAction, slot: EconomySlot): SelectedAction {
    return {
      id: action.id,
      name: action.name,
      slot,
      cost: action.costsSlot
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
            : undefined,
    };
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
    return midAction || s.selected.action.length < s.budget.action;
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
            slot: "action",
            isAttackGroup: true,
          };
          if (
            useCombatStore.getState().commitAttackSwing(groupEntry, action.id) === null
          ) {
            // No Attack action slot free — nothing spent; undo the log and bail.
            undoEffects();
            return null;
          }
          return () => {
            useCombatStore.getState().undoAttackSwing();
            undoEffects();
          };
        },
        // The one-snackbar rule (toastStore) gives the whole Attack action ONE
        // evolving toast: each swing replaces the previous announcement in place,
        // its text + undo pointing at the LAST swing (BG3 grammar, 2026-07-09).
        { turnScoped: true }
      ) === null
    ) {
      showToast({ message: t("combat.noAttackSlots"), duration: 2500 });
      return;
    }
  }

  // Commit a (resolved-amount) action into its slot: deduct now, remember the
  // reverse, surface a 5s undo toast. Async — the concentration-break gate is a
  // promise-based confirm dialog (D24); we await it before deducting anything.
  async function commitIntoSlot(
    action: ResolvedAction,
    slot: EconomySlot,
    trackerAmount?: number
  ) {
    if (!(await confirmConcentrationBreak(action))) return;
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
          const undoCost = commitAction(action, trackerAmount);
          if (!selectAction(toSelectedAction(action, slot))) {
            undoCost();
            return null;
          }
          return () => {
            // Occupant-checked (idempotent): a no-op if this action already left its
            // slot, so a stray reverse can never double-refund (§5.2).
            if (!useCombatStore.getState().selected[slot].some((a) => a.id === action.id))
              return;
            undoCost();
            deselectAction(action.id);
          };
        },
        { turnScoped: true }
      ) === null
    )
      return;
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
    if (!(await confirmConcentrationBreak(action))) return;
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
          const cs = useCharacterStore.getState();
          const prevConc = cs.character?.session.concentration ?? "";
          if (opt.kind === "slot") cs.useSpellSlot(opt.level, opt.pactMagic);
          else if (opt.kind === "free-cast") cs.useTracker(opt.sourceId, 1);
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
          if (action.concentration)
            cs.setConcentration(
              action.spellId
                ? concentrationValue(action.spellId)
                : customConcentrationValue(action.name)
            );
          // S1 — casting a while-active BUFF spell ESTABLISHES its standing state, so
          // light its chip + every while-active grant now. Only flips when OFF so undo
          // never clears a hand-set state; arms the round countdown. Read state FRESH.
          const activated = Boolean(
            action.activatesKey &&
            !(
              useCharacterStore.getState().character?.session.activeFeatures ?? []
            ).includes(action.activatesKey)
          );
          if (action.activatesKey && activated) {
            cs.setActiveFeature(action.activatesKey, true);
            cs.armEffectTimers();
          }
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
            else if (opt.kind === "free-cast") c2.restoreTracker(opt.sourceId, 1);
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
            if (action.activatesKey && activated)
              c2.setActiveFeature(action.activatesKey, false);
            const restoreKeys = concentrationKeysToRestoreOnUndo(action, activated);
            if (action.concentration) c2.setConcentration(prevConc);
            for (const chipKey of restoreKeys) {
              useCharacterStore.getState().setActiveFeature(chipKey, true);
            }
            c2.removeLogEntry(loggedId);
          };
          // ATTACK-PIPS (War Magic) — the cast consumes an attack pip instead of a
          // fresh Action slot: claim/ride the Attack action. Bail (refunding) if none.
          if (ridesPip && attackOf) {
            const groupEntry: SelectedAction = {
              id: "attack-group",
              name: t("combat.attackAction"),
              slot: "action",
              isAttackGroup: true,
            };
            if (
              useCombatStore.getState().commitAttackSwing(groupEntry, action.id) === null
            ) {
              undoLegs();
              return null;
            }
            return () => {
              useCombatStore.getState().undoAttackSwing();
              undoLegs();
            };
          }
          // Append into the slot; bail (refunding) if the budget is already full.
          if (!selectAction(toSelectedAction(action, slot))) {
            undoLegs();
            return null;
          }
          return () => {
            // Occupant-checked (idempotent): a no-op if this action already left its
            // slot, so a stray reverse can never double-refund (§5.2).
            if (!useCombatStore.getState().selected[slot].some((a) => a.id === action.id))
              return;
            undoLegs();
            deselectAction(action.id);
          };
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

  // Handle card tap: commit immediately (deduct now). Reversal is EXCLUSIVELY
  // the session undo system (the 5s toast · the masthead Undo/Redo · ⌘Z) — the
  // CTA grammar: a card never carries an inline cancel.
  function handleSelect(action: ResolvedAction) {
    const slot = getEconomySlot(action);

    // Already the committed occupant → the card's CTA is disabled ("Used"), so
    // this is unreachable from the UI — kept as a silent defensive bail ("never
    // trust the view"): a stale tap must never double-commit or open a picker.
    if (useCombatStore.getState().selected[slot].some((a) => a.id === action.id)) {
      return;
    }

    // Condition gate — the Incapacitated family forbids the slot.
    const blockedSlots = resolveConditionEffects(
      character?.session.conditions ?? []
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

    // D4 — Divine Intervention opens a guided spell picker (any Cleric spell ≤ 5th,
    // 1/LR, no slot) instead of a bare commit. Matched by the free-cast-from-list pool
    // whose tracker is this action's costTracker (golden rule 7 — stable id, never a
    // display string). Choosing a spell casts it + debits the tracker (with undo).
    if (action.costTracker && character) {
      const pool = resolveFreeCastFromList(character).find(
        (p) => p.trackerId === action.costTracker
      );
      if (pool) {
        setDivineInterventionPool(pool);
        return;
      }
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
    if (action.source === "spell" && action.spellId && character) {
      const isCantrip = (action.spellLevel ?? 0) === 0;
      const baseLevel = action.slotLevel ?? action.spellLevel ?? 1;
      // A cantrip has no upcast/free-cast rows; only a LEVELED spell resolves slot
      // options (and a leveled spell with none is uncastable right now).
      const options = isCantrip
        ? []
        : resolveSpellCastOptions(character, action.spellId, baseLevel, true, locale, {
            mastery: t("spellPrep.spellMasteryBadge"),
            signature: t("spellPrep.signatureSpellBadge"),
          });
      if (!isCantrip && options.length === 0) {
        showToast({
          message: t("combat.noSlotsRemaining"),
          duration: 2000,
        });
        return;
      }
      // Per-cast Metamagic (Sorcerer) — SAME shared seam as the Spells page
      // (golden rule 6). Localize each option's name from its stable id. The
      // resolver now applies to cantrips too, so the SAME options the Spells tab
      // offers for this spell appear here.
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
      // Auto-commit directly (no picker) when there is nothing to choose: a
      // cantrip with no Metamagic to offer commits as the slotless `cantrip`
      // option; a leveled spell with a single slot option and no Metamagic
      // commits that option. Otherwise open the picker so the player can pick a
      // level (leveled) and/or toggle Metamagic before committing.
      if (metamagic.length === 0) {
        if (isCantrip) {
          // Slotless cantrip cast — no slot, no Metamagic SP. Fire-and-forget: the
          // async commit awaits the concentration-break gate (D24).
          void commitCastOption(
            action,
            slot,
            { kind: "cantrip", level: 0 },
            [],
            ridesPip
          );
          return;
        }
        if (options.length === 1 && options[0]) {
          void commitCastOption(action, slot, options[0], [], ridesPip);
          return;
        }
      }
      // S12c — pull the spell's structured damage facts so the slot rows preview
      // the dice each slot deals (Fireball L5 → "10d6"). `getSpellById` is a pure
      // SRD lookup; a custom/homebrew spell (no SRD entry) simply omits the chip.
      const spellData = getSpellById(action.spellId);
      setCastRequest({
        action,
        slot,
        baseLevel,
        options,
        metamagic: metamagic.length > 0 ? metamagic : undefined,
        sorceryRemaining: remainingSorceryPoints(character),
        ...(ridesPip ? { ridesPip } : {}),
        upcast: spellData
          ? {
              level: spellData.level,
              damageDice: spellData.damageDice,
              damageDicePerUpcast: spellData.damageDicePerUpcast,
              // RA-07 — heal-side upcast facts, previewed exactly like damage.
              healDice: spellData.healDice,
              healDicePerUpcast: spellData.healDicePerUpcast,
              instances: spellData.instances,
              instancesPerUpcast: spellData.instancesPerUpcast,
              secondaryDamage: spellData.secondaryDamage,
            }
          : undefined,
      });
      return;
    }

    // Variable-cost (pool) action → prompt for the amount, THEN commit.
    if (action.costTracker && action.costTrackerIsPool && !action.trackerCost) {
      const tracker = trackerMap.get(action.costTracker);
      if (tracker) {
        setPendingSelect({ action, slot });
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
  async function handleUseReaction(action: ResolvedAction) {
    // A spent reaction DISABLES every reaction CTA ("Used" — the CTA grammar),
    // so this is unreachable from the UI — a silent defensive bail ("never
    // trust the view"), not a redundant "already used" toast.
    if (useCombatStore.getState().reactionUsed) return;
    // Incapacitated and its kin forbid reactions too.
    const blockedSlots = resolveConditionEffects(
      character?.session.conditions ?? []
    ).blockedSlots;
    if (blockedSlots.has("reaction")) {
      showToast({ message: t("combat.slotBlockedByCondition"), duration: 2500 });
      return;
    }

    if (!(await confirmConcentrationBreak(action))) return;
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
          const prevConc = characterStore.character?.session.concentration ?? "";
          // Resolve the slot pool once (normal vs Pact for a pure Warlock) so the
          // spend and the reverse hit the SAME counter (B3).
          const reactionSlotIsPact =
            action.costsSlot && action.slotLevel != null
              ? bareSlotIsPact(
                  characterStore.character?.character.spellSlots ?? [],
                  action.slotLevel
                )
              : false;
          if (action.costsSlot && action.slotLevel != null) {
            characterStore.useSpellSlot(action.slotLevel, reactionSlotIsPact);
          } else if (action.costTracker) {
            characterStore.useTracker(action.costTracker, action.trackerCost);
          }
          // Store the spell's STABLE id (golden rule 7); a custom spell stamps its
          // name behind the `custom:` marker, never a bare SRD name.
          if (action.concentration)
            characterStore.setConcentration(
              action.spellId
                ? concentrationValue(action.spellId)
                : customConcentrationValue(action.name)
            );
          // S1 — a REACTION-cast while-active BUFF spell (Shield's +5 AC) ESTABLISHES
          // its standing state on use. Only flips when OFF so undo never clears a
          // hand-set state; arms the round countdown. Read state FRESH.
          const activated = Boolean(
            action.activatesKey &&
            !(
              useCharacterStore.getState().character?.session.activeFeatures ?? []
            ).includes(action.activatesKey)
          );
          if (action.activatesKey && activated) {
            characterStore.setActiveFeature(action.activatesKey, true);
            characterStore.armEffectTimers();
          }
          // Log a STRUCTURED reaction-use event (always the reaction slot → red row).
          // Capture the id so the reverse removes only this line.
          const loggedId = characterStore.logEvent({
            kind: "reaction-use",
            action: action.nameLoc,
            effect: logTypeForAction(action),
          });
          return () => {
            // Only undo reaction status — selections are unaffected (resetReaction).
            resetReaction();
            const c2 = useCharacterStore.getState();
            // Restore EXACTLY what was deducted (the same amount).
            if (action.costsSlot && action.slotLevel != null) {
              c2.restoreSpellSlot(action.slotLevel, reactionSlotIsPact);
            } else if (action.costTracker) {
              c2.restoreTracker(action.costTracker, action.trackerCost);
            }
            // SURGICAL concentration restore (mirrors `commitCastOption`'s reverse).
            if (action.activatesKey && activated) {
              c2.setActiveFeature(action.activatesKey, false);
            }
            const restoreKeys = concentrationKeysToRestoreOnUndo(action, activated);
            if (action.concentration) c2.setConcentration(prevConc);
            for (const chipKey of restoreKeys) {
              useCharacterStore.getState().setActiveFeature(chipKey, true);
            }
            useCharacterStore.getState().removeLogEntry(loggedId);
          };
        },
        { turnScoped: true }
      ) === null
    )
      return;
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
    // USE-APPLIES (Task 2) — Rage-style `maintained` states end at the end of
    // your turn UNLESS a maintaining event happened this round. Two events are
    // AUTO-tracked, both read from the per-round combat state:
    //   • `"attack"`  — the ACTION slot was spent (an attack roll or a save-
    //     forcing action; both consume the Attack/an action this turn).
    //   • `"damage-taken"` — the character's HP was reduced this round (the HP
    //     control delegates to `applyDamage`, which flags `damageTakenThisRound`).
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
      [
        c.selected.action.length > 0 ? "attack" : null,
        c.damageTakenThisRound ? "damage-taken" : null,
      ].filter((e): e is string => e !== null)
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
    const charStore = useCharacterStore.getState();
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
    const combatStatusStore = useCombatStatusStore.getState();
    const encounterStatus = combatStatusStore.status;
    if (encounterStatus) {
      // DOUBLE-ACTIVATION CAS (optimistic layer): once the first End Turn optimistically
      // advanced, the status reads `isMyTurn === false`; a rapid second press then finds it
      // is no longer this PC's turn and no-ops here — so the optimistic pointer can't be
      // double-stepped even before the disarm re-renders (the persisted CAS mirrors this).
      if (!encounterStatus.isMyTurn) return;
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

  // Pool spend confirm — the player chose the amount for a variable-cost action
  // at SELECT time; commit it now into its slot.
  function handlePoolSpendConfirm(amount: number) {
    const pending = pendingSelect;
    setPendingSelect(null);
    setPoolSpendRequest(null);
    if (pending) void commitIntoSlot(pending.action, pending.slot, amount);
  }

  // Pool spend cancel — dismiss the prompt; nothing was committed.
  function handlePoolSpendCancel() {
    setPendingSelect(null);
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

  // D4 — free-cast-from-list confirm (Divine Intervention OR War God's Blessing):
  // cast the chosen spell WITHOUT a slot and debit the per-rest tracker, in one
  // undoable flow (override-first; the engine never auto-casts). The toast copy is
  // keyed off the pool's stable sourceId (golden rule 7 — never a display string).
  function handleDivineInterventionCast(spellId: string) {
    const pool = divineInterventionPool;
    setDivineInterventionPool(null);
    if (!pool) return;
    // S9 — a variable-cost item pool (Wand of Binding → Hold Monster 5 / Hold Person
    // 2) debits the SELECTED spell's cost, not a hardcoded 1; the undo restores the
    // SAME `cost` (never 1). Feature pools default every spell to 1, so they debit 1
    // exactly as before.
    const cost = pool.costBySpell[spellId] ?? 1;
    const spellName = localizeSrd("spell", spellId, "name", locale);
    // The pool's `sourceId` is a MAGIC ITEM id for the item→pool bridge → an
    // item-attributed toast ("Wand of Binding: cast Hold Person (2 charges)");
    // otherwise the feature toasts (War God's Blessing / Divine Intervention).
    const itemPool = getMagicItem(pool.sourceId);
    const message = itemPool
      ? t("combat.itemPoolCastToast", {
          item: localizeSrd("magic-item", pool.sourceId, "name", locale),
          spell: spellName,
          charges: cost,
        })
      : t(
          pool.sourceId === "cleric-war-war-gods-blessing"
            ? "combat.warGodsBlessingToast"
            : "combat.divineInterventionToast",
          { spell: spellName }
        );
    if (
      registerUndoableToast(
        { message },
        () => {
          useCharacterStore.getState().useTracker(pool.trackerId, cost);
          return () => useCharacterStore.getState().restoreTracker(pool.trackerId, cost);
        },
        { turnScoped: true }
      ) === null
    )
      return;
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

  // The async reaction handler is exposed as a fire-and-forget `() => void` on
  // the API (its concentration-break confirm runs internally); `void` keeps the
  // promise from leaking through the void-typed contract.
  const api: TurnEconomyApi = {
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
        onConfirm={(_level, opt, metamagicIds) => {
          if (castRequest)
            void commitCastOption(
              castRequest.action,
              castRequest.slot,
              opt,
              metamagicIds,
              castRequest.ridesPip ?? false
            );
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
        pool={divineInterventionPool}
        locale={locale}
        onCast={handleDivineInterventionCast}
        onCancel={() => setDivineInterventionPool(null)}
      />
    </TurnEconomyContext.Provider>
  );
}
