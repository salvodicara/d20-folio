/**
 * Effect lifecycle helpers shared by table operations and intents: ending an effect ends its
 * dependents (source-end lifetimes, marks, temporary HP it granted) and, when it was the
 * concentration effect of its caster, every other effect held by that concentration.
 */
import type { EffectId, EntityId } from "./ids";
import type { CombatEvent, Effect, Entity, FoldedState, Lifetime } from "./types";

export interface EndResult {
  readonly state: FoldedState;
  readonly events: readonly CombatEvent[];
}

/** Ends the given effects and everything that depends on them; idempotent for unknown ids. */
export function endEffects(state: FoldedState, ids: readonly EffectId[]): EndResult {
  const toEnd = new Set<EffectId>();
  const queue = [...ids];
  const events: CombatEvent[] = [];
  while (queue.length > 0) {
    const id = queue.pop() as EffectId;
    const effect = state.effects[id];
    if (!effect || toEnd.has(id)) continue;
    toEnd.add(id);
    // dependents: source-end lifetimes
    for (const other of Object.values(state.effects)) {
      if (other.lifetime.kind === "source-end" && other.lifetime.effect === id)
        queue.push(other.id);
    }
    // concentration group: every concentration effect of the same source action
    if (effect.concentration) {
      for (const other of Object.values(state.effects)) {
        if (
          other.concentration &&
          other.source.entity === effect.source.entity &&
          other.source.action === effect.source.action
        ) {
          queue.push(other.id);
        }
      }
    }
  }
  if (toEnd.size === 0) return { state, events };

  const effects: Record<EffectId, Effect> = {};
  for (const [id, effect] of Object.entries(state.effects))
    if (!toEnd.has(id)) effects[id] = effect;
  const relations = state.relations.filter(
    (relation) =>
      !(
        (relation.kind === "mark" || relation.kind === "aura-member") &&
        toEnd.has(relation.effect)
      )
  );
  const entities: Record<EntityId, Entity> = { ...state.entities };
  for (const id of toEnd) {
    const ended = state.effects[id];
    events.push({ kind: "effect-ended", effect: id });
    for (const [entityId, entity] of Object.entries(entities)) {
      let next = entity;
      if (next.concentration === id) {
        next = { ...next, concentration: null };
        events.push({ kind: "concentration-ended", entity: entityId, effect: id });
      }
      if (next.vitals.tempHp?.source === id) {
        next = { ...next, vitals: { ...next.vitals, tempHp: null } };
      }
      if (next !== entity) entities[entityId] = next;
    }
    void ended;
  }
  return { state: { ...state, effects, relations, entities }, events };
}

/** Effects whose lifetime is due at the given boundary. */
export function dueAt(
  state: FoldedState,
  predicate: (lifetime: Lifetime, effect: Effect) => boolean
): EffectId[] {
  return Object.values(state.effects)
    .filter((effect) => predicate(effect.lifetime, effect))
    .map((effect) => effect.id);
}
