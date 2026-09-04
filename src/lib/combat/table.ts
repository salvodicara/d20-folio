/**
 * Table operations: the clock (start, initiative, begin-turns, end-turn, end) and the
 * qualitative boundaries (rest, day phase). Pure; returns the next state plus the events
 * the boundary emitted so triggered programs can react.
 */
import { assertNever, type EntityId, type MechanicId } from "./ids";
import { dueAt, endEffects } from "./effects";
import { hideRect, isMapBackground, isMapRect, revealRect } from "./map";
import { conformMechanic, type Mechanic } from "./mechanic";
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
  movementExtra: 0,
  claims: [],
};

function reject(detail: string): TableResult {
  return { kind: "rejected", rejection: { reason: "invalid-table-op", detail } };
}

function withEntity(state: FoldedState, entity: Entity): FoldedState {
  return { ...state, entities: { ...state.entities, [entity.id]: entity } };
}

type Carried =
  | { readonly ok: true; readonly mechanics: Readonly<Record<MechanicId, Mechanic>> }
  | { readonly ok: false; readonly rejected: TableResult };

/**
 * The definitions a seat op carried, conformed. A malformed one rejects the WHOLE op rather
 * than being skipped: an entity seated with half its actions would fold differently on a
 * client whose build happens to have the missing one in its static catalogue, which is exactly
 * the divergence carrying them was meant to end (design §2 D2).
 */
function conformCarried(op: string, mechanics: readonly Mechanic[]): Carried {
  const out: Record<MechanicId, Mechanic> = {};
  for (const value of mechanics) {
    const result = conformMechanic(value);
    if (!result.ok) {
      return {
        ok: false,
        rejected: reject(`${op}: mechanic ${value.id} ${result.rule} at ${result.path}`),
      };
    }
    out[result.mechanic.id] = result.mechanic;
  }
  return { ok: true, mechanics: out };
}

/**
 * Drop `ids` from `state.mechanics`, keeping any an entity still seated lists as its own.
 *
 * Both callers want that guard. Mechanic ids are not always instance-scoped — the monster
 * adapter keys by block id, so every ogre at the table shares `monster:ogre` — and a definition
 * only the departing (or re-projected) entity held is the only one safe to forget.
 */
function dropMechanics(state: FoldedState, ids: readonly MechanicId[]): FoldedState {
  if (ids.length === 0) return state;
  const listed = new Set(
    Object.values(state.entities).flatMap((entity) => entity.mechanics)
  );
  const doomed = ids.filter((id) => !listed.has(id));
  if (doomed.length === 0) return state;
  return {
    ...state,
    mechanics: Object.fromEntries(
      Object.entries(state.mechanics).filter(([id]) => !doomed.includes(id))
    ),
  };
}

/** `add-entity`/`join` body: registers the entity, and appends it to the turn order while
 *  turns are running (a lease-joining PC seats itself at the foot of the current order). */
function addEntity(
  state: FoldedState,
  entity: Entity,
  carried: Readonly<Record<MechanicId, Mechanic>>
): FoldedState {
  const next = {
    ...withEntity(state, entity),
    mechanics: { ...state.mechanics, ...carried },
  };
  if (next.clock.phase === "turns") {
    return { ...next, clock: { ...next.clock, order: [...next.clock.order, entity.id] } };
  }
  return next;
}

/** `remove-entity`/`leave` body: ends effects it sourced or received, prunes it from the turn
 *  order and repairs the current pointer, and drops relations that named it. */
