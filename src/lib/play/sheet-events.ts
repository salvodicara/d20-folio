/**
 * The sheet vocabulary: one event per sheet transition, and one pure `applySheetEvent`
 * that runs it. A caller describes WHAT changes; the matching `lib/play` transition
 * decides the next character. Side effects (the encounter cell, the log, undo,
 * toasts) stay with the caller. Not the session log's `PlayEvent`, which records
 * what happened at the table.
 */
import { isCharacterAlive } from "@/lib/character-status";
import { addEquipmentRef } from "@/lib/equipment-add";
import type { CoverStateLevel } from "@/lib/cover-states";
import type { LightLevel } from "@/lib/light-states";
import type { FamiliarCreatureType } from "@/lib/familiar-ids";
import type { SituationId } from "@/lib/situational-states";
import type {
  CharacterDoc,
  CustomEquipment,
  SessionDefenseKind,
  SessionState,
  SrdEquipmentRef,
} from "@/types/character";
import type { StoredConcentration } from "@/types/ids";
import {
  dismissFamiliar,
  releaseCompanion,
  setCompanionCount,
  setCompanionHp,
  setCompanionVariant,
  setFamiliarDismissed,
  reviveCompanion,
  summonCompanion,
  summonFamiliar,
  withSummonsRecorded,
} from "./companions";
import { addCondition, removeCondition } from "./conditions";
import { addSessionDefense, removeSessionDefense } from "./defenses";
import { setTrackerRoll, spendTrackerRoll, topUpTracker } from "./tracker-rolls";
import { setConcentration } from "./concentration";
import {
  advanceEffectTimers,
  armEffectBoundary,
  armEffectTimer,
  expireEffectBoundaries,
  type BoundaryPhase,
} from "./effect-timers";
import { setCover, type CoverUntil } from "./cover";
import { setLight } from "./light";
import { adjustCurrency, type CurrencyDelta } from "./material-cost";
import { setFadingPenalty, startFadingPenalty } from "./fading-penalties";
import { takeDamage, type DamageOptions } from "./damage";
import { dropBeastForm } from "./forms";
import { reviveCharacter } from "./revive";
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
import { passTime, setTimeOfDay } from "./time";
import { setWishStress } from "./wish";
import {
  restoreSpellSlot,
  createSpellSlot,
  restoreTracker,
  gainTempHp,
  healBy,
  killCharacter,
  setDeathSaves,
  setExhaustion,
  setHp,
  setInspiration,
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
  /** Font of Magic: one more normal slot, above the maximum if need be. */
  | { kind: "create-slot"; level: number }
  | {
      kind: "spend-tracker";
      trackerId: string;
      amount: number;
      /** The turn it is spent in, for a once-per-turn use ("5:pc-rogue"). */
      turnKey?: string;
    }
  | { kind: "restore-tracker"; trackerId: string; amount: number }
  | { kind: "set-tracker-roll"; trackerId: string; index: number; value: number | null }
  | { kind: "spend-tracker-roll"; trackerId: string; index: number }
  | { kind: "top-up-tracker"; trackerId: string; upTo: number | "full" }
  | { kind: "set-death-saves"; successes: number; failures: number }
  | { kind: "set-exhaustion"; level: number }
  /** Heroic Inspiration held or spent. Its log line: `sheetEventLogEvents`. */
  | { kind: "set-inspiration"; held: boolean }
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
  /** `worldActionId`: the journal id of the world commit, minted once by the caller so
   *  the play log replays it exactly (a fresh one is minted without it). */
  | { kind: "add-condition"; condition: string; worldActionId?: string }
  | { kind: "remove-condition"; condition: string; worldActionId?: string }
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
  /** An item into the bag (from the party chest), stacking as the Add-Item picker does. */
  | { kind: "receive-item"; ref: SrdEquipmentRef | CustomEquipment }
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
  /** Killed outright (Power Word Kill): 0 HP and dead. */
  | { kind: "die" }
  /** A summoning spell cast (M6): its creature comes onto the field at full HP. */
  | { kind: "summon-companion"; sourceId: string; castLevel?: number }
  /** Revived by a spell (Revivify): back with these Hit Points, the death cleared. */
  | { kind: "revive"; hitPoints: number }
  /** A fallen companion brought back with all its HP (M6). */
  | { kind: "revive-companion"; sourceId: string }
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
  /** A new turn: the once-per-turn uses come back. With `turnKey`, only those spent
   *  in another turn (an opportunity attack's Sneak Attack on the enemy's turn). */
  | { kind: "recover-per-turn-trackers"; turnKey?: string }
  /** A lit state's round countdown starts (`tickedRound`: the round it counts from). */
  | { kind: "arm-effect-timer"; key: string; rounds: number; tickedRound: number }
  /** A lit state ends at an encounter boundary (a round and the phase within it). */
  | { kind: "arm-effect-boundary"; key: string; round: number; phase: BoundaryPhase }
  /** End Turn's tick of every timed state; expired ones go out. */
  | { kind: "advance-effect-timers"; forRound?: number }
  /** The boundary states that have expired at this position end. */
  | { kind: "expire-effect-boundaries"; round: number; phase: BoundaryPhase }
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
  /** The table sets the time of day (minutes since midnight), or clears it. */
  | { kind: "set-time-of-day"; minutes: number | null }
  /** Start holding breath (SRD Suffocation); `choking`: no air at all. */
  | { kind: "hold-breath"; choking?: boolean }
  /** The character can breathe again: the Exhaustion suffocating added goes. */
  | { kind: "breathe-again" }
  /** The owner's turn ends while it holds its breath (one turn of air, or 1
   *  Exhaustion out of breath). Its log line: `breathLogEvents(before, after)`. */
  | { kind: "breath-turn-end" };

export type SheetEventKind = SheetEvent["kind"];

/** The character after the event; null when the event changes nothing. */
/** A once-per-turn spend records the turn it was spent in. */
function stampTurn(
  session: SessionState,
  event: { trackerId: string; turnKey?: string }
): SessionState {
  const entry = session.trackers[event.trackerId];
  if (event.turnKey === undefined || !entry) return session;
  return {
    ...session,
    trackers: {
      ...session.trackers,
      [event.trackerId]: { ...entry, turnKey: event.turnKey },
    },
  };
}

export function applySheetEvent(
  doc: CharacterDoc,
  event: SheetEvent
): CharacterDoc | null {
  const next = reduceSheetEvent(doc, event);
  return next ? afterDeath(doc, next) : next;
}

/**
 * What dying does to the sheet, whichever event brought it (a hit, the third failed
 * death save, a kill): attunement ends (2024, "Attunement"). Conditions stay.
 */
function afterDeath(before: CharacterDoc, next: CharacterDoc): CharacterDoc {
  if (
    !isCharacterAlive(before.status, before.session) ||
    isCharacterAlive(next.status, next.session)
  )
    return next;
  const unattune = <T extends { attuned?: boolean }>(item: T): T => {
    if (!item.attuned) return item;
    const copy = { ...item };
    delete copy.attuned;
    return copy;
  };
  const { equipment, weapons } = next.character;
  if (
    !equipment.some((e) => e.attuned) &&
    !weapons.some((w) => "attuned" in w && w.attuned)
  )
    return next;
  return {
    ...next,
    character: {
      ...next.character,
      equipment: equipment.map(unattune),
      weapons: weapons.map((w) => ("attuned" in w ? unattune(w) : w)),
    },
  };
}

function reduceSheetEvent(doc: CharacterDoc, event: SheetEvent): CharacterDoc | null {
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
    case "create-slot":
      return withSession(createSpellSlot(doc, event.level));
    case "spend-tracker":
      return withSession(
        stampTurn(spendTracker(doc, event.trackerId, event.amount), event)
      );
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
    case "set-inspiration":
      return withSession(setInspiration(doc, event.held));
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
      return withSession(addCondition(doc, event.condition, event.worldActionId));
    case "remove-condition":
      return withSession(
        removeCondition(doc, event.condition, event.worldActionId)?.session
      );
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
    case "receive-item":
      return {
        ...doc,
        character: {
          ...doc.character,
          equipment:
            "custom" in event.ref
              ? [...doc.character.equipment, event.ref]
              : addEquipmentRef(doc.character.equipment, event.ref),
        },
      };
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
    case "die":
      return withSession(killCharacter(doc));
    case "set-companion-hp":
      return withSession(
        setCompanionHp(withSummonsRecorded(doc), event.featureId, event.current)
      );
    case "revive":
      return reviveCharacter(doc, event.hitPoints);
    case "revive-companion":
      return withSession(reviveCompanion(doc.session, event.sourceId));
    case "summon-companion":
      return withSession(
        summonCompanion(withSummonsRecorded(doc), event.sourceId, event.castLevel)
      );
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
    case "arm-effect-timer":
      return withSession(armEffectTimer(doc, event.key, event.rounds, event.tickedRound));
    case "arm-effect-boundary":
      return withSession(
        armEffectBoundary(doc, event.key, { round: event.round, phase: event.phase })
      );
    case "advance-effect-timers":
      return withSession(advanceEffectTimers(doc, event.forRound).session);
    case "expire-effect-boundaries":
      return withSession(
        expireEffectBoundaries(doc, { round: event.round, phase: event.phase })
      );
    case "recover-per-turn-trackers":
      return withSession(recoverPerTurnTrackers(doc, event.turnKey)?.session);
    case "time-passes":
      return passTime(doc, event.minutes);
    case "set-time-of-day":
      return withSession(setTimeOfDay(doc, event.minutes));
    case "hold-breath":
      return withSession(holdBreath(doc, { choking: event.choking }));
    case "breathe-again":
      return withSession(breatheAgain(doc));
    case "breath-turn-end":
      return withSession(passBreathRounds(doc, 1));
  }
}
