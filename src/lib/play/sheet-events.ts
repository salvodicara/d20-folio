/**
 * The sheet vocabulary: one event per sheet transition, and one pure `applySheetEvent`
 * that runs it. A caller describes WHAT changes; the matching `lib/play` transition
 * decides the next character. Side effects (the encounter cell, the log, undo,
 * toasts) stay with the caller. Not the session log's `PlayEvent`, which records
 * what happened at the table.
 */
import type { CoverStateLevel } from "@/lib/cover-states";
import type { LightLevel } from "@/lib/light-states";
import type { FamiliarCreatureType } from "@/lib/familiar-ids";
import type { SituationId } from "@/lib/situational-states";
import type { CharacterDoc, SessionDefenseKind, SessionState } from "@/types/character";
import type { StoredConcentration } from "@/types/ids";
import {
  dismissFamiliar,
  releaseCompanion,
  setCompanionCount,
  setCompanionHp,
  setCompanionVariant,
  setFamiliarDismissed,
  summonFamiliar,
} from "./companions";
import { addCondition, removeCondition } from "./conditions";
import { addSessionDefense, removeSessionDefense } from "./defenses";
import { setTrackerRoll, spendTrackerRoll, topUpTracker } from "./tracker-rolls";
import { setConcentration } from "./concentration";
import { setCover, type CoverUntil } from "./cover";
import { setLight } from "./light";
import { adjustCurrency, type CurrencyDelta } from "./material-cost";
import { setFadingPenalty, startFadingPenalty } from "./fading-penalties";
import { takeDamage, type DamageOptions } from "./damage";
import { dropBeastForm } from "./forms";
import { setReadiedSpell } from "./ready";
import { togglePinnedAction } from "./pins";
import { longRestCharacter, shortRestCharacter } from "./rests";
import {
  endStatesOnAct,
  recoverPerTurnTrackers,
  setActiveSpellCastLevel,
  setActiveState,
  setBundleChoices,
  type StateEndingAct,
} from "./states";
import { endFightSituations, setSituation, type SituationUntil } from "./situations";
import { setSurprised } from "./surprise";
import { breatheAgain, holdBreath, passBreathRounds } from "./suffocation";
import { passTime } from "./time";
import { setWishStress } from "./wish";
import {
  restoreSpellSlot,
  restoreTracker,
  gainTempHp,
  healBy,
  setDeathSaves,
  setExhaustion,
  setHp,
  setHpMaxReduction,
  setTempHp,
  spendSpellSlot,
  spendTracker,
} from "./vitals";

