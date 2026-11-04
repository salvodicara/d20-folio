/**
 * Time passing outside the turn order as a pure play transition: "10 minutes pass"
 * spends 100 rounds of every countdown at once (1 round = 6 seconds). What runs out
 * ends, exactly as at End Turn: a lit spell state (Mage Armor after 8 hours), a held
 * Concentration and everything it holds (Detect Magic after 10 minutes). A state tied
 * to the turn order cannot outlast a minute away from it: a turn edge (Shield) passes
 * and a maintained state (Rage) is not kept up. A duration the clock never ends
 * (until dispelled, a custom spell) is left alone. A held breath counts every round
 * of the stretch (`suffocation.ts`).
 *
 * The caller owns the side effects, as for a rest: when the stretch ends an
 * engine-held Concentration (`timePassEndsConcentration`), it ends it through the
 * store's Concentration teardown first, so the world's occurrence ends with it.
 */
import { ageFallenSummons } from "./companions";
import {
  advanceEffectTimers,
  equipmentAfterDawn,
  resolveActiveMaintainedEffects,
} from "@/lib/smart-tracker";
import { ROUNDS_PER_MINUTE } from "@/lib/spell-duration";
import { endStatuses, endsConcentration } from "@/lib/status";
import type { CharacterDoc, SessionState } from "@/types/character";
import { endExpiredSummons } from "./companions";
import { changeConcentration } from "./concentration";
import { passBreathRounds } from "./suffocation";

/** The status keys a stretch of `minutes` ends, and the countdowns left after it. */
function lapse(
  doc: CharacterDoc,
  minutes: number
): {
  ended: Set<string>;
  timers: ReturnType<typeof advanceEffectTimers>["timers"];
} | null {
  const rounds = Math.round(minutes * ROUNDS_PER_MINUTE);
  if (!Number.isFinite(rounds) || rounds <= 0) return null;
  const { timers, expired } = advanceEffectTimers(doc, undefined, rounds);
  const ended = new Set(expired.map((effect) => effect.activeKey));
  for (const key of Object.keys(doc.session.effectBoundaries ?? {})) ended.add(key);
  for (const effect of resolveActiveMaintainedEffects(doc)) ended.add(effect.activeKey);
  return { ended, timers };
}

/** The status keys `minutes` passing would end (empty for no stretch): the preview of
 *  `passTime`, with nothing applied. */
export function timePassEnds(doc: CharacterDoc, minutes: number): ReadonlySet<string> {
  return lapse(doc, minutes)?.ended ?? new Set();
}

/** Whether `minutes` passing ends the held Concentration. */
export function timePassEndsConcentration(doc: CharacterDoc, minutes: number): boolean {
  const result = lapse(doc, minutes);
  return (
    result !== null &&
    endsConcentration(doc.session.concentration, result.ended, doc.character.spells)
  );
}

const DAY = 24 * 60;
/** Dawn and dusk on the clock, in minutes since midnight. */
export const DAWN = 6 * 60;
export const DUSK = 18 * 60;

/** Whether `minutes` passing from `timeOfDay` crosses the time `at` (reaching it
 *  counts; starting on it doesn't). No time of day: nothing is crossed. */
function crosses(timeOfDay: number | undefined, minutes: number, at: number): boolean {
  if (timeOfDay === undefined || !(minutes > 0)) return false;
  const from = timeOfDay - at;
  return Math.floor((from + minutes) / DAY) > Math.floor(from / DAY);
}

/** Whether `minutes` passing from `timeOfDay` crosses dawn (06:00). */
export function crossedDawn(timeOfDay: number | undefined, minutes: number): boolean {
  return crosses(timeOfDay, minutes, DAWN);
}

/** Whether `minutes` passing from `timeOfDay` crosses dusk (18:00). */
export function crossedDusk(timeOfDay: number | undefined, minutes: number): boolean {
  return crosses(timeOfDay, minutes, DUSK);
}

/** The clock boundaries `minutes` crosses from `timeOfDay` (none when no time is set). */
export function crossedBoundaries(
  timeOfDay: number | undefined,
  minutes: number
): Array<"dawn" | "dusk"> {
  return [
    ...(crossedDawn(timeOfDay, minutes) ? (["dawn"] as const) : []),
    ...(crossedDusk(timeOfDay, minutes) ? (["dusk"] as const) : []),
  ];
}

/** Game minutes since the character became Stable at 0 HP, while it still is (three
 *  successes, still at 0 HP, alive); undefined otherwise. After 1d4 hours (the table
 *  rolls) it regains 1 HP. */
