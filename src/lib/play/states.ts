/**
 * Pure play transitions for the character's active states (Rage, Bless lit on
 * yourself, a potion's timer): the character in, the next session out.
 */
import { potionStateGrant, potionTimerKey } from "@/lib/potion-states";
import {
  potionDurationRounds,
  resolveActiveTimedEffects,
  resolvePerTurnRecoveryTrackerIds,
} from "@/lib/smart-tracker";
import type { CharacterDoc, SessionState, TrackerState } from "@/types/character";
import { restoreTrackerEntry } from "./recoveries";

/** Drop one key from an optional record; undefined when nothing is left. */
function without<T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string
): Record<string, T> | undefined {
  const next = Object.fromEntries(
    Object.entries(record ?? {}).filter(([entryKey]) => entryKey !== key)
  );
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Light or end an active state, or null when it already is. Either way its countdown,
 * turn edge (and, when ending, its cast level) restart; a state with a declared round
 * cap is armed with it, stamped `litRound` (the round before the sheet's current one,
 * so a turn-boundary catch-up never counts the lighting round again).
 */
export function setActiveState(
  doc: CharacterDoc,
  key: string,
  isActive: boolean,
  litRound: number
): SessionState | null {
  const active = doc.session.activeFeatures ?? [];
  if (active.includes(key) === isActive) return null;
  const levels = isActive
    ? doc.session.activeSpellCastLevels
    : without(doc.session.activeSpellCastLevels, key);
  const session: SessionState = {
    ...doc.session,
    activeFeatures: isActive ? [...active, key] : active.filter((k) => k !== key),
    activeSpellCastLevels: levels && Object.keys(levels).length > 0 ? levels : undefined,
    effectTimers: without(doc.session.effectTimers, key),
    effectBoundaries: without(doc.session.effectBoundaries, key),
  };
  if (!isActive) return session;
  const timed = resolveActiveTimedEffects({ ...doc, session }).find(
    (effect) => effect.activeKey === key
  );
  if (!timed) return session;
  return {
    ...session,
    effectTimers: {
      ...(session.effectTimers ?? {}),
      [key]: { roundsLeft: timed.maxRounds, tickedRound: litRound },
    },
  };
}

/** Record (or clear, with no level) the slot level an active spell state was cast at. */
export function setActiveSpellCastLevel(
  doc: CharacterDoc,
  key: string,
  level: number | undefined
): SessionState {
  const previous = doc.session.activeSpellCastLevels ?? {};
  const levels =
    level !== undefined && Number.isFinite(level) && level > 0
      ? { ...previous, [key]: Math.round(level) }
      : (without(previous, key) ?? {});
  return {
    ...doc.session,
    activeSpellCastLevels: Object.keys(levels).length > 0 ? levels : undefined,
  };
}

/** Refill every spent per-turn tracker (Sneak Attack) at the owner's turn start, or
 *  null when none needs it; `prior` is what the undo restores. */
export function recoverPerTurnTrackers(
  doc: CharacterDoc
): { session: SessionState; prior: Map<string, TrackerState | undefined> } | null {
  const ids = resolvePerTurnRecoveryTrackerIds(doc);
  if (ids.length === 0) return null;
  const prior = new Map<string, TrackerState | undefined>();
  let trackers = doc.session.trackers;
  for (const id of ids) {
    prior.set(id, doc.session.trackers[id]);
    trackers = restoreTrackerEntry(trackers, id, undefined);
  }
  return { session: { ...doc.session, trackers }, prior };
}

/**
 * Drink a timed potion: a potion that declares a standing state (Flying's fly
 * speed) lights its `potion:<id>` key, armed to the declared countdown (drinking
 * another restarts it); any other timed potion only arms the bare countdown. Null
 * for an instant potion (Healing), which has nothing to arm.
 */
export function drinkPotion(
  doc: CharacterDoc,
  itemId: string,
  litRound: number
): SessionState | null {
  const key = potionTimerKey(itemId);
  if (potionStateGrant(itemId)) {
    const off = setActiveState(doc, key, false, litRound) ?? doc.session;
    return setActiveState({ ...doc, session: off }, key, true, litRound);
  }
  const rounds = potionDurationRounds(itemId);
  if (rounds === undefined || !Number.isFinite(rounds) || rounds <= 0) return null;
  return {
    ...doc.session,
    effectTimers: {
      ...(doc.session.effectTimers ?? {}),
      [key]: { roundsLeft: rounds, tickedRound: litRound },
    },
  };
}

/** Put one state key back as it was in `prior` (the undo of a drink), leaving
 *  every other state started in the meantime untouched. */
export function restoreStateKey(
  session: SessionState,
  prior: SessionState,
  key: string
): SessionState {
  const wasActive = (prior.activeFeatures ?? []).includes(key);
  const active = (session.activeFeatures ?? []).filter((k) => k !== key);
  const put = <T>(
    now: Readonly<Record<string, T>> | undefined,
    before: Readonly<Record<string, T>> | undefined
  ): Record<string, T> | undefined => {
    const value = before?.[key];
    return value === undefined ? without(now, key) : { ...(now ?? {}), [key]: value };
  };
  return {
    ...session,
    activeFeatures: wasActive ? [...active, key] : active,
    effectTimers: put(session.effectTimers, prior.effectTimers),
    effectBoundaries: put(session.effectBoundaries, prior.effectBoundaries),
  };
}