function removeEntity(
  state: FoldedState,
  id: EntityId,
  events: CombatEvent[]
): FoldedState {
  const sourced = Object.values(state.effects)
    .filter((effect) => effect.source.entity === id || effect.target === id)
    .map((effect) => effect.id);
  const ended = endEffects(state, sourced);
  events.push(...ended.events);
  const entities = Object.fromEntries(
    Object.entries(ended.state.entities).filter(([entityId]) => entityId !== id)
  );
  const order = ended.state.clock.order.filter((entityId) => entityId !== id);
  let clock = { ...ended.state.clock, order };
  if (clock.current === id) {
    const index = state.clock.order.indexOf(id);
    const following = order[index % Math.max(order.length, 1)] ?? null;
    clock = { ...clock, current: following };
  }
  const relations = ended.state.relations.filter(
    (relation) => !Object.values(relation).includes(id)
  );
  const departing = state.entities[id]?.mechanics ?? [];
  return dropMechanics({ ...ended.state, entities, clock, relations }, departing);
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
      const carried = conformCarried("add-entity", op.mechanics);
      if (!carried.ok) return carried.rejected;
      return {
        kind: "applied",
        state: addEntity(state, op.entity, carried.mechanics),
        events,
      };
    }
    case "remove-entity": {
      if (!state.entities[op.entity])
        return reject(`remove-entity: unknown ${op.entity}`);
      return { kind: "applied", state: removeEntity(state, op.entity, events), events };
    }
    case "join": {
      // Appended by the joining PC's own owner client (`docs/superpowers/plans/2026-09-04-v2-
      // stage-4-shared-encounter`): `add-entity` semantics — duplicate id rejected, appended to
      // the turn order while turns are running.
      if (state.entities[op.entity.id])
        return reject(`join: duplicate id ${op.entity.id}`);
      const carried = conformCarried("join", op.mechanics);
      if (!carried.ok) return carried.rejected;
      return {
        kind: "applied",
        state: addEntity(state, op.entity, carried.mechanics),
        events,
      };
    }
    case "leave": {
      // `remove-entity` semantics: effects it sourced or received end, relations are pruned,
      // the order and current pointer are repaired.
      if (!state.entities[op.entity]) return reject(`leave: unknown ${op.entity}`);
      return { kind: "applied", state: removeEntity(state, op.entity, events), events };
    }
    case "sync": {
      // The owner's client writes the folded entity back into the personal aggregate: an
      // upsert — replaces an existing entity of the same id wholesale, inserts otherwise. The
      // turn order is untouched (sync never changes who is seated or in what order).
      //
      // The carried definitions are REPLACED the same way `stats` is: what this entity listed
      // before and no longer carries is dropped, so a rebuilt character cannot leave a stale
      // programme behind in the fold.
      //
      // …but only what THIS entity alone held. Mechanic ids are not always instance-scoped —
      // `monster-adapter.ts` keys a monster's mechanic by its block id, so two ogres share
      // `monster:ogre` — and dropping a definition another seated entity still lists would
      // disarm that creature on any client without a static fallback for it (design §2 D2's
      // "the definitions whose ids the departing entity ALONE lists", read for `sync` too).
      // `withEntity` runs first, so the synced entity's NEW list is the one consulted.
      const carried = conformCarried("sync", op.mechanics);
      if (!carried.ok) return carried.rejected;
      const stale = (state.entities[op.entity.id]?.mechanics ?? []).filter(
        (id) => carried.mechanics[id] === undefined
      );
      const next = dropMechanics(withEntity(state, op.entity), stale);
      return {
        kind: "applied",
        state: { ...next, mechanics: { ...next.mechanics, ...carried.mechanics } },
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
      if (op.automation === "propose-and-confirm") {
        return reject(
          "settings: propose-and-confirm is not built until stage 6 (ADR-0011)"
        );
      }
      return {
        kind: "applied",
        state: {
          ...state,
          settings: {
            ...state.settings,
            revealMonsterHp: op.revealMonsterHp,
            automation: op.automation,
          },
        },
        events,
      };
    }
    case "map": {
      // The background and its grid (design addendum §4). Replacing it leaves fog and positions
      // alone: the DM realigns and re-uploads without losing the table.
      if (op.background !== null && !isMapBackground(op.background))
        return reject("map: malformed background");
      return {
        kind: "applied",
        state: { ...state, map: { ...state.map, background: op.background } },
        events,
      };
    }
    case "fog": {
      const change = op.change;
      const fog = state.map.fog;
      switch (change.kind) {
        case "cover":
          return {
            kind: "applied",
            state: {
              ...state,
              map: { ...state.map, fog: { covered: change.covered, revealed: [] } },
            },
            events,
          };
        case "reveal":
        case "hide": {
          // One representation only: covered-except-revealed. On an uncovered map there is
          // nothing to reveal and no list to subtract from (design addendum §4).
          if (!fog.covered) return reject(`fog: ${change.kind} while fog is off`);
          if (!isMapRect(change.rect))
            return reject(`fog: malformed ${change.kind} rectangle`);
          const revealed =
            change.kind === "reveal"
              ? revealRect(fog.revealed, change.rect)
              : hideRect(fog.revealed, change.rect);
          if (revealed === null) return reject("fog: rectangle budget exhausted");
          return {
            kind: "applied",
            state: { ...state, map: { ...state.map, fog: { covered: true, revealed } } },
            events,
          };
        }
        default:
          return assertNever(change, "fog change");
      }
    }
    default:
      return assertNever(op, "table op");
  }
}