export type SheetEvent =
  | { kind: "set-hp"; current: number }
  | { kind: "set-temp-hp"; temp: number }
  | ({ kind: "take-damage"; amount: number } & DamageOptions)
  | { kind: "heal"; amount: number }
  | { kind: "gain-temp-hp"; amount: number }
  | { kind: "set-hp-max-reduction"; total: number }
  | { kind: "spend-slot"; level: number; pactMagic: boolean }
  | { kind: "restore-slot"; level: number; pactMagic: boolean }
  | { kind: "spend-tracker"; trackerId: string; amount: number }
  | { kind: "restore-tracker"; trackerId: string; amount: number }
  | { kind: "set-tracker-roll"; trackerId: string; index: number; value: number | null }
  | { kind: "spend-tracker-roll"; trackerId: string; index: number }
  | { kind: "top-up-tracker"; trackerId: string; upTo: number | "full" }
  | { kind: "set-death-saves"; successes: number; failures: number }
  | { kind: "set-exhaustion"; level: number }
  | { kind: "start-fading-penalty"; penaltyId: string }
  | { kind: "set-fading-penalty"; penaltyId: string; amount: number }
  | {
      kind: "set-concentration";
      spell: StoredConcentration;
      /** The journal id of the engine end, if the dropped spell was engine-held. */
      engineActionId: string;
      castLevel?: number;
      retractedFormTempHp?: number;
    }
  | { kind: "add-condition"; condition: string }
  | { kind: "remove-condition"; condition: string }
  | { kind: "add-session-defense"; defense: SessionDefenseKind; id: string }
  | { kind: "remove-session-defense"; defense: SessionDefenseKind; id: string }
  | { kind: "set-active-state"; key: string; isActive: boolean; litRound: number }
  | { kind: "set-active-cast-level"; key: string; level: number | undefined }
  | { kind: "set-bundle-choices"; choices: Readonly<Record<string, string | null>> }
  | {
      kind: "set-cover";
      level: CoverStateLevel | null;
      until: CoverUntil | undefined;
    }
  | { kind: "set-surprised"; surprised: boolean }
  | { kind: "adjust-currency"; delta: CurrencyDelta }
  | { kind: "set-wish-stress"; stressed: boolean }
  | {
      kind: "set-situation";
      situation: SituationId;
      lit: boolean;
      until: SituationUntil | undefined;
    }
  | { kind: "end-fight-situations" }
  | { kind: "set-light"; level: LightLevel | null }
  | { kind: "drop-beast-form" }
  | { kind: "set-readied-spell"; readied: SessionState["readiedSpell"] }
  | { kind: "set-companion-hp"; featureId: string; current: number }
  | { kind: "set-companion-variant"; featureId: string; variantId: string }
  | { kind: "set-companion-count"; groupId: string; count: number }
  | { kind: "release-companion"; featureId: string }
  | {
      kind: "summon-familiar";
      monsterId: string;
      creatureType: FamiliarCreatureType;
      maxHp: number;
    }
  | { kind: "set-familiar-dismissed"; dismissed: boolean }
  | { kind: "dismiss-familiar" }
  | { kind: "toggle-pin"; actionId: string; defaultPinned: boolean }
  | { kind: "long-rest" }
  | { kind: "short-rest" }
  /** The owner's turn starts again: every spent per-turn tracker refills (Sneak Attack). */
  | { kind: "recover-per-turn-trackers" }
  /** The character attacked, dealt damage or cast a spell: the states that end early
   *  on that act end (Potion of Invisibility). */
  | { kind: "perform-act"; act: StateEndingAct }
  /**
   * Minutes pass outside the turn order: what runs out ends (`passTime`).
   * To the first dispatcher: when `timePassEndsConcentration(doc, minutes)`, an
   * engine-held Concentration must end through the store teardown too. Never
   * `setConcentration("")` and then rely on `dispatch`'s own undo: its snapshot is
   * already past the teardown, so Undo would lose the Concentration. Wrap both steps
   * in one whole-state undo, as the rests do (`beginWholeStateUndo`, #283):
   * `seal = beginWholeStateUndo(); teardown; dispatch(event); undo = seal?.()`.
   * Pinned in tests/unit/time-passes.test.ts.
   */
  | { kind: "time-passes"; minutes: number }
  /** Start holding breath (SRD Suffocation); `choking`: no air at all. */
  | { kind: "hold-breath"; choking?: boolean }
  /** The character can breathe again: the Exhaustion suffocating added goes. */
  | { kind: "breathe-again" }
  /** The owner's turn ends while it holds its breath (one turn of air, or 1
   *  Exhaustion out of breath). Its log line: `breathLogEvents(before, after)`. */
  | { kind: "breath-turn-end" };

export type SheetEventKind = SheetEvent["kind"];

