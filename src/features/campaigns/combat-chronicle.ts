/**
 * combat-chronicle — PURE recorders that append {@link CombatChronicleEvent}s to an
 * encounter's ephemeral `events` feed as the DM runs the fight.
 *
 * The chronicle's data seam: the emit points (monster HP, PC HP, conditions, logged
 * miss/pass) compose one of these recorders with the plain encounter reducer, so
 * every factual beat lands as a structured event (ids + numbers only — golden rule
 * 7). NO React, NO Firebase (rides the pure-module + architecture-direction guards):
 * the events ride the SAME debounced encounter writer the reducers already use, so
 * accumulating them adds NO write cadence. The DM's tracker is the ONLY author (the
 * emit seams are DM-gated); a PC's live HP lives in its `combat/state` subdoc, so a
 * PC-HP event is appended in the same motion by {@link recordPcHp} from the pre/post
 * HP the caller already holds.
 *
 * Deterministic + total: every function returns a NEW state (or the same when
 * there's nothing to record). Down-crossing is derived HERE (one place, testable):
 * a PC when its current HP crosses to 0, a monster group when its LAST live token
 * dies.
 */

import type { EncounterState, EncounterMonster } from "@/types/campaign";
import type { CombatChronicleEvent, EncounterOutcome } from "@/types/combat-chronicle";
import { setHp, isDown } from "@/features/campaigns/encounter";

/** A chronicle event WITHOUT its append-time-stamped fields (id + round). Distributive
 *  so each union member keeps its own discriminated shape. */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type NewChronicleEvent = DistributiveOmit<CombatChronicleEvent, "id" | "round">;

/**
 * Append one event, stamping its stable id (the append INDEX — deterministic, no RNG)
 * and the current `round`. The single writer of the feed; every recorder routes here.
 */
export function appendEvent(
  state: EncounterState,
  event: NewChronicleEvent
): EncounterState {
  const events = state.events ?? [];
  // Spread + stamp reconstructs a valid discriminated member (id/round added back to
  // the omitted shape); TS narrows it to CombatChronicleEvent — no cast needed.
  const full: CombatChronicleEvent = {
    ...event,
    id: String(events.length),
    round: state.round,
  };
  return { ...state, events: [...events, full] };
}

/** Map the event with `id`, returning a NEW state (or the same when no match). */
function mapEvent(
  state: EncounterState,
  id: string,
  fn: (e: CombatChronicleEvent) => CombatChronicleEvent
): EncounterState {
  const events = state.events;
  if (!events) return state;
  const index = events.findIndex((e) => e.id === id);
  if (index < 0) return state;
  return { ...state, events: events.map((e, i) => (i === index ? fn(e) : e)) };
}

/**
 * Record a MONSTER token HP SET (the absolute-value edit the DM books) plus any
 * down-crossing. Applies {@link setHp}, derives the delta, and appends a
 * `hp-damage` (delta < 0) or `hp-heal` (delta > 0) event; a no-change edit (a clamp
 * no-op) records nothing. `attackerId` rides a damage event ONLY when the DM
 * attributed it (absent = unattributed). A `down` event follows when this hit
 * defeated the LAST live token of the group.
 */
export function recordMonsterHp(
  state: EncounterState,
  monsterId: string,
  tokenIndex: number,
  value: number,
  attackerId?: string
): EncounterState {
  const before = state.combatants.find((c) => c.id === monsterId);
  if (!before || before.kind !== "monster") return state;
  const beforeHp = before.tokens[tokenIndex] ?? 0;
  const next = setHp(state, monsterId, tokenIndex, value);
  const after = next.combatants.find((c) => c.id === monsterId);
  if (!after || after.kind !== "monster") return next;
  const afterHp = after.tokens[tokenIndex] ?? 0;
  const delta = afterHp - beforeHp;
  if (delta === 0) return next;
  let out =
    delta < 0
      ? appendEvent(next, {
          kind: "hp-damage",
          targetId: monsterId,
          amount: -delta,
          current: afterHp,
          max: after.maxHp,
          ...(attackerId ? { attackerId } : {}),
        })
      : appendEvent(next, {
          kind: "hp-heal",
          targetId: monsterId,
          amount: delta,
          current: afterHp,
          max: after.maxHp,
        });
  if (!isDown(before) && isDown(after)) {
    out = appendEvent(out, { kind: "down", targetId: monsterId });
  }
  return out;
}

