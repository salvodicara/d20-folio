/**
 * DM overrides: a persisted fact correction (`applyOverride`), plus the direct-override patch
 * for the paths that are persisted facts rather than read-time-derived stats.
 */
import { endEffects } from "./effects";
import type { EffectId, EntityId } from "./ids";
import type { StepResult } from "./intent";
import { isMapCell } from "./map";
import { recomputeRelations } from "./reposition";
import type {
  CombatEvent,
  ConditionId,
  Effect,
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
  // Temporary HP the DM grants or takes away by hand: a pool with NO source effect, so
  // nothing ending later takes it back. 0 (or null) clears the pool rather than leaving an
  // empty one, which is what "temp 0" means everywhere else in the engine.
  if (path === "vitals.tempHp" && (value === null || value === 0)) {
    return { ...entity, vitals: { ...entity.vitals, tempHp: null } };
  }
  if (path === "vitals.tempHp" && typeof value === "number" && Number.isFinite(value)) {
    return {
      ...entity,
      vitals: { ...entity.vitals, tempHp: { amount: Math.max(0, value), source: null } },
    };
  }
  // The maximum is a PROJECTED stat, and `sync` refreshes it — but between syncs it is the
  // number every bar is drawn against, so the DM's correction has to move it. Floored at 1:
  // a maximum of 0 would make every HP ratio meaningless.
  if (path === "stats.maxHp" && typeof value === "number" && Number.isFinite(value)) {
    return {
      ...entity,
      stats: { ...entity.stats, maxHp: Math.max(1, Math.floor(value)) },
    };
  }
  // A placement (stage 5): the DM putting a token on the map, a controller placing their own
  // before turns begin, or any move on a `log-only` table. `null` takes the token off the map.
  // The movement budget is neither consulted nor spent — this is not the `move` step.
  if (path === "position") {
    if (value === null) return { ...entity, position: null };
    if (isMapCell(value)) return { ...entity, position: { x: value.x, y: value.y } };
    return entity;
  }
  if (
    (path === "reveal.token" || path === "reveal.block" || path === "reveal.hp") &&
    typeof value === "boolean"
  ) {
    const flag = path.slice("reveal.".length) as keyof Entity["reveal"];
    return { ...entity, reveal: { ...entity.reveal, [flag]: value } };
  }
  return entity;
}

const CONDITIONS = new Set<ConditionId>([
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
]);

/** The `condition` override's value: which condition, and whether it is on or off. Anything
 *  else — an unknown id, a malformed record — reads as "no instruction". */
interface ConditionPatch {
  readonly condition: ConditionId;
  readonly active: boolean;
}

function readConditionPatch(value: unknown): ConditionPatch | null {
  if (typeof value !== "object" || value === null) return null;
  const { condition, active } = value as Record<string, unknown>;
  if (typeof condition !== "string" || typeof active !== "boolean") return null;
  if (!(CONDITIONS as ReadonlySet<string>).has(condition)) return null;
  return { condition: condition as ConditionId, active };
}

function conditionEffectsOn(
  state: FoldedState,
  entity: EntityId,
  condition: ConditionId
): EffectId[] {
  return Object.values(state.effects)
    .filter(
      (effect) =>
        effect.target === entity &&
        effect.payload.kind === "condition" &&
        effect.payload.condition === condition
    )
    .map((effect) => effect.id);
}

/**
 * The DM conditioning a creature by hand (component 18). A condition is not a field — it is an
 * `Effect` — so this path starts one with a `manual` lifetime, or ends every effect of that
 * condition on the entity. Starting one that is already there is a no-op rather than a second
 * stacked effect, and a creature immune to the condition is left alone exactly as the
 * `condition` STEP leaves it (`intent.ts`): the DM's last word is over outcomes, and an
 * immunity is a fact of the creature, not an outcome.
 */
function applyConditionOverride(
  state: FoldedState,
  action: OverrideAction,
  patch: ConditionPatch,
  events: CombatEvent[]
): FoldedState {
  const existing = conditionEffectsOn(state, action.entity, patch.condition);
  if (!patch.active) {
    if (existing.length === 0) return state;
    const ended = endEffects(state, existing);
    events.push(...ended.events);
    return ended.state;
  }
  if (existing.length > 0) return state;
  const entity = state.entities[action.entity];
  if (!entity || entity.stats.conditionImmunities.includes(patch.condition)) return state;
  const id: EffectId = `effect-${state.nextOrdinal}`;
  const effect: Effect = {
    id,
    source: {
      entity: action.entity,
      // The DM's hand, not a mechanic: the path itself is the provenance, and the
      // override's own audit record carries the reason and the author.
      mechanic: "override:condition",
      action: action.id,
      castLevel: null,
    },
    target: action.entity,
    payload: { kind: "condition", condition: patch.condition },
    lifetime: { kind: "manual" },
    concentration: false,
  };
  return {
    ...state,
    effects: { ...state.effects, [id]: effect },
    nextOrdinal: state.nextOrdinal + 1,
  };
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
  if (action.path === "condition") {
    const patch = readConditionPatch(action.value);
    if (patch) next = applyConditionOverride(next, action, patch, events);
  }
  // A placement recomputes the derived `adjacent`/`range` facts and opens NO opportunity-attack
  // window: forced movement, not a departure (design addendum §4).
  if (action.path === "position") next = recomputeRelations(next, action.entity).state;
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
