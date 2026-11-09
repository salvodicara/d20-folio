/**
 * The turn, for the new Play screen (headless: direction renders it). ONE model for a
 * solo fight and a campaign fight, read and driven the same way:
 *
 * - `turnModelView()`: the round (the shared encounter's in a campaign fight, else the
 *   solo counter), the phase, whether it is my turn, and what the classic turn band
 *   would prompt now, as data. That covers a Wish cast this turn awaiting its follow-up,
 *   the extra turn on offer (Thief's Reflexes, Time Stop), the Time Stop count still to
 *   enter, and standing up from Prone with its cost.
 * - `endTurn()`: the classic End Turn, the same `runEndTurn` over the same stores
 *   (`end-turn-wiring`). Solo it starts the next round as one undo. It hands back the
 *   maintained states to ask about (Rage not kept going), what ended, and a readied
 *   spell that was lost, as data: the screen shows them.
 * - `endCombat()`: solo, the classic «End combat» (round 1, economy re-armed, the
 *   fight's situations off, the engine's solo encounter closed). It returns how much
 *   ammunition a search would bring back; `recoverAmmunition()` takes it. In a campaign
 *   fight the DM ends it, so the player's model returns null.
 * - `startCombat()`: solo, a fresh fight. In a campaign fight the DM starts it.
 *
 * Every commit reuses the classic seams (stores, undo stack, toasts); no rule is
 * re-implemented here.
 */
import type { TFunction } from "i18next";

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import {
  endMaintainedState,
  endTurnWithStores,
} from "@/features/character/center/end-turn-wiring";
import { takeSoloExtraTurn } from "@/features/character/center/extra-turn";
import { endSoloWorldEncounter } from "@/features/character/center/solo-world-turn";
import {
  standUp as commitStandUp,
  standUpOption,
} from "@/features/character/center/stand-up";
import {
  resolveTurnState,
  sheetEncounter,
  type TurnPhase,
} from "@/features/character/center/turn-state";
import { isCharacterAlive } from "@/lib/character-status";
import type { Locale } from "@/lib/locale";
import { ammunitionRecovery } from "@/lib/play/ammunition";
import type { unmaintainedStates } from "@/lib/play/end-turn";
import {
  classesGrantThiefsReflexes,
  parseTimeStopTurns,
  soloExtraTurnOffer,
  timeStopCastThisTurn,
  type ExtraTurnOffer,
} from "@/lib/play/extra-turns";
import { pendingWish } from "@/lib/play/wish";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { registerUndoableResult, registerUndoableToast } from "@/stores/undoStore";

export type MaintainedPrompt = ReturnType<typeof unmaintainedStates>[number];

export interface TurnModelView {
  mode: "solo" | "encounter";
  phase: TurnPhase;
  round: number;
  isMyTurn: boolean;
  /** End Turn would do something now (solo, or my turn in a shared fight). */
  canEndTurn: boolean;
  /** Solo only: a fresh fight can be started (a campaign fight is the DM's). */
  canStartCombat: boolean;
  /** The Wish cast awaiting its follow-up this turn (its log entry id), or null. */
  pendingWish: string | null;
  /** Solo: the extra turn on offer (Thief's Reflexes, Time Stop), or null. */
  extraTurnOffer: ExtraTurnOffer | null;
  /** Solo: a Time Stop was cast this turn and its turn count is still to enter. */
  askTimeStopTurns: boolean;
  /** Standing up from Prone: its cost and whether it can be paid; null when not Prone. */
  standUp: { costFt: number; possible: boolean } | null;
}

/** The open character's live shared fight, or null when solo. */
function sharedFight() {
  return sheetEncounter(
    useCombatStatusStore.getState().status,
    useCharacterStore.getState().character?.id ?? null
  );
}

/** The turn as the open sheet sees it now. */
export function turnModelView(): TurnModelView {
  const gc = sharedFight();
  const combat = useCombatStore.getState();
  const store = useCharacterStore.getState();
  const doc = store.character;
  const turn = resolveTurnState(gc, combat.round);
  const live = Boolean(doc) && !store.readonly;
  const alive = doc ? isCharacterAlive(doc.status, doc.session) : false;
  const soloTurns = !gc && live && alive;
  return {
    mode: gc ? "encounter" : "solo",
    phase: turn.phase,
    round: turn.round,
    isMyTurn: turn.isMyTurn,
    canEndTurn: live && (gc ? turn.phase === "my-turn" : true),
    canStartCombat: !gc && live,
    pendingWish: doc && live ? pendingWish(doc.session.logEntries) : null,
    extraTurnOffer:
      soloTurns && doc
        ? soloExtraTurnOffer({
            round: combat.round,
            thiefsReflexes: classesGrantThiefsReflexes(doc.character.classes),
            reflexesTaken: combat.reflexesTaken,
            timeStop: combat.timeStopTurns,
          })
        : null,
    askTimeStopTurns:
      soloTurns &&
      Boolean(doc) &&
      combat.timeStopTurns?.round !== combat.round &&
      timeStopCastThisTurn(doc?.session.logEntries ?? []),
    standUp: live ? standUpOption(turn.round) : null,
  };
}