/**
 * Record a PC HP change. A PC's live HP lives in its `combat/state` subdoc (NOT the
 * encounter), so the caller passes the pre/post current it already reduced; this only
 * appends the event(s). Down-crossing is derived here (damage, `preCurrent > 0`,
 * `postCurrent === 0`) so the rule lives in ONE place. A zero-amount edit records
 * nothing.
 */
export function recordPcHp(
  state: EncounterState,
  args: {
    targetId: string;
    kind: "damage" | "heal";
    /** Incoming amount (damage dealt / HP healed). */
    amount: number;
    /** The PC's current HP BEFORE the edit. */
    preCurrent: number;
    /** The PC's current HP AFTER the edit (already clamped/temp-absorbed by the caller). */
    postCurrent: number;
    max: number;
    /** The attributed attacker (a damage tap sets it); absent = unattributed. */
    attackerId?: string;
  }
): EncounterState {
  if (args.amount <= 0) return state;
  let out =
    args.kind === "damage"
      ? appendEvent(state, {
          kind: "hp-damage",
          targetId: args.targetId,
          amount: args.amount,
          current: args.postCurrent,
          max: args.max,
          ...(args.attackerId ? { attackerId: args.attackerId } : {}),
        })
      : appendEvent(state, {
          kind: "hp-heal",
          targetId: args.targetId,
          amount: args.amount,
          current: args.postCurrent,
          max: args.max,
        });
  if (args.kind === "damage" && args.preCurrent > 0 && args.postCurrent === 0) {
    out = appendEvent(out, { kind: "down", targetId: args.targetId });
  }
  return out;
}

/** Record a condition gain (`added`) or loss on a combatant. */
export function recordCondition(
  state: EncounterState,
  targetId: string,
  conditionId: string,
  added: boolean
): EncounterState {
  return appendEvent(state, {
    kind: added ? "condition-gain" : "condition-loss",
    targetId,
    conditionId,
  });
}

/** Record a LOGGED miss (pulled explicitly — never inferred). */
export function recordMiss(
  state: EncounterState,
  attackerId: string,
  targetId: string
): EncounterState {
  return appendEvent(state, { kind: "attack-miss", attackerId, targetId });
}

/** Record a LOGGED pass/hold on the active combatant (pulled explicitly). */
export function recordTurnPass(state: EncounterState, actorId: string): EncounterState {
  return appendEvent(state, { kind: "turn-pass", actorId });
}

/** Attribute a pending `hp-damage` event to `attackerId` (the one-tap pick). A no-op
 *  on any other event kind. Clears any prior skip so a re-tap re-attributes. */
export function setEventAttacker(
  state: EncounterState,
  eventId: string,
  attackerId: string
): EncounterState {
  return mapEvent(state, eventId, (e) => {
    if (e.kind !== "hp-damage") return e;
    const next = { ...e, attackerId };
    delete next.attackerSkipped;
    return next;
  });
}

/** Resolve a pending `hp-damage` event as deliberately UNATTRIBUTED (the "—" chip):
 *  hide the picker without ever guessing a "who". A no-op on any other event kind.
 *  Drops any prior attribution (the DM changed their mind to "no one"). */
export function skipEventAttacker(
  state: EncounterState,
  eventId: string
): EncounterState {
  return mapEvent(state, eventId, (e) => {
    if (e.kind !== "hp-damage") return e;
    const next = { ...e, attackerSkipped: true };
    delete next.attackerId;
    return next;
  });
}

/**
 * The light, STATE-SUPPORTED outcome of a finished fight: `victory` when the
 * encounter held at least one monster and EVERY monster group is defeated, else the
 * neutral `ended`. Never asserts an outcome the state can't support (a fight ended
 * with monsters still standing is `ended`, editable by the DM at close).
 */
export function inferOutcome(state: EncounterState): EncounterOutcome {
  const monsters = state.combatants.filter(
    (c): c is EncounterMonster => c.kind === "monster"
  );
  return monsters.length > 0 && monsters.every(isDown) ? "victory" : "ended";
}
