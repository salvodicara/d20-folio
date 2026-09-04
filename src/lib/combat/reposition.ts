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
 *  other positioned entity, opening an opportunity-attack window for any pair that was
 *  `adjacent` and no longer is. `engaged` is untouched — it stays a purely declared, sticky fact
 *  (design doc §2.3): a table's melee lock, not a raw-distance projection. */
export function repositionRelations(
  state: FoldedState,
  mover: EntityId,
  events: CombatEvent[],
  causedBy: string,
  catalogue: Catalogue
): FoldedState {
  const at = mustEntity(state, mover).position;
  if (at === null) return state;
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
  let next: FoldedState = { ...state, relations };
  for (const other of Object.values(state.entities)) {
    if (other.id === mover || other.position === null) continue;
    const feet = distanceFt(at, other.position);
    const added: Relation[] = [];
    if (feet <= REACH_FT) added.push({ kind: "adjacent", a: mover, b: other.id });
    const band = rangeBand(feet);
    if (band !== "out") added.push({ kind: "range", a: mover, b: other.id, band });
    next = { ...next, relations: [...next.relations, ...added] };
    if (feet > REACH_FT && wasAdjacentTo.has(other.id)) {
      next = openLeftReachWindow(next, events, mover, other.id, causedBy, catalogue);
    }
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
