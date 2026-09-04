/**
 * DM overrides: a persisted fact correction (`applyOverride`), plus the direct-override patch
 * for the paths that are persisted facts rather than read-time-derived stats.
 */
import { endEffects } from "./effects";
import type { EntityId } from "./ids";
import type { StepResult } from "./intent";
import type {
  CombatEvent,
  Entity,
  FoldedState,
  LifeState,
  OverrideAction,
  Rejection,
} from "./types";

function rejected(rejection: Rejection): StepResult {
  return { kind: "rejected", rejection };
}

/** Ends the entity's held concentration when it is at 0 HP or dead — the same tail a
 *  0-HP-crossing hit has (`deliverDamage`), shared here so a DM's direct HP override to 0
 *  produces it too. Idempotent: an entity with no held concentration, or above 0 HP and
 *  alive, is left alone. Pushes `endEffects`' events onto the caller's `events` accumulator. */
export function settleZeroHp(
  state: FoldedState,
  entity: EntityId,
  events: CombatEvent[]
): FoldedState {
  const current = state.entities[entity];
  if (!current) return state;
  if (current.vitals.hp > 0 && current.vitals.life !== "dead") return state;
  const held = current.concentration;
  if (held === null) return state;
  const ended = endEffects(state, [held]);
  events.push(...ended.events);
  return ended.state;
}

const LIFE_STATES = new Set<LifeState>(["alive", "dying", "stable", "dead"]);

/** Widened to `ReadonlySet<string>` so an arbitrary persisted string is *tested*, not asserted
 *  into the union before the test; the predicate is the only narrowing. */
export function isLifeState(value: string): value is LifeState {
  return (LIFE_STATES as ReadonlySet<string>).has(value);
}

/** Paths that are persisted facts, not read-time-derived stats (like `stats.ac`): an override
 *  here directly corrects the fact, the same way a later `declare` replaces a relation, rather
 *  than layering on top of a formula consulted at read time. An HP override above zero revives
 *  a dying/stable creature exactly as `applyHealing` does; a `dead` creature is not revived by
 *  HP alone — the DM overrides `vitals.life` for that. HP is clamped at 0; no upper bound. Dropping a creature
 *  to 0 by hand means the same thing as dropping it there by damage, so it takes `applyDamage`'s
 *  0-HP rule — `dying` for a PC, `dead` for everything else — and leaves the death saves alone;
 *  a creature already at 0 is not re-downed. */
export function patchDirectOverride(
  entity: Entity,
  path: string,
  value: unknown
): Entity {
  if (path === "vitals.hp" && typeof value === "number" && Number.isFinite(value)) {
    const { life, deathSaves } = entity.vitals;
    const hp = Math.max(0, value);
    const revived = hp > 0 && (life === "dying" || life === "stable");
    const downed = hp === 0 && entity.vitals.hp > 0;
    return {
      ...entity,
      vitals: {
        ...entity.vitals,
        hp,
        life: revived
          ? "alive"
          : downed
            ? entity.kind === "pc"
              ? "dying"
              : "dead"
            : life,
        deathSaves: revived ? { successes: 0, failures: 0 } : deathSaves,
      },
    };
  }
  if (path === "vitals.life" && typeof value === "string" && isLifeState(value)) {
    return { ...entity, vitals: { ...entity.vitals, life: value } };
  }
  return entity;
}

export function applyOverride(state: FoldedState, action: OverrideAction): StepResult {
  const entity = state.entities[action.entity];
  if (!entity) return rejected({ reason: "unknown-entity", entity: action.entity });
  const recorded: Entity = {
    ...entity,
    overrides: {
      ...entity.overrides,
      [action.path]: { value: action.value, reason: action.reason, by: action.by },
    },
  };
  const patched = patchDirectOverride(recorded, action.path, action.value);
  let next: FoldedState = {
    ...state,
    entities: { ...state.entities, [action.entity]: patched },
  };
  const events: CombatEvent[] = [];
  // A DM override that drops HP from above zero to zero means the same thing as a hit that
  // does it (deliverDamage): no damage-taken (there was none), but the same 0-HP tail.
  if (action.path === "vitals.hp" && entity.vitals.hp > 0 && patched.vitals.hp === 0) {
    events.push({ kind: "hp-zero", entity: action.entity });
    next = settleZeroHp(next, action.entity, events);
  }
  // A DM override that declares the entity dead outright (`vitals.life` → "dead") ends held
  // concentration the same way, even though HP may still be above 0 — so no `hp-zero` here.
  if (
    action.path === "vitals.life" &&
    entity.vitals.life !== "dead" &&
    patched.vitals.life === "dead"
  ) {
    next = settleZeroHp(next, action.entity, events);
  }
  return {
    kind: "applied",
    state: next,
    receipt: {
      action: action.id,
      outcome: "applied",
      paid: [],
      events,
      summary: ["override"],
    },
  };
}
