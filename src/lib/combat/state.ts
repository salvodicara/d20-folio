/**
 * Invariant accessors over the folded state. The reducer validates every id at its entry;
 * a miss here is a bug, so it fails loudly instead of returning `undefined`.
 */
import type { EffectId, EntityId } from "./ids";
import type { Effect, Entity, FoldedState } from "./types";

export function mustEntity(state: FoldedState, id: EntityId): Entity {
  const entity = state.entities[id];
  if (!entity) throw new Error(`combat: invariant — unknown entity ${id}`);
  return entity;
}

export function mustEffect(state: FoldedState, id: EffectId): Effect {
  const effect = state.effects[id];
  if (!effect) throw new Error(`combat: invariant — unknown effect ${id}`);
  return effect;
}