export interface EndTurnResult {
  /** Maintained states to ask about: keep it going, or end it (`endMaintainedEffect`). */
  maintenancePrompts: MaintainedPrompt[];
  /** The sources of the effects this End Turn ended, in order. */
  ended: string[];
  /** A readied spell that was lost (not released by the next turn's start), or null. */
  readiedSpellLost: string | null;
}

/**
 * End Turn, as the classic band does it. Solo: the next round starts, as one undo
 * entry (the classic «Round N» toast). In a shared fight: only on my turn, and the
 * turn passes on.
 */
export function endTurn(t: TFunction): EndTurnResult {
  const result: EndTurnResult = {
    maintenancePrompts: [],
    ended: [],
    readiedSpellLost: null,
  };
  if (!turnModelView().canEndTurn) return result;
  endTurnWithStores({
    setMaintenancePrompts: (states) => {
      result.maintenancePrompts = states;
    },
    announce: (sourceIds) => {
      result.ended = sourceIds;
    },
    readiedSpellLost: (spell) => {
      result.readiedSpellLost = spell;
    },
    registerUndo: (round, reverse, replay) =>
      registerUndoableResult(
        { message: t("combat.endTurnToast", { round }) },
        reverse,
        replay,
        { turnScoped: true }
      ),
  });
  return result;
}

/** «End it» on a maintained state's prompt: the state goes out, undoably. («Keep it»
 *  needs nothing: the screen just drops the prompt.) */
export function endMaintainedEffect(activeKey: string, t: TFunction): void {
  endMaintainedState(activeKey, t);
}

/** Solo: take the extra turn on offer (Thief's Reflexes, the next Time Stop turn). */
export function takeExtraTurn(t: TFunction, locale: Locale): void {
  const offer = turnModelView().extraTurnOffer;
  if (offer) takeSoloExtraTurn(offer, t, locale);
}

/** Solo: the Time Stop turn count (1d4 + 1, as rolled); false when out of range. */
export function setTimeStopTurns(turns: number): boolean {
  if (!turnModelView().askTimeStopTurns) return false;
  const parsed = parseTimeStopTurns(String(turns));
  if (parsed === null) return false;
  useCombatStore.getState().setTimeStopTurns(parsed);
  return true;
}

/** Stand up from Prone: half the Speed, as one undo entry. */
export function standUp(t: TFunction, locale: Locale): void {
  commitStandUp(t, locale, turnModelView().round);
}

/** Solo: a fresh fight (round 1, economy re-armed, initiative cleared). */
export function startCombat(): void {
  if (!turnModelView().canStartCombat) return;
  useCombatStore.getState().endCombat();
}

/**
 * Solo «End combat», as the classic band does it: back to round 1 with the economy
 * re-armed, the fight's situations (Surprise, Underwater, Mounted) off, the engine's
 * solo encounter closed. Returns how many pieces of ammunition a search would bring
 * back (0 when none). Null in a campaign fight: the DM ends it.
 */
export function endCombat(): { ammunitionRecoverable: number } | null {
  if (sharedFight()) return null;
  const store = useCharacterStore.getState();
  if (!store.character || store.readonly) return null;
  useCombatStore.getState().endCombat();
  store.dispatch({ kind: "set-surprised", surprised: false });
  useCharacterStore.getState().dispatch({ kind: "end-fight-situations" });
  endSoloWorldEncounter();
  const doc = useCharacterStore.getState().character;
  const back = doc ? ammunitionRecovery(doc) : [];
  return { ammunitionRecoverable: back.reduce((sum, r) => sum + r.recovered, 0) };
}

/** After a fight: search for the ammunition (half of what was used), undoably. */
export function recoverAmmunition(t: TFunction): void {
  const doc = useCharacterStore.getState().character;
  if (!doc || ammunitionRecovery(doc).length === 0) return;
  const pieces = ammunitionRecovery(doc).reduce((sum, r) => sum + r.recovered, 0);
  registerUndoableToast(
    { message: t("combat.ammoRecovered", { count: pieces }) },
    () => useCharacterStore.getState().dispatch({ kind: "recover-ammunition" }),
    { turnScoped: false }
  );
}
