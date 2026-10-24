/**
 * The shared-combat lifecycle (owner direction 2026-10-23, row 12): combat starts on
 * the first initiative roll, for the whole campaign, and it never blocks.
 *
 * - Start: a roll with no encounter starts one with every attached member in it;
 *   there is no Start or Begin-turns step.
 * - Order: until a turn has been passed, the current turn is always the top of the
 *   initiative order, so a higher roll that comes in late takes it. After that a late
 *   roll (or a late member) slots in by initiative without moving the current turn.
 * - Advance: anyone at the table, at once (owner, 2026-10-24: the group plays fair).
 * - End: every enemy down, a rest, or {@link IDLE_END_MS} with nothing happening, or
 *   anyone by hand.
 * - Nothing is a disaster (owner, 2026-10-24): a passed turn goes back
 *   ({@link turnBack}), and an ended fight is kept, marked `ended`, until the next
 *   roll starts a new one, so it reopens as it was ({@link reopenCombat}).
 *
 * Pure transitions over the stored `EncounterState`, timed by the caller's `now`; the
 * timing lives in `EncounterState.clock`. PC initiative totals (roll + bonus) are the
 * caller's (the encounter view computes them); a monster's is on the monster.
 */
import type {
  EncounterClock,
  EncounterCombatant,
  EncounterEndReason,
  EncounterState,
} from "@/types/campaign";
import {
  advanceTurn,
  isDown,
  prevTurn,
  sortByInitiative,
  startEncounter,
  type EncounterPcSeed,
} from "./encounter";

/** How long a fight may go with nothing happening before it ends by itself. */
export const IDLE_END_MS = 60 * 60_000;

export interface RollInitiativeInput {
  /** The combatant who rolled: `pc-<uid>` for a player, a monster id for the DM. */
  combatantId: string;
  /** Every rolled PC's initiative total, by combatant id. */
  pcInitiatives: Readonly<Record<string, number>>;
  /** The members' attached characters (who is in a fight that starts now). */
  seeds: Readonly<Record<string, EncounterPcSeed>>;
  attachedUids: ReadonlyArray<string>;
  now: number;
}

/**
 * Record an initiative roll. With no encounter it starts one; a PC not yet in the
 * fight (attached after it started) joins; the turn order then takes every combatant
 * who has an initiative.
 */
export function rollInitiative(
  state: EncounterState | null,
  input: RollInitiativeInput
): EncounterState {
  const { now } = input;
  // A roll after the fight ended starts a new one.
  const live = state?.ended ? null : state;
  let fight =
    live ??
    withClock(startEncounter(input.seeds, input.attachedUids, now), {
      startedAt: now,
      lastActivityAt: now,
      turnStartedAt: now,
      turnsBegun: false,
    });
  fight = joinPc(fight, input.combatantId, input.seeds);
  return touch(syncOrder(fight, input.pcInitiatives, now), now);
}

/** Whether the turn can be passed: by anyone at the table, whenever there is one. */
export function canAdvanceTurn(state: EncounterState): boolean {
  return state.currentCombatantId !== null && !state.ended;
}

/** Pass the turn: the next combatant's turn starts now, and turns have begun. */
export function passTurn(state: EncounterState, now: number): EncounterState {
  const moved = advanceTurn(state);
  if (moved === state) return state;
  const clock = state.clock;
  return clock
    ? withClock(moved, {
        ...clock,
        lastActivityAt: now,
        turnStartedAt: now,
        turnsBegun: true,
      })
    : moved;
}

/**
 * The undo of a pass: the turn goes back to the previous combatant (and round), and
 * their turn starts again now. Anyone may do it, as anyone may pass.
 */
export function turnBack(state: EncounterState, now: number): EncounterState {
  const moved = prevTurn(state);
  if (moved === state) return state;
  return state.clock
    ? withClock(moved, { ...state.clock, lastActivityAt: now, turnStartedAt: now })
    : moved;
}

export type { EncounterEndReason };

