/**
 * The countdowns of lit states: a round timer armed when a state lights (Rage, a
 * potion), its End-Turn tick, and an encounter boundary ("until the end of your next
 * turn") with its expiry. Pure transitions over the sheet; the play log replays them.
 * The duration rules themselves (what counts down, by how much, when it expires) are
 * the engine's (`advanceEffectTimers` / `resolveActiveBoundaryEffects` in
 * smart-tracker); these only apply their result. Concentration that expires with a
 * state ends through its own `set-concentration` event, not here.
 */
import {
  advanceEffectTimers as advanceEffectTimersEngine,
  resolveActiveBoundaryEffects,
} from "@/lib/smart-tracker";
import type { CharacterDoc, SessionState } from "@/types/character";

export type BoundaryPhase = "turn-start" | "turn-end";

/** Arm `key`'s round countdown at `rounds`, counted from `tickedRound`. */
export function armEffectTimer(
  doc: CharacterDoc,
  key: string,
  rounds: number,
  tickedRound: number
): SessionState | null {
  if (!Number.isFinite(rounds) || rounds <= 0) return null;
  return {
    ...doc.session,
    effectTimers: {
      ...(doc.session.effectTimers ?? {}),
      [key]: { roundsLeft: rounds, tickedRound },
    },
  };
}

/** Arm `key` to end at an encounter boundary (a round and the phase within it). */
export function armEffectBoundary(
  doc: CharacterDoc,
  key: string,
  boundary: { round: number; phase: BoundaryPhase }
): SessionState | null {
  if (!Number.isFinite(boundary.round) || boundary.round < 1) return null;
  return {
    ...doc.session,
    effectBoundaries: {
      ...(doc.session.effectBoundaries ?? {}),
      [key]: { round: Math.round(boundary.round), phase: boundary.phase },
    },
  };
}

/** Drop expired state keys from the lit toggles and their cast levels. */
function withoutKeys(session: SessionState, expired: ReadonlySet<string>): SessionState {
  const castLevels = Object.fromEntries(
    Object.entries(session.activeSpellCastLevels ?? {}).filter(
      ([key]) => !expired.has(key)
    )
  );
  return {
    ...session,
    activeFeatures: (session.activeFeatures ?? []).filter((key) => !expired.has(key)),
    activeSpellCastLevels: Object.keys(castLevels).length > 0 ? castLevels : undefined,
  };
}

/** One End-Turn tick of every timed state (for `forRound`, when given). */
export function advanceEffectTimers(
  doc: CharacterDoc,
  forRound?: number
): {
  session: SessionState;
  expired: ReturnType<typeof advanceEffectTimersEngine>["expired"];
} {
  const { timers, expired } = advanceEffectTimersEngine(doc, forRound);
  const expiredKeys = new Set(expired.map((effect) => effect.activeKey));
  return {
    session: withoutKeys({ ...doc.session, effectTimers: timers }, expiredKeys),
    expired,
  };
}

/** The boundary states that have expired at `position`. */
export function expiredBoundaries(
  doc: CharacterDoc,
  position: { round: number; phase: BoundaryPhase }
): { activeKey: string; sourceId: string }[] {
  const sources = new Map(
    resolveActiveBoundaryEffects(doc).map((effect) => [effect.activeKey, effect.sourceId])
  );
  const phaseIndex = position.phase === "turn-start" ? 0 : 1;
  return Object.entries(doc.session.effectBoundaries ?? {}).flatMap(
    ([activeKey, boundary]) =>
      position.round > boundary.round ||
      (position.round === boundary.round &&
        phaseIndex >= (boundary.phase === "turn-start" ? 0 : 1))
        ? [{ activeKey, sourceId: sources.get(activeKey) ?? activeKey }]
        : []
  );
}

/** End every boundary state that has expired at `position`; null when none has. */
export function expireEffectBoundaries(
  doc: CharacterDoc,
  position: { round: number; phase: BoundaryPhase }
): SessionState | null {
  const expired = expiredBoundaries(doc, position);
  if (expired.length === 0) return null;
  const expiredKeys = new Set(expired.map((effect) => effect.activeKey));
  const boundaries = Object.fromEntries(
    Object.entries(doc.session.effectBoundaries ?? {}).filter(
      ([key]) => !expiredKeys.has(key)
    )
  );
  return {
    ...withoutKeys(doc.session, expiredKeys),
    effectBoundaries: Object.keys(boundaries).length > 0 ? boundaries : undefined,
  };
}
