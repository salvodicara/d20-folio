/**
 * combat-chronicle — PURE recorders that append {@link CombatChronicleEvent}s to an
 * encounter's ephemeral `events` feed as the DM runs the fight.
 *
 * The chronicle's data seam: the emit points (monster HP, PC HP, conditions) compose
 * one of these recorders with the plain encounter reducer, so every LANDED beat lands
 * as a structured event (ids + numbers only — golden rule
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
import type { LocText } from "@/lib/loc-text";
import {
  setHp,
  applyHp,
  isDown,
  setMonsterCondition,
  setMonsterTempHp,
} from "@/features/campaigns/encounter";

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

/** Apply incoming damage to a monster through Temporary HP first, then ordinary HP,
 * and record the single factual damage beat. This is the damage seam used by both the
 * universal resolver and the DM's manual override. */
export function recordMonsterDamage(
  state: EncounterState,
  monsterId: string,
  tokenIndex: number,
  amount: number,
  attackerId?: string,
  action?: LocText
): EncounterState {
  const before = state.combatants.find((c) => c.id === monsterId);
  if (!before || before.kind !== "monster" || amount <= 0) return state;
  const beforeHp = before.tokens[tokenIndex] ?? 0;
  const tempAbsorbed = Math.min(before.tempHp ?? 0, Math.max(0, Math.round(amount)));
  const afterTemp = setMonsterTempHp(
    state,
    monsterId,
    (before.tempHp ?? 0) - tempAbsorbed
  );
  const remaining = Math.max(0, Math.round(amount) - tempAbsorbed);
  const afterHpState = setHp(afterTemp, monsterId, tokenIndex, beforeHp - remaining);
  const after = afterHpState.combatants.find((c) => c.id === monsterId);
  if (!after || after.kind !== "monster") return afterHpState;
  const hpLost = beforeHp - (after.tokens[tokenIndex] ?? 0);
  const landed = tempAbsorbed + hpLost;
  if (landed === 0) return afterHpState;
  let out = appendEvent(afterHpState, {
    kind: "hp-damage",
    targetId: monsterId,
    amount: landed,
    current: after.tokens[tokenIndex] ?? 0,
    max: after.maxHp,
    ...(tempAbsorbed > 0 ? { tempAbsorbed } : {}),
    ...(attackerId ? { attackerId } : {}),
    ...(action ? { action } : {}),
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
    /** Healing provenance; optional for manual DM edits. */
    actorId?: string;
    action?: LocText;
    tempAbsorbed?: number;
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
          ...(args.tempAbsorbed ? { tempAbsorbed: args.tempAbsorbed } : {}),
          ...(args.attackerId ? { attackerId: args.attackerId } : {}),
          ...(args.action ? { action: args.action } : {}),
        })
      : appendEvent(state, {
          kind: "hp-heal",
          targetId: args.targetId,
          amount: args.amount,
          current: args.postCurrent,
          max: args.max,
          ...(args.actorId ? { actorId: args.actorId } : {}),
          ...(args.action ? { action: args.action } : {}),
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
  added: boolean,
  provenance?: { actorId?: string; action?: LocText }
): EncounterState {
  return appendEvent(state, {
    kind: added ? "condition-gain" : "condition-loss",
    targetId,
    conditionId,
    ...(added && provenance?.actorId ? { attackerId: provenance.actorId } : {}),
    ...(!added && provenance?.actorId ? { actorId: provenance.actorId } : {}),
    ...(provenance?.action ? { action: provenance.action } : {}),
  });
}

/** The index of the first monster token BELOW its max (where a restore lands its HP
 *  back); falls back to `0` when every token is full. Pure. */
function firstRestorableToken(tokens: ReadonlyArray<number>, max: number): number {
  const i = tokens.findIndex((hp) => hp < max);
  return i < 0 ? 0 : i;
}

/**
 * UNDO one MONSTER HP event from the chronicle (owner 2026-08-02 — remediability): the
 * DM's one-tap reversal of an auto-applied player hit (or their own mis-booked edit). It
 * both REMOVES the chronicle line AND restores the monster's HP by the SAME amount, so a
 * wrong number is corrected in a single obvious tap — no HP left silently dropped.
 *
 * Damage undone → the amount is HEALED back onto the group (the first token below max);
 * a heal undone → the amount is re-damaged off it. Any `down` line for that target is
 * dropped once the group is no longer down (a restored group is no longer defeated). A
 * no-op on a PC target (a PC's live HP lives in its own subdoc, not the encounter — the
 * DM corrects that on the PC card) and on any non-HP event / unknown id. The reconcile
 * layer then re-derives the feed: with the applied event gone, the player's declaration
 * fuses no drop, so its line disappears too.
 */
export function undoHpEvent(state: EncounterState, eventId: string): EncounterState {
  const events = state.events;
  if (!events) return state;
  const event = events.find((e) => e.id === eventId);
  if (!event || (event.kind !== "hp-damage" && event.kind !== "hp-heal")) return state;
  const target = state.combatants.find((c) => c.id === event.targetId);
  // Only a monster's HP lives on the encounter; a PC event just clears its line. Undoing
  // damage HEALS the amount back (onto the first token below max); undoing a heal
  // re-damages it (off the first live token) — the reverse delta on a sensible token.
  const isDamage = event.kind === "hp-damage";
  let restored = state;
  if (target && target.kind === "monster") {
    const tokenIndex = isDamage
      ? firstRestorableToken(target.tokens, target.maxHp)
      : Math.max(
          0,
          target.tokens.findIndex((hp) => hp > 0)
        );
    restored = applyHp(
      state,
      event.targetId,
      tokenIndex,
      isDamage ? event.amount - (event.tempAbsorbed ?? 0) : -event.amount
    );
    if (isDamage && (event.tempAbsorbed ?? 0) > 0) {
      restored = setMonsterTempHp(
        restored,
        event.targetId,
        (target.tempHp ?? 0) + (event.tempAbsorbed ?? 0)
      );
    }
  }
  // Drop the undone line, plus any now-stale `down` line for the same target once the
  // restore leaves the group standing again.
  const targetAfter = restored.combatants.find((c) => c.id === event.targetId);
  const stillDown = targetAfter?.kind === "monster" && isDown(targetAfter);
  const nextEvents = restored.events?.filter(
    (e) =>
      e.id !== eventId &&
      !(e.kind === "down" && e.targetId === event.targetId && !stillDown)
  );
  return { ...restored, events: nextEvents };
}

/** Reverse one MONSTER condition event and remove its Chronicle line. A PC remains a
 * no-op because its conditions live in its own combat-state subdocument; the DM can
 * correct those directly on the PC card without pretending the campaign doc owns them. */
export function undoConditionEvent(
  state: EncounterState,
  eventId: string
): EncounterState {
  const event = state.events?.find((candidate) => candidate.id === eventId);
  if (!event || (event.kind !== "condition-gain" && event.kind !== "condition-loss")) {
    return state;
  }
  const target = state.combatants.find((combatant) => combatant.id === event.targetId);
  if (!target || target.kind !== "monster") return state;
  const restored = setMonsterCondition(
    state,
    event.targetId,
    event.conditionId,
    event.kind === "condition-loss"
  );
  return {
    ...restored,
    events: restored.events?.filter((candidate) => candidate.id !== eventId),
  };
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
    (c): c is EncounterMonster => c.kind === "monster" && (c.side ?? "enemy") === "enemy"
  );
  return monsters.length > 0 && monsters.every(isDown) ? "victory" : "ended";
}
