/**
 * Repositioning: recomputing `adjacent`/`range` relations after a move, opening an
 * opportunity-attack window when a creature leaves another's reach, and the declared tactical
 * facts (`applyDeclare`) that share that same window-opening path.
 */
import type { Catalogue } from "./catalogue";
import type { EntityId } from "./ids";
import type { StepResult } from "./intent";
import { distanceFt, rangeBand, REACH_FT } from "./position";
import { mustEntity } from "./state";
import type {
  CombatEvent,
  DeclareAction,
  FoldedState,
  ReactionWindow,
  Relation,
} from "./types";
import { subscribersFor } from "./windows";

/** Opens an opportunity-attack window when `mover` has just left `from`'s reach; a no-op if
 *  nothing subscribes. Shared by `applyDeclare` (a manual departure) and the `move` step (a real
 *  one) — design doc §2.4 of the stage-2 addendum. */
export function openLeftReachWindow(
  state: FoldedState,
  events: CombatEvent[],
  mover: EntityId,
  from: EntityId,
  causedBy: string,
  catalogue: Catalogue
): FoldedState {
  const event: CombatEvent = { kind: "entity-left-reach", entity: mover, from };
  events.push(event);
  const eligible = subscribersFor(state, catalogue, event);
  if (eligible.length === 0) return state;
  const window: ReactionWindow = {
    id: `window-${state.nextOrdinal}`,
    event,
    eligible,
    declared: causedBy,
  };
  return {
    ...state,
    nextOrdinal: state.nextOrdinal + 1,
    windows: [...state.windows, window],
  };
}

/** Recomputes `adjacent`/`range` between `mover` (already repositioned in `state`) and every
 *  other positioned entity, and reports which entities' reach the mover has just left. Opens no
 *  window: a placement (`override position`) is forced movement with no opportunity attack, so it
 *  calls this alone; the `move` step opens the windows through `repositionRelations`. A mover
 *  whose position is now `null` simply loses its derived relations. `engaged` is untouched — it
 *  stays a purely declared, sticky fact (design doc §2.3): a table's melee lock, not a
 *  raw-distance projection. */
export function recomputeRelations(
  state: FoldedState,
  mover: EntityId
): { readonly state: FoldedState; readonly left: readonly EntityId[] } {
  const at = mustEntity(state, mover).position;
  const wasAdjacentTo = new Set(
    state.relations
      .filter(
        (r): r is Extract<Relation, { kind: "adjacent" }> =>
          r.kind === "adjacent" && (r.a === mover || r.b === mover)
      )
      .map((r) => (r.a === mover ? r.b : r.a))
  );
  const relations = state.relations.filter(
    (r) =>
      !((r.kind === "adjacent" || r.kind === "range") && (r.a === mover || r.b === mover))
  );
  if (at === null) return { state: { ...state, relations }, left: [] };
  const left: EntityId[] = [];
  // Sorted by id, not enumeration order: a live fold holds insertion-ordered entity keys while a
  // checkpoint parsed by `exact-schema` holds them canonically sorted, and "a compacted document
  // folds to exactly the state the uncompacted one folds to" must hold for `relations` too.
  const others = Object.values(state.entities).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  for (const other of others) {
    if (other.id === mover || other.position === null) continue;
    const feet = distanceFt(at, other.position);
    if (feet <= REACH_FT) relations.push({ kind: "adjacent", a: mover, b: other.id });
    const band = rangeBand(feet);
    if (band !== "out") relations.push({ kind: "range", a: mover, b: other.id, band });
    if (feet > REACH_FT && wasAdjacentTo.has(other.id)) left.push(other.id);
  }
  return { state: { ...state, relations }, left };
}

/** `recomputeRelations`, then an opportunity-attack window for every reach the mover left —
 *  the `move` step's path (a real departure). */
export function repositionRelations(
  state: FoldedState,
  mover: EntityId,
  events: CombatEvent[],
  causedBy: string,
  catalogue: Catalogue
): FoldedState {
  const recomputed = recomputeRelations(state, mover);
  let next = recomputed.state;
  for (const from of recomputed.left) {
    next = openLeftReachWindow(next, events, mover, from, causedBy, catalogue);
  }
  return next;
}

/** A declared tactical fact; leaving reach may open an opportunity-attack window. */
export function applyDeclare(
  state: FoldedState,
  action: DeclareAction,
  catalogue: Catalogue
): StepResult {
  const same = (a: unknown, b: unknown): boolean =>
    JSON.stringify(a) === JSON.stringify(b);
  const kept = state.relations.filter((r) => !same(r, action.relation));
  const relations = action.remove ? kept : [...kept, action.relation];
  let next: FoldedState = { ...state, relations };
  const events: CombatEvent[] = [];
  const relation = action.relation;
  if (
    action.remove &&
    action.mover !== null &&
    (relation.kind === "adjacent" || relation.kind === "engaged")
  ) {
    const from = relation.a === action.mover ? relation.b : relation.a;
    next = openLeftReachWindow(next, events, action.mover, from, action.id, catalogue);
  }
  return {
    kind: "applied",
    state: next,
    receipt: {
      action: action.id,
      outcome: "applied",
      paid: [],
      events,
      summary: ["declare"],
    },
  };
}
