/**
 * Extra turns — pure rules for the two SRD sources that give a creature more than one
 * turn in a round:
 *
 *   • Thief's Reflexes (Rogue Thief 17): two turns in the FIRST round of a combat, the
 *     second at the rogue's Initiative minus 10.
 *   • Time Stop: the caster takes 1d4 + 1 turns in a row (the player rolls the die and
 *     types the count — the app never rolls).
 *
 * An extra turn refreshes what a new turn grants (Action, Bonus Action, movement,
 * Reaction, once-per-turn trackers) WITHOUT advancing the round, so round-based
 * durations do not tick. The solo sheet asks {@link soloExtraTurnOffer} which control to
 * show; the shared encounter steps {@link firstRoundSlots}, the frozen order with each
 * second turn slotted in for round 1 only.
 */
import type { ClassEntry } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";

export const THIEFS_REFLEXES_ID = "rogue-thief-reflexes";
export const TIME_STOP_ID = "time-stop";

/** Thief's Reflexes: the second turn's Initiative offset. */
export const THIEFS_REFLEXES_INITIATIVE_OFFSET = 10;
/** Time Stop's 1d4 + 1 bounds the count the player can type. */
export const TIME_STOP_MIN_TURNS = 2;
export const TIME_STOP_MAX_TURNS = 5;

export type ExtraTurnSource = typeof THIEFS_REFLEXES_ID | typeof TIME_STOP_ID;

/** Thief's Reflexes is the Thief subclass feature at Rogue level 17. */
export function classesGrantThiefsReflexes(
  classes: ReadonlyArray<Pick<ClassEntry, "classId" | "subclassId" | "level">> | undefined
): boolean {
  return (classes ?? []).some(
    (entry) =>
      entry.classId === "rogue" && entry.subclassId === "thief" && entry.level >= 17
  );
}

/**
 * Whether Time Stop was cast during the current turn, read off the play log: a
 * logged Time Stop use after the last turn line (a cast never claims the turn's
 * economy, so the log is where the cast is recorded). An undone cast removes its line.
 */
export function timeStopCastThisTurn(
  entries: ReadonlyArray<{ event: CombatEvent }>
): boolean {
  for (const { event } of [...entries].reverse()) {
    if (event.kind === "turn-end") return false;
    if (
      event.kind === "action-use" &&
      "srd" in event.action &&
      event.action.srd.kind === "spell" &&
      event.action.srd.key === TIME_STOP_ID
    ) {
      return true;
    }
  }
  return false;
}

/** The typed Time Stop count, or `null` when it is outside 1d4 + 1. */
export function parseTimeStopTurns(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const turns = Number(value.trim());
  return turns >= TIME_STOP_MIN_TURNS && turns <= TIME_STOP_MAX_TURNS ? turns : null;
}

/** The Time Stop turns the player entered for the round it was cast in. */
export interface TimeStopTurns {
  round: number;
  total: number;
  taken: number;
}

/** One extra turn the solo sheet can start now: turn `n` of `of`. */
export interface ExtraTurnOffer {
  source: ExtraTurnSource;
  n: number;
  of: number;
}

/**
 * The extra turn the solo sheet offers now, or `null`. Time Stop wins while it has
 * turns left in the round it was cast; otherwise Thief's Reflexes offers its one
 * second turn during round 1.
 */
export function soloExtraTurnOffer(input: {
  round: number;
  thiefsReflexes: boolean;
  reflexesTaken: boolean;
  timeStop: TimeStopTurns | null;
}): ExtraTurnOffer | null {
  const { timeStop } = input;
  if (timeStop && timeStop.round === input.round && timeStop.taken < timeStop.total) {
    return { source: TIME_STOP_ID, n: timeStop.taken + 1, of: timeStop.total };
  }
  if (input.round === 1 && input.thiefsReflexes && !input.reflexesTaken) {
    return { source: THIEFS_REFLEXES_ID, n: 2, of: 2 };
  }
  return null;
}

/** The turn within the current round the solo sheet is on, when it is an extra one. */
export function soloExtraTurnOrdinal(input: {
  round: number;
  reflexesTaken: boolean;
  timeStop: TimeStopTurns | null;
}): { n: number; of: number } | null {
  const { timeStop } = input;
  if (timeStop && timeStop.round === input.round && timeStop.taken > 0) {
    return { n: timeStop.taken, of: timeStop.total };
  }
  if (input.round === 1 && input.reflexesTaken) return { n: 2, of: 2 };
  return null;
}

// ─── Shared encounter: the round-1 second turn ─────────────────────────────────────