/** The character after the event; null when the event changes nothing. */
export function applySheetEvent(
  doc: CharacterDoc,
  event: SheetEvent
): CharacterDoc | null {
  const withSession = (session: SessionState | null | undefined): CharacterDoc | null =>
    session ? { ...doc, session } : null;
  switch (event.kind) {
    case "set-hp":
      return withSession(setHp(doc, event.current));
    case "set-temp-hp":
      return withSession(setTempHp(doc, event.temp));
    case "take-damage":
      return withSession(takeDamage(doc, event.amount, event)?.session);
    case "heal":
      return withSession(healBy(doc, event.amount));
    case "gain-temp-hp":
      return withSession(gainTempHp(doc, event.amount));
    case "set-hp-max-reduction":
      return withSession(setHpMaxReduction(doc, event.total));
    case "spend-slot":
      return withSession(spendSpellSlot(doc, event.level, event.pactMagic));
    case "restore-slot":
      return withSession(restoreSpellSlot(doc, event.level, event.pactMagic));
    case "spend-tracker":
      return withSession(spendTracker(doc, event.trackerId, event.amount));
    case "restore-tracker":
      return withSession(restoreTracker(doc, event.trackerId, event.amount));
    case "set-tracker-roll":
      return withSession(setTrackerRoll(doc, event.trackerId, event.index, event.value));
    case "spend-tracker-roll":
      return withSession(spendTrackerRoll(doc, event.trackerId, event.index));
    case "top-up-tracker":
      return withSession(topUpTracker(doc, event.trackerId, event.upTo));
    case "set-death-saves":
      return withSession(setDeathSaves(doc, event.successes, event.failures)?.session);
    case "set-exhaustion":
      return withSession(setExhaustion(doc, event.level));
    case "start-fading-penalty":
      return withSession(startFadingPenalty(doc, event.penaltyId));
    case "set-fading-penalty":
      return withSession(setFadingPenalty(doc, event.penaltyId, event.amount));
    case "set-concentration":
      return setConcentration(doc, event.spell, event.engineActionId, {
        ...(event.castLevel !== undefined ? { castLevel: event.castLevel } : {}),
        ...(event.retractedFormTempHp !== undefined
          ? { retractedFormTempHp: event.retractedFormTempHp }
          : {}),
      });
    case "add-condition":
      return withSession(addCondition(doc, event.condition));
    case "remove-condition":
      return withSession(removeCondition(doc, event.condition)?.session);
    case "add-session-defense":
      return withSession(addSessionDefense(doc, event.defense, event.id));
    case "remove-session-defense":
      return withSession(removeSessionDefense(doc, event.defense, event.id));
    case "set-active-state":
      return withSession(setActiveState(doc, event.key, event.isActive, event.litRound));
    case "set-active-cast-level":
      return withSession(setActiveSpellCastLevel(doc, event.key, event.level));
    case "set-bundle-choices":
      return withSession(setBundleChoices(doc, event.choices));
    case "set-cover":
      return withSession(setCover(doc, event.level, event.until));
    case "set-surprised":
      return withSession(setSurprised(doc, event.surprised));
    case "adjust-currency":
      return withSession(adjustCurrency(doc.session, event.delta));
    case "set-wish-stress":
      return withSession(setWishStress(doc, event.stressed));
    case "set-situation":
      return withSession(setSituation(doc, event.situation, event.lit, event.until));
    case "end-fight-situations":
      return withSession(endFightSituations(doc));
    case "set-light":
      return withSession(setLight(doc, event.level));
    case "drop-beast-form":
      return dropBeastForm(doc);
    case "set-readied-spell":
      return withSession(setReadiedSpell(doc.session, event.readied));
    case "set-companion-hp":
      return withSession(setCompanionHp(doc.session, event.featureId, event.current));
    case "set-companion-variant":
      return withSession(
        setCompanionVariant(doc.session, event.featureId, event.variantId)
      );
    case "set-companion-count":
      return withSession(setCompanionCount(doc.session, event.groupId, event.count));
    case "release-companion":
      return withSession(releaseCompanion(doc.session, event.featureId));
    case "summon-familiar":
      return withSession(
        summonFamiliar(doc.session, event.monsterId, event.creatureType, event.maxHp)
      );
    case "set-familiar-dismissed":
      return withSession(setFamiliarDismissed(doc.session, event.dismissed));
    case "dismiss-familiar":
      return withSession(dismissFamiliar(doc.session));
    case "toggle-pin":
      return withSession(
        togglePinnedAction(doc.session, event.actionId, event.defaultPinned)
      );
    case "long-rest":
      return longRestCharacter(doc);
    case "short-rest":
      return shortRestCharacter(doc);
    case "perform-act":
      return withSession(endStatesOnAct(doc, event.act)?.session);
    case "recover-per-turn-trackers":
      return withSession(recoverPerTurnTrackers(doc)?.session);
    case "time-passes":
      return passTime(doc, event.minutes);
    case "hold-breath":
      return withSession(holdBreath(doc, { choking: event.choking }));
    case "breathe-again":
      return withSession(breatheAgain(doc));
    case "breath-turn-end":
      return withSession(passBreathRounds(doc, 1));
  }
}
