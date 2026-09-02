/**
 * Table operations: the clock (start, initiative, begin-turns, end-turn, end) and the
 * qualitative boundaries (rest, day phase). Pure; returns the next state plus the events
 * the boundary emitted so triggered programs can react.
 */
import { assertNever, type EntityId } from "./ids";
import { dueAt, endEffects } from "./effects";
import { mustEntity } from "./state";
import type {
  CombatEvent,
  Entity,
  FoldedState,
  Rejection,
  TableOp,
  TurnLedger,
} from "./types";

export type TableResult =
  | {
      readonly kind: "applied";
      readonly state: FoldedState;
      readonly events: readonly CombatEvent[];
    }
  | { readonly kind: "rejected"; readonly rejection: Rejection };

const FRESH_LEDGER: TurnLedger = {
  action: 0,
  bonus: 0,
  reaction: 0,
  attacksUsed: 0,
  movementUsed: 0,
  claims: [],
};

function reject(detail: string): TableResult {
  return { kind: "rejected", rejection: { reason: "invalid-table-op", detail } };
}

function withEntity(state: FoldedState, entity: Entity): FoldedState {
  return { ...state, entities: { ...state.entities, [entity.id]: entity } };
}

/** The start of `entity`'s turn: ledger reset and turn-edge(start) expiries. */
function startTurn(
  state: FoldedState,
  entity: EntityId,
  events: CombatEvent[]
): FoldedState {
  let next = withEntity(state, { ...mustEntity(state, entity), turn: FRESH_LEDGER });
  events.push({ kind: "turn-start", entity });
  const due = dueAt(
    next,
    (lifetime) =>
      lifetime.kind === "turn-edge" &&
      lifetime.entity === entity &&
      lifetime.edge === "start" &&
      lifetime.round <= next.clock.round
  );
  const ended = endEffects(next, due);
  next = ended.state;
  events.push(...ended.events);
  return next;
}

function endTurn(
  state: FoldedState,
  entity: EntityId,
  events: CombatEvent[]
): FoldedState {
  events.push({ kind: "turn-end", entity });
  const due = dueAt(
    state,
    (lifetime) =>
      lifetime.kind === "turn-edge" &&
      lifetime.entity === entity &&
      lifetime.edge === "end" &&
      lifetime.round <= state.clock.round
  );
  const ended = endEffects(state, due);
  events.push(...ended.events);
  return ended.state;
}

function nextAlive(
  state: FoldedState,
  from: number
): { index: number; wrapped: boolean } | null {
  const { order, current } = state.clock;
  const start = current === null ? -1 : from;
  for (let step = 1; step <= order.length; step += 1) {
    const index = (start + step) % order.length;
    const wrapped = start + step >= order.length;
    const id = order[index];
    const entity: Entity | undefined = id === undefined ? undefined : state.entities[id];
    if (entity !== undefined && entity.vitals.life !== "dead") return { index, wrapped };
  }
  return null;
}