/** A stored second turn: `id` acts again just before `beforeId` (`null` = round end).
 *  `started` turns true when the turn pointer reaches that second turn. */
export interface StoredExtraTurn {
  id: string;
  beforeId: string | null;
  started?: boolean;
}

/** One step of the round's turn sequence. */
export interface TurnSlot {
  id: string;
  extra: boolean;
}

/**
 * Where each Thief's Reflexes holder takes its second turn: just before the first
 * combatant after it in `orderedIds` whose Initiative is lower than its own minus 10
 * (ties keep the earlier combatant first), or at the round's end.
 */
export function thiefsReflexesTurns(
  orderedIds: ReadonlyArray<string>,
  combatants: ReadonlyArray<{
    id: string;
    initiative: number | null;
    classes?: ReadonlyArray<Pick<ClassEntry, "classId" | "subclassId" | "level">>;
  }>
): StoredExtraTurn[] {
  const byId = new Map(combatants.map((c) => [c.id, c]));
  const turns: StoredExtraTurn[] = [];
  orderedIds.forEach((id, index) => {
    const holder = byId.get(id);
    if (!holder || holder.initiative === null) return;
    if (!classesGrantThiefsReflexes(holder.classes)) return;
    const second = holder.initiative - THIEFS_REFLEXES_INITIATIVE_OFFSET;
    const beforeId =
      orderedIds.slice(index + 1).find((other) => {
        const initiative = byId.get(other)?.initiative;
        return initiative !== null && initiative !== undefined && initiative < second;
      }) ?? null;
    turns.push({ id, beforeId });
  });
  return turns;
}

/**
 * The turn sequence for `round`: the frozen order, plus — in round 1 only — each
 * second turn slotted before its `beforeId`. A second turn whose anchor is gone or no
 * longer after its holder (a DM reorder) moves to the round's end, so it can never
 * come before the holder's first turn.
 */
export function firstRoundSlots(
  order: ReadonlyArray<string>,
  extraTurns: ReadonlyArray<StoredExtraTurn> | undefined,
  round: number
): TurnSlot[] {
  const normal = order.map((id) => ({ id, extra: false }));
  if (round !== 1 || !extraTurns?.length) return normal;
  const live = extraTurns.filter((turn, i) => {
    const firstIndex = extraTurns.findIndex((other) => other.id === turn.id);
    return firstIndex === i && order.includes(turn.id);
  });
  const anchor = (turn: StoredExtraTurn): string | null =>
    turn.beforeId !== null && order.indexOf(turn.beforeId) > order.indexOf(turn.id)
      ? turn.beforeId
      : null;
  const slots: TurnSlot[] = [];
  for (const id of order) {
    for (const turn of live)
      if (anchor(turn) === id) slots.push({ id: turn.id, extra: true });
    slots.push({ id, extra: false });
  }
  for (const turn of live)
    if (anchor(turn) === null) slots.push({ id: turn.id, extra: true });
  return slots;
}

/** Whether the turn pointer currently sits on a stored second turn (round 1 only). */
export function onExtraTurn(encounter: {
  round: number;
  currentCombatantId: string | null;
  extraTurns?: ReadonlyArray<StoredExtraTurn>;
}): boolean {
  return (
    encounter.round === 1 &&
    encounter.currentCombatantId !== null &&
    (encounter.extraTurns ?? []).some(
      (turn) => turn.id === encounter.currentCombatantId && turn.started === true
    )
  );
}

/** Index of the pointer in `slots` (the second-turn slot when it has started). */
export function currentSlotIndex(
  slots: ReadonlyArray<TurnSlot>,
  encounter: {
    round: number;
    currentCombatantId: string | null;
    extraTurns?: ReadonlyArray<StoredExtraTurn>;
  }
): number {
  if (encounter.currentCombatantId === null) return -1;
  const extra = onExtraTurn(encounter);
  return slots.findIndex(
    (slot) => slot.id === encounter.currentCombatantId && slot.extra === extra
  );
}

/** The stored second turns with `id`'s `started` flag set to `started`. Same reference
 *  when nothing changes. */
export function markExtraTurn(
  extraTurns: StoredExtraTurn[] | undefined,
  id: string,
  started: boolean
): StoredExtraTurn[] | undefined {
  const differs = (turn: StoredExtraTurn): boolean =>
    turn.id === id && (turn.started === true) !== started;
  if (!extraTurns?.some(differs)) return extraTurns;
  return extraTurns.map((turn) => (differs(turn) ? { ...turn, started } : turn));
}
