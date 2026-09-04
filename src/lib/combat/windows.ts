/**
 * Reaction windows: who may react to an event, decided from data.
 *
 * An entity subscribes to an event when one of its mechanics carries a program whose trigger is
 * that event with `window: true`, and it still has its reaction. The reducer opens a window only
 * when at least one subscriber exists, so the common case stays one tap.
 */
import type { Catalogue } from "./catalogue";
import { mechanicOf } from "./catalogue";
import type { EntityId } from "./ids";
import type { EventSelector } from "./mechanic";
import type { CombatEvent, FoldedState } from "./types";

function matches(
  event: CombatEvent,
  selector: EventSelector,
  subscriber: EntityId
): boolean {
  switch (event.kind) {
    case "attack-declared":
      return (
        selector.kind === "attack-declared" &&
        (selector.target === "any" || event.target === subscriber)
      );
    case "entity-left-reach":
      return selector.kind === "entity-left-reach" && event.from === subscriber;
    case "hp-zero":
      return selector.kind === "hp-zero" && selector.of === "any";
    default:
      return false;
  }
}

/** The entity an event is "about", bound to `$event.entity` inside a reacting program. */
export function eventEntity(event: CombatEvent): EntityId | null {
  switch (event.kind) {
    case "attack-declared":
      return event.attacker;
    case "entity-left-reach":
      return event.entity;
    case "hp-zero":
    case "damage-taken":
    case "turn-start":
    case "turn-end":
      return event.entity;
    default:
      return null;
  }
}

export function subscribersFor(
  state: FoldedState,
  catalogue: Catalogue,
  event: CombatEvent
): EntityId[] {
  const actor = eventEntity(event);
  const out: EntityId[] = [];
  for (const entity of Object.values(state.entities)) {
    if (entity.id === actor) continue;
    if (entity.vitals.life !== "alive" || entity.turn.reaction >= 1) continue;
    const subscribed = entity.mechanics.some((id) =>
      (mechanicOf(state, catalogue, id)?.active ?? []).some(
        (program) =>
          program.trigger.kind === "event" &&
          program.trigger.window &&
          matches(event, program.trigger.event, entity.id)
      )
    );
    if (subscribed) out.push(entity.id);
  }
  // Sorted, not enumeration-ordered: this list is persisted as `windows[].eligible`, and
  // compaction rewrites the document through the codec, which re-sorts every record's keys.
  // Sorting here keeps a pre- and a post-compaction fold deep-equal, not merely equal up to
  // this array's order.
  return out.sort();
}