export function stableMinutes(
  session: Pick<SessionState, "stableSince" | "hp" | "deathSucc" | "deathFail">
): number | undefined {
  return session.stableSince !== undefined &&
    session.hp.current === 0 &&
    session.deathSucc >= 3 &&
    session.deathFail < 3
    ? session.stableSince
    : undefined;
}

/** Whether a rest of `minutes` brings a dawn: when it crosses 06:00, or always when
 *  the table has set no time of day (a Long Rest stands in for the night). */
export function restCrossesDawn(doc: CharacterDoc, minutes: number): boolean {
  const { timeOfDay } = doc.session;
  return timeOfDay === undefined || crossedDawn(timeOfDay, minutes);
}

/** The time of day after `minutes`, around midnight; unset stays unset. */
export function advanceTimeOfDay(
  timeOfDay: number | undefined,
  minutes: number
): number | undefined {
  if (timeOfDay === undefined || !(minutes > 0)) return timeOfDay;
  return (((timeOfDay + Math.round(minutes)) % DAY) + DAY) % DAY;
}

/** The table sets the time of day (minutes since midnight), or clears it (null). */
export function setTimeOfDay(
  doc: CharacterDoc,
  minutes: number | null
): SessionState | null {
  if (minutes === null) {
    if (doc.session.timeOfDay === undefined) return null;
    const session = { ...doc.session };
    delete session.timeOfDay;
    return session;
  }
  if (!Number.isFinite(minutes)) return null;
  const timeOfDay = ((Math.round(minutes) % DAY) + DAY) % DAY;
  return timeOfDay === doc.session.timeOfDay ? null : { ...doc.session, timeOfDay };
}

/** The character after `minutes` pass, or null when nothing on it runs out or counts.
 *  A fallen companion's clock runs on too (its revive window). */
export function passTime(doc: CharacterDoc, minutes: number): CharacterDoc | null {
  const passed = passTimeOwn(doc, minutes);
  const base = passed ?? doc;
  const aged = ageFallenSummons(base.session, minutes);
  return aged === base.session ? passed : { ...base, session: aged };
}

function passTimeOwn(doc: CharacterDoc, minutes: number): CharacterDoc | null {
  const passed = passEffects(doc, minutes);
  const dead = doc.session.death;
  const timeOfDay = advanceTimeOfDay(doc.session.timeOfDay, minutes);
  const clockMoved = timeOfDay !== doc.session.timeOfDay;
  const stable = stableMinutes(doc.session);
  if (
    (!dead || !(minutes > 0)) &&
    !clockMoved &&
    (stable === undefined || !(minutes > 0))
  )
    return passed;
  const base = passed ?? doc;
  // Charges that come back at dawn come back when the clock crosses it.
  const dawn = crossedDawn(doc.session.timeOfDay, minutes);
  return {
    ...base,
    ...(dawn
      ? {
          character: {
            ...base.character,
            equipment: equipmentAfterDawn(base.character.equipment),
          },
        }
      : {}),
    session: {
      ...base.session,
      // A dead character's clock runs on (Revivify reaches only the last minute).
      ...(dead && minutes > 0
        ? { death: { minutesSince: dead.minutesSince + minutes } }
        : {}),
      ...(clockMoved ? { timeOfDay } : {}),
      // A Stable character's clock to 1 HP runs on.
      ...(stable !== undefined && minutes > 0 ? { stableSince: stable + minutes } : {}),
    },
  };
}

function passEffects(doc: CharacterDoc, minutes: number): CharacterDoc | null {
  const result = lapse(doc, minutes);
  if (!result) return null;
  // A held breath counts every turn of the stretch (SRD Suffocation).
  const breath = passBreathRounds(doc, Math.round(minutes * ROUNDS_PER_MINUTE));
  const timed = passTimers(breath ? { ...doc, session: breath } : doc, result);
  return timed ?? (breath ? { ...doc, session: breath } : null);
}

function passTimers(
  doc: CharacterDoc,
  result: NonNullable<ReturnType<typeof lapse>>
): CharacterDoc | null {
  const { ended, timers } = result;
  const before = doc.session.effectTimers ?? {};
  const counted =
    Object.keys(timers).length !== Object.keys(before).length ||
    Object.entries(timers).some(
      ([key, timer]) => before[key]?.roundsLeft !== timer.roundsLeft
    );
  if (!counted && ended.size === 0) return null;
  const session = {
    ...doc.session,
    effectTimers: Object.keys(timers).length > 0 ? timers : undefined,
  };
  const next: CharacterDoc = {
    ...doc,
    // A summon whose countdown ran out leaves the field (M6).
    session: endExpiredSummons({ ...session, ...endStatuses(session, ended) }, ended),
  };
  return endsConcentration(doc.session.concentration, ended, doc.character.spells)
    ? changeConcentration(next, "").doc
    : next;
}