export function applyTable(state: FoldedState, op: TableOp): TableResult {
  const events: CombatEvent[] = [];
  switch (op.op) {
    case "start": {
      if (state.clock.phase !== "idle" && state.clock.phase !== "ended") {
        return reject("start: encounter already running");
      }
      return {
        kind: "applied",
        state: {
          ...state,
          epoch: op.epoch,
          clock: {
            ...state.clock,
            phase: "gathering",
            round: 0,
            order: [],
            current: null,
            initiative: {},
          },
          windows: [],
          checks: [],
          declared: {},
        },
        events,
      };
    }
    case "add-entity": {
      if (state.entities[op.entity.id])
        return reject(`add-entity: duplicate id ${op.entity.id}`);
      const next = withEntity(state, op.entity);
      if (state.clock.phase === "turns") {
        return {
          kind: "applied",
          state: {
            ...next,
            clock: { ...next.clock, order: [...next.clock.order, op.entity.id] },
          },
          events,
        };
      }
      return { kind: "applied", state: next, events };
    }
    case "remove-entity": {
      const entity = state.entities[op.entity];
      if (!entity) return reject(`remove-entity: unknown ${op.entity}`);
      const sourced = Object.values(state.effects)
        .filter(
          (effect) => effect.source.entity === op.entity || effect.target === op.entity
        )
        .map((effect) => effect.id);
      const ended = endEffects(state, sourced);
      events.push(...ended.events);
      const entities = Object.fromEntries(
        Object.entries(ended.state.entities).filter(([id]) => id !== op.entity)
      );
      const order = ended.state.clock.order.filter((id) => id !== op.entity);
      let clock = { ...ended.state.clock, order };
      if (clock.current === op.entity) {
        const index = state.clock.order.indexOf(op.entity);
        const following = order[index % Math.max(order.length, 1)] ?? null;
        clock = { ...clock, current: following };
      }
      const relations = ended.state.relations.filter(
        (relation) => !Object.values(relation).includes(op.entity)
      );
      return {
        kind: "applied",
        state: { ...ended.state, entities, clock, relations },
        events,
      };
    }
    case "set-initiative": {
      if (!state.entities[op.entity])
        return reject(`set-initiative: unknown ${op.entity}`);
      return {
        kind: "applied",
        state: {
          ...state,
          clock: {
            ...state.clock,
            initiative: { ...state.clock.initiative, [op.entity]: op.value },
          },
        },
        events,
      };
    }
    case "begin-turns": {
      if (state.clock.phase !== "gathering") return reject("begin-turns: not gathering");
      for (const id of op.order)
        if (!state.entities[id]) return reject(`begin-turns: unknown ${id}`);
      const first = op.order[0];
      if (first === undefined) return reject("begin-turns: empty order");
      let next: FoldedState = {
        ...state,
        clock: {
          ...state.clock,
          phase: "turns",
          round: 1,
          order: [...op.order],
          current: first,
        },
      };
      events.push({ kind: "round-start", round: 1 });
      next = startTurn(next, first, events);
      return { kind: "applied", state: next, events };
    }
    case "end-turn": {
      if (state.clock.phase !== "turns" || state.clock.current === null)
        return reject("end-turn: not in turns");
      let next = endTurn(state, state.clock.current, events);
      const from = next.clock.order.indexOf(state.clock.current);
      const found = nextAlive(next, from);
      if (!found) return reject("end-turn: no living participant");
      const round = found.wrapped ? next.clock.round + 1 : next.clock.round;
      const entity = next.clock.order[found.index];
      if (entity === undefined) return reject("end-turn: order out of range");
      next = { ...next, clock: { ...next.clock, round, current: entity } };
      if (found.wrapped) events.push({ kind: "round-start", round });
      next = startTurn(next, entity, events);
      return { kind: "applied", state: next, events };
    }
    case "end": {
      return {
        kind: "applied",
        state: {
          ...state,
          clock: { ...state.clock, phase: "ended", current: null },
          windows: [],
          declared: {},
        },
        events,
      };
    }
    case "rest": {
      const ordinal = state.clock.restOrdinal + 1;
      const due = dueAt(
        state,
        (lifetime) =>
          lifetime.kind === "rest" &&
          (lifetime.rest === op.rest || op.rest === "long") &&
          lifetime.minimumOrdinal <= ordinal
      );
      const ended = endEffects(
        { ...state, clock: { ...state.clock, restOrdinal: ordinal } },
        due
      );
      events.push(...ended.events, { kind: "rest-completed", rest: op.rest, ordinal });
      return { kind: "applied", state: ended.state, events };
    }
    case "settings": {
      return {
        kind: "applied",
        state: {
          ...state,
          settings: { ...state.settings, revealMonsterHp: op.revealMonsterHp },
        },
        events,
      };
    }
    default:
      return assertNever(op, "table op");
  }
}