/** Why the fight should end by itself now, or null while it goes on (or is over). */
export function encounterEndReason(
  state: EncounterState,
  facts: { now: number; restTaken?: boolean }
): Exclude<EncounterEndReason, "manual"> | null {
  if (state.ended) return null;
  const enemies = state.combatants.filter(
    (c) => c.kind === "monster" && c.side !== "ally"
  );
  if (enemies.length > 0 && enemies.every((c) => c.kind === "monster" && isDown(c)))
    return "enemies-defeated";
  if (facts.restTaken) return "rest";
  const last = state.clock?.lastActivityAt;
  if (last !== undefined && facts.now - last >= IDLE_END_MS) return "idle";
  return null;
}

/** End the fight, keeping it so it can reopen; the next roll starts a new one. */
export function endCombat(
  state: EncounterState,
  reason: EncounterEndReason,
  now: number
): EncounterState {
  return { ...state, ended: { reason, at: now } };
}

/** The undo of an end: the fight goes on exactly where it stopped. */
export function reopenCombat(state: EncounterState, now: number): EncounterState {
  if (!state.ended) return state;
  const { ended: _ended, ...open } = state;
  void _ended;
  return touch(open, now);
}

/** Something happened in the fight (a roll, damage, a note): it is not idle. */
export function touch(state: EncounterState, now: number): EncounterState {
  return state.clock ? withClock(state, { ...state.clock, lastActivityAt: now }) : state;
}

function withClock(state: EncounterState, clock: EncounterClock): EncounterState {
  return { ...state, clock };
}

function joinPc(
  state: EncounterState,
  combatantId: string,
  seeds: Readonly<Record<string, EncounterPcSeed>>
): EncounterState {
  if (!combatantId.startsWith("pc-")) return state;
  if (state.combatants.some((c) => c.id === combatantId)) return state;
  const uid = combatantId.slice("pc-".length);
  const seed = seeds[uid];
  if (!seed) return state;
  const pc: EncounterCombatant = {
    kind: "pc",
    id: combatantId,
    memberUid: uid,
    characterId: seed.characterId,
  };
  return { ...state, combatants: [...state.combatants, pc] };
}

function initiativeOf(
  combatant: EncounterCombatant,
  pcInitiatives: Readonly<Record<string, number>>
): number | null {
  if (combatant.kind === "monster") return combatant.initiative;
  const total = pcInitiatives[combatant.id];
  return typeof total === "number" && Number.isFinite(total) ? total : null;
}

/** Put every combatant with an initiative into the order (see the module rules). */
function syncOrder(
  state: EncounterState,
  pcInitiatives: Readonly<Record<string, number>>,
  now: number
): EncounterState {
  const rolled = state.combatants.flatMap((c) => {
    const initiative = initiativeOf(c, pcInitiatives);
    return initiative === null ? [] : [{ id: c.id, initiative }];
  });
  const sorted = sortByInitiative(rolled).map((r) => r.id);
  const clock = state.clock;
  if (!clock?.turnsBegun) {
    const current = sorted[0] ?? null;
    const next: EncounterState = { ...state, order: sorted, currentCombatantId: current };
    return clock && current !== state.currentCombatantId
      ? withClock(next, { ...clock, turnStartedAt: now })
      : next;
  }
  // Turns have begun: keep the order as it is (the DM may have reordered it) and slot
  // each newcomer in before the first combatant it out-rolled.
  const initiative = new Map(rolled.map((r) => [r.id, r.initiative]));
  const order = [...(state.order ?? [])];
  for (const id of sorted) {
    if (order.includes(id)) continue;
    const mine = initiative.get(id) ?? Number.NEGATIVE_INFINITY;
    const at = order.findIndex(
      (other) => (initiative.get(other) ?? Number.NEGATIVE_INFINITY) < mine
    );
    order.splice(at < 0 ? order.length : at, 0, id);
  }
  return {
    ...state,
    order,
    currentCombatantId: state.currentCombatantId ?? order[0] ?? null,
  };
}
