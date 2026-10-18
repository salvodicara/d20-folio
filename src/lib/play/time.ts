/**
 * Time passing outside the turn order as a pure play transition: "10 minutes pass"
 * spends 100 rounds of every countdown at once (1 round = 6 seconds). What runs out
 * ends, exactly as at End Turn: a lit spell state (Mage Armor after 8 hours), a held
 * Concentration and everything it holds (Detect Magic after 10 minutes). A state tied
 * to the turn order cannot outlast a minute away from it: a turn edge (Shield) passes
 * and a maintained state (Rage) is not kept up. A duration the clock never ends
 * (until dispelled, a custom spell) is left alone.
 *
 * The caller owns the side effects, as for a rest: when the stretch ends an
 * engine-held Concentration (`timePassEndsConcentration`), it ends it through the
 * store's Concentration teardown first, so the world's occurrence ends with it.
 */
import { advanceEffectTimers, resolveActiveMaintainedEffects } from "@/lib/smart-tracker";
import { ROUNDS_PER_MINUTE } from "@/lib/spell-duration";
import { endStatuses, endsConcentration } from "@/lib/status";
import type { CharacterDoc } from "@/types/character";
import { changeConcentration } from "./concentration";

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
  return result !== null && endsConcentration(doc.session.concentration, result.ended);
}

/** The character after `minutes` pass, or null when nothing on it runs out or counts. */
export function passTime(doc: CharacterDoc, minutes: number): CharacterDoc | null {
  const result = lapse(doc, minutes);
  if (!result) return null;
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
    session: { ...session, ...endStatuses(session, ended) },
  };
  return endsConcentration(doc.session.concentration, ended)
    ? changeConcentration(next, "").doc
    : next;
}
