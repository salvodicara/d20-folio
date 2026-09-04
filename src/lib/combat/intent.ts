/**
 * Intents: a program of a mechanic, invoked by an entity, with the table's answers.
 *
 * Costs are compiled and paid before any effect; an unaffordable intent is rejected and
 * nothing changes. Every caster-side consequence (effects, concentration, receipt) is a
 * function of the resolved per-target outcomes, so a negated cast leaves only its payment.
 * A declared attack that another creature may react to is held in a reaction window and
 * resolved later against the state the reactions produced.
 */
import { applyDamage, applyHealing, type DamagePacket } from "./damage";
import { endEffects } from "./effects";
import { assertNever, type EffectId, type EntityId } from "./ids";
import type { Catalogue } from "./catalogue";
import { programOf } from "./catalogue";
import type { AreaShapeSpec, LifetimeSpec, Program, Step } from "./mechanic";
import {
  areaMembership,
  distanceFt,
  rangeBand,
  REACH_FT,
  type AreaShape,
} from "./position";
import { bind, evalExpr, evalPredicate, type EvalContext } from "./predicates";
import { mustEntity } from "./state";
import type {
  Action,
  CombatEvent,
  Effect,
  Entity,
  FoldedState,
  Lifetime,
  LifeState,
  Outcome,
  PaymentChoice,
  PendingCheck,
  Position,
  ReactionWindow,
  Receipt,
  Rejection,
  Relation,
  TurnLedger,
} from "./types";
import { eventEntity, subscribersFor } from "./windows";

export type IntentAction = Extract<Action, { kind: "intent" }>;
export type CheckAction = Extract<Action, { kind: "check" }>;
export type DeclareAction = Extract<Action, { kind: "declare" }>;
export type OverrideAction = Extract<Action, { kind: "override" }>;
export type ResolveAction = Extract<Action, { kind: "resolve" }>;

export type StepResult =
  | { readonly kind: "applied"; readonly state: FoldedState; readonly receipt: Receipt }
  | { readonly kind: "rejected"; readonly rejection: Rejection };

function rejected(rejection: Rejection): StepResult {
  return { kind: "rejected", rejection };
}

// ── Costs ───────────────────────────────────────────────────────────────────

interface Payment {
  readonly ledger: TurnLedger;
  readonly resources: Entity["resources"];
  readonly paid: string[];
  readonly castLevel: number | null;
  readonly concentration: boolean;
}

function payCosts(
  entity: Entity,
  program: Program,
  action: IntentAction
): Payment | Rejection {
  let ledger = entity.turn;
  let resources = entity.resources;
  const paid: string[] = [];
  let castLevel: number | null = null;
  let concentration = false;
  for (const cost of program.cost ?? []) {
    switch (cost.kind) {
      case "turn": {
        const claim = cost.claim;
        switch (claim) {
          case "attack": {
            if (ledger.attacksUsed === 0) {
              if (ledger.action >= 1)
                return { reason: "unaffordable", cost: "turn:attack" };
              ledger = { ...ledger, action: 1 };
            }
            if (ledger.attacksUsed >= entity.stats.attacksPerAction) {
              return { reason: "unaffordable", cost: "turn:attack" };
            }
            ledger = { ...ledger, attacksUsed: ledger.attacksUsed + 1 };
            break;
          }
          case "action":
            if (ledger.action >= 1)
              return { reason: "unaffordable", cost: "turn:action" };
            ledger = { ...ledger, action: 1 };
            break;
          case "bonus":
            if (ledger.bonus >= 1) return { reason: "unaffordable", cost: "turn:bonus" };
            ledger = { ...ledger, bonus: 1 };
            break;
          case "reaction":
            if (ledger.reaction >= 1)
              return { reason: "unaffordable", cost: "turn:reaction" };
            ledger = { ...ledger, reaction: 1 };
            break;
          case "free":
            break;
          default:
            return assertNever(claim, "turn claim");
        }
        paid.push(`turn:${claim}`);
        break;
      }
      case "slot": {
        const choice = action.payment.find(
          (p): p is Extract<PaymentChoice, { kind: "slot" }> => p.kind === "slot"
        );
        const level = choice ? choice.level : cost.level;
        const pool = choice ? choice.pool : "standard";
        if (level < cost.level || (!cost.upcast && level !== cost.level)) {
          return { reason: "unaffordable", cost: `slot:${cost.level}` };
        }
        const key = pool === "pact" ? `pact-${level}` : `slot-${level}`;
        const slot = resources[key];
        if (!slot || slot.current <= 0)
          return { reason: "unaffordable", cost: `slot:${cost.level}` };
        resources = { ...resources, [key]: { ...slot, current: slot.current - 1 } };
        castLevel = level;
        paid.push(`slot:${level}`);
        break;
      }
      case "resource": {
        const pool = resources[cost.id];
        if (!pool || pool.current < cost.amount) {
          return { reason: "unaffordable", cost: `resource:${cost.id}` };
        }
        resources = {
          ...resources,
          [cost.id]: { ...pool, current: pool.current - cost.amount },
        };
        paid.push(`resource:${cost.id}`);
        break;
      }
      case "concentration":
        concentration = true;
        break;
      default:
        return assertNever(cost, "cost kind");
    }
  }
  return { ledger, resources, paid, castLevel, concentration };
}

// ── Lifetimes ───────────────────────────────────────────────────────────────

function resolveLifetime(
  spec: LifetimeSpec,
  state: FoldedState,
  ctx: EvalContext,
  caster: Entity,
  castLevel: number | null
): Lifetime {
  switch (spec.kind) {
    case "manual":
      return { kind: "manual" };
    case "rounds":
      return { kind: "rounds", remaining: spec.remaining };
    case "seconds":
      return {
        kind: "seconds",
        remaining:
          typeof spec.remaining === "number"
            ? spec.remaining
            : evalExpr(spec.remaining, caster, castLevel),
      };
    case "rest":
      return {
        kind: "rest",
        rest: spec.rest,
        minimumOrdinal: state.clock.restOrdinal + 1,
      };
    case "turn-edge": {
      const entity = bind(spec.entity, ctx) ?? ctx.self;
      // "until the start of your next turn": later this round if your turn is still to come,
      // otherwise next round. "until the end of your turn": this round if your turn is now or
      // still to come, otherwise next round.
      const index = state.clock.order.indexOf(entity);
      const currentIndex =
        state.clock.current === null
          ? -1
          : state.clock.order.indexOf(state.clock.current);
      const laterThisRound = index > currentIndex;
      const round =
        spec.edge === "start"
          ? laterThisRound
            ? state.clock.round
            : state.clock.round + 1
          : laterThisRound || index === currentIndex
            ? state.clock.round
            : state.clock.round + 1;
      return { kind: "turn-edge", entity, edge: spec.edge, round };
    }
    default:
      return assertNever(spec, "lifetime spec");
  }
}

// ── Defense derivation ──────────────────────────────────────────────────────

export function effectiveAc(
  state: FoldedState,
  target: EntityId,
  attacker: EntityId | null
): number {
  const entity = mustEntity(state, target);
  let ac = entity.stats.ac;
  for (const effect of Object.values(state.effects)) {
    if (effect.target === target && effect.payload.kind === "standing") {
      ac += effect.payload.facts.acBonus ?? 0;
    }
  }
  for (const relation of state.relations) {
    if (
      relation.kind === "cover" &&
      relation.target === target &&
      (relation.from === null || relation.from === attacker)
    ) {
      if (relation.degree === "half") ac += 2;
      if (relation.degree === "three-quarters") ac += 5;
      if (relation.degree === "total") ac += 1000;
    }
  }
  const override = entity.overrides["stats.ac"];
  if (override && typeof override.value === "number") ac = override.value;
  return ac;
}

// ── Damage delivery (with concentration checks) ─────────────────────────────

function deliverDamage(
  state: FoldedState,
  target: EntityId,
  packets: readonly DamagePacket[],
  actionId: string,
  events: CombatEvent[]
): FoldedState {
  const before = mustEntity(state, target);
  const result = applyDamage(before, packets, {});
  let next: FoldedState = {
    ...state,
    entities: { ...state.entities, [target]: result.entity },
  };
  if (result.taken > 0)
    events.push({ kind: "damage-taken", entity: target, amount: result.taken });
  if (result.hpZero) events.push({ kind: "hp-zero", entity: target });
  if (
    result.taken > 0 &&
    result.entity.concentration !== null &&
    result.entity.vitals.hp > 0
  ) {
    const check: PendingCheck = {
      id: `check-${next.nextOrdinal}`,
      entity: target,
      kind: "concentration",
      dc: Math.min(30, Math.max(10, Math.floor(result.taken / 2))),
      cause: actionId,
    };
    next = {
      ...next,
      checks: [...next.checks, check],
      nextOrdinal: next.nextOrdinal + 1,
    };
  }
  if (result.hpZero || result.entity.vitals.life === "dead") {
    const held = result.entity.concentration;
    if (held !== null) {
      const ended = endEffects(next, [held]);
      next = ended.state;
      events.push(...ended.events);
    }
  }
  return next;
}

/** A numeric answer, given directly or as the total of an accepted `roll` action. Total like
 *  `answerPosition`: a persisted log may carry a malformed answer (`null` included, whose
 *  `typeof` is `"object"`), and this helper reports it missing rather than throwing. */
function answerNumber(
  state: FoldedState,
  answers: IntentAction["answers"],
  key: string
): number | null {
  // `unknown`, not `Answer`: a persisted log may carry an answer the union does not describe.
  const value: unknown = answers[key];
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "roll" in value) {
    return typeof value.roll === "string"
      ? (state.rolls[value.roll]?.total ?? null)
      : null;
  }
  return null;
}

/** A `position`-kind answer, given directly as `{x,y}` (never as a roll reference). */
function answerPosition(answers: IntentAction["answers"], key: string): Position | null {
  // `unknown`, not `Answer`: a persisted log may carry a malformed answer, and this helper
  // rejects it rather than throwing (the shape the `move` step has always checked).
  const value: unknown = answers[key];
  return typeof value === "object" &&
    value !== null &&
    "x" in value &&
    "y" in value &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y)
    ? { x: value.x, y: value.y }
    : null;
}

type AreaResolution =
  | { readonly kind: "shape"; readonly shape: AreaShape }
  | { readonly kind: "missing"; readonly input: string };

/** An authored `AreaShapeSpec` bound to the caster's `position` answers. */
function areaShapeFrom(
  spec: AreaShapeSpec,
  answers: IntentAction["answers"]
): AreaResolution {
  const origin = answerPosition(answers, spec.origin);
  if (origin === null) return { kind: "missing", input: spec.origin };
  switch (spec.kind) {
    case "sphere":
    case "cylinder":
      return {
        kind: "shape",
        shape: { kind: spec.kind, origin, radiusFt: spec.radiusFt },
      };
    case "cube":
      return { kind: "shape", shape: { kind: "cube", origin, sizeFt: spec.sizeFt } };
    case "cone":
    case "line": {
      const aim = answerPosition(answers, spec.aim);
      if (aim === null) return { kind: "missing", input: spec.aim };
      return {
        kind: "shape",
        shape:
          spec.kind === "cone"
            ? { kind: "cone", origin, aim, lengthFt: spec.lengthFt }
            : {
                kind: "line",
                origin,
                aim,
                lengthFt: spec.lengthFt,
                widthFt: spec.widthFt,
              },
      };
    }
    default:
      return assertNever(spec, "area shape spec");
  }
}

// ── The program runner ──────────────────────────────────────────────────────

interface RunOutcome {
  readonly kind: "ran";
  readonly state: FoldedState;
  readonly created: EffectId[];
  readonly dealt: number;
  readonly outcomes: Outcome[];
}

interface RunHeld {
  readonly kind: "held";
  readonly event: CombatEvent;
  readonly eligible: EntityId[];
}

interface RunOptions {
  readonly catalogue: Catalogue;
  readonly hold: boolean; // may this run open a reaction window?
  readonly eventEntity: EntityId | null;
}

function runSteps(
  state: FoldedState,
  program: Program,
  action: IntentAction,
  target: EntityId | null,
  castLevel: number | null,
  events: CombatEvent[],
  options: RunOptions
): RunOutcome | RunHeld | Rejection {
  let next = state;
  const created: EffectId[] = [];
  const outcomes: Outcome[] = [];
  let dealt = 0;
  let halve = false;
  let ctx: EvalContext = {
    self: action.entity,
    target,
    eventEntity: options.eventEntity,
    outcome: null,
    answers: action.answers,
  };
  const caster = mustEntity(state, action.entity);

  for (const step of program.steps) {
    if (step.when && !evalPredicate(step.when, next, ctx)) continue;
    const result = runStep(step);
    if ("reason" in result) return result;
    if ("held" in result) return result.held;
    if (result.stop) break;
  }
  return { kind: "ran", state: next, created, dealt, outcomes };

  function runStep(step: Step): { stop: boolean } | { held: RunHeld } | Rejection {
    switch (step.kind) {
      case "attack": {
        if (target === null) return { reason: "invalid-target", entity: "" };
        const face = answerNumber(state, action.answers, step.roll);
        if (face === null) return { reason: "missing-answer", input: step.roll };
        const declared: CombatEvent = {
          kind: "attack-declared",
          attacker: action.entity,
          target,
          action: action.id,
        };
        if (options.hold) {
          const eligible = subscribersFor(next, options.catalogue, declared);
          if (eligible.length > 0)
            return { held: { kind: "held", event: declared, eligible } };
        }
        events.push(declared);
        const bonus = evalExpr(step.bonus, caster, castLevel);
        const ac = effectiveAc(next, target, action.entity);
        let outcome: Outcome =
          face === 20
            ? "crit"
            : face === 1
              ? "miss"
              : face + bonus >= ac
                ? "hit"
                : "miss";
        if (ac >= 1000) outcome = "miss";
        outcomes.push(outcome);
        ctx = { ...ctx, outcome };
        events.push({
          kind: "attack-resolved",
          attacker: action.entity,
          target,
          outcome,
        });
        if (outcome === "miss") return { stop: true };
        const packets: DamagePacket[] = [];
        for (const part of step.damage) {
          const amount = answerNumber(state, action.answers, part.dice);
          if (amount === null) return { reason: "missing-answer", input: part.dice };
          packets.push({ amount, type: part.type });
        }
        for (const relation of next.relations) {
          if (
            relation.kind !== "mark" ||
            relation.by !== action.entity ||
            relation.on !== target
          ) {
            continue;
          }
          const mark = next.effects[relation.effect];
          if (!mark || mark.payload.kind !== "mark") continue;
          for (const rider of mark.payload.riders) {
            if (rider.on !== "weapon-hit" && rider.on !== "any-hit") continue;
            const key = `rider:${mark.id}`;
            const amount = answerNumber(state, action.answers, key);
            if (amount === null) return { reason: "missing-answer", input: key };
            packets.push({ amount, type: rider.type });
          }
        }
        const hpBefore = mustEntity(next, target).vitals.hp;
        next = deliverDamage(next, target, packets, action.id, events);
        dealt += hpBefore - mustEntity(next, target).vitals.hp;
        return { stop: false };
      }
      case "save": {
        if (target === null) return { reason: "invalid-target", entity: "" };
        const perTarget = program.inputs?.some(
          (i) => i.id === step.roll && i.kind === "d20" && i.perTarget === true
        );
        const key = perTarget ? `${step.roll}:${target}` : step.roll;
        const face = answerNumber(state, action.answers, key);
        if (face === null) return { reason: "missing-answer", input: key };
        const dc =
          step.dc === "spell"
            ? (caster.stats.spellSaveDc ?? 0)
            : evalExpr(step.dc, caster, castLevel);
        const total = face + mustEntity(next, target).stats.saves[step.ability];
        const success = total >= dc;
        const outcome: Outcome = success ? "save-success" : "save-fail";
        outcomes.push(outcome);
        ctx = { ...ctx, outcome };
        if (success && step.onSuccess === "negate") return { stop: true };
        if (success && step.onSuccess === "half") halve = true;
        return { stop: false };
      }
      case "damage": {
        const to = bind(step.to, ctx);
        if (to === null) return { reason: "invalid-target", entity: "" };
        const packets: DamagePacket[] = [];
        for (const part of step.parts) {
          const amount = answerNumber(state, action.answers, part.dice);
          if (amount === null) return { reason: "missing-answer", input: part.dice };
          packets.push({
            amount: halve ? Math.floor(amount / 2) : amount,
            type: part.type,
          });
        }
        const hpBefore = mustEntity(next, to).vitals.hp;
        next = deliverDamage(next, to, packets, action.id, events);
        dealt += hpBefore - mustEntity(next, to).vitals.hp;
        return { stop: false };
      }
      case "heal": {
        const to = bind(step.to, ctx);
        if (to === null) return { reason: "invalid-target", entity: "" };
        const amount = evalExpr(step.amount, caster, castLevel);
        next = {
          ...next,
          entities: {
            ...next.entities,
            [to]: applyHealing(mustEntity(next, to), amount),
          },
        };
        return { stop: false };
      }
      case "effect-start": {
        const to = bind(step.effect.to, ctx);
        if (to === null) return { reason: "invalid-target", entity: "" };
        const id: EffectId = `effect-${next.nextOrdinal}`;
        const effect: Effect = {
          id,
          source: {
            entity: action.entity,
            mechanic: action.mechanic,
            action: action.id,
            castLevel,
          },
          target: to,
          payload:
            step.effect.kind === "mark"
              ? {
                  kind: "mark",
                  riders: step.effect.riders ?? [],
                  advantage: step.effect.advantage ?? false,
                }
              : { kind: "standing", facts: { acBonus: step.effect.acBonus } },
          lifetime: resolveLifetime(step.effect.lifetime, next, ctx, caster, castLevel),
          concentration: step.effect.concentration ?? false,
        };
        next = {
          ...next,
          effects: { ...next.effects, [id]: effect },
          nextOrdinal: next.nextOrdinal + 1,
          relations:
            step.effect.kind === "mark"
              ? [
                  ...next.relations,
                  { kind: "mark", effect: id, by: action.entity, on: to },
                ]
              : next.relations,
        };
        created.push(id);
        return { stop: false };
      }
      case "condition": {
        const to = bind(step.to, ctx);
        if (to === null) return { reason: "invalid-target", entity: "" };
        if (mustEntity(next, to).stats.conditionImmunities.includes(step.condition)) {
          return { stop: false };
        }
        const id: EffectId = `effect-${next.nextOrdinal}`;
        const effect: Effect = {
          id,
          source: {
            entity: action.entity,
            mechanic: action.mechanic,
            action: action.id,
            castLevel,
          },
          target: to,
          payload: { kind: "condition", condition: step.condition },
          lifetime: resolveLifetime(step.lifetime, next, ctx, caster, castLevel),
          concentration: step.concentration ?? false,
        };
        next = {
          ...next,
          effects: { ...next.effects, [id]: effect },
          nextOrdinal: next.nextOrdinal + 1,
        };
        created.push(id);
        return { stop: false };
      }
      case "move-mark": {
        const from = bind(step.from, ctx);
        const to = bind(step.to, ctx);
        if (from === null || to === null) return { reason: "invalid-target", entity: "" };
        const relation = next.relations.find(
          (r) => r.kind === "mark" && r.by === action.entity && r.on === from
        );
        if (!relation || relation.kind !== "mark") return { stop: false };
        const effect = next.effects[relation.effect];
        if (!effect) return { stop: false };
        next = {
          ...next,
          relations: next.relations.map((r) =>
            r === relation ? { ...relation, on: to } : r
          ),
          effects: { ...next.effects, [relation.effect]: { ...effect, target: to } },
        };
        return { stop: false };
      }
      case "turn-claim": {
        const ledger = mustEntity(next, action.entity).turn;
        if (ledger.claims.includes(step.key)) {
          return { reason: "unaffordable", cost: `claim:${step.key}` };
        }
        next = {
          ...next,
          entities: {
            ...next.entities,
            [action.entity]: {
              ...mustEntity(next, action.entity),
              turn: { ...ledger, claims: [...ledger.claims, step.key] },
            },
          },
        };
        return { stop: false };
      }
      case "move": {
        const to = answerPosition(action.answers, step.to);
        if (to === null) return { reason: "missing-answer", input: step.to };
        const mover = mustEntity(next, action.entity);
        const from = mover.position;
        if (from !== null) {
          const distance = distanceFt(from, to);
          const speedOverride = mover.overrides["stats.speed"];
          const budget =
            typeof speedOverride?.value === "number"
              ? speedOverride.value
              : mover.stats.speed;
          if (mover.turn.movementUsed + distance > budget) {
            return { reason: "unaffordable", cost: "turn:movement" };
          }
          next = {
            ...next,
            entities: {
              ...next.entities,
              [action.entity]: {
                ...mover,
                position: to,
                turn: { ...mover.turn, movementUsed: mover.turn.movementUsed + distance },
              },
            },
          };
        } else {
          next = {
            ...next,
            entities: { ...next.entities, [action.entity]: { ...mover, position: to } },
          };
        }
        next = repositionRelations(
          next,
          action.entity,
          events,
          action.id,
          options.catalogue
        );
        return { stop: false };
      }
      case "negate":
      case "manual-table":
        return { stop: false };
      default:
        return assertNever(step, "step kind");
    }
  }
}

// ── Running a whole program over its targets ────────────────────────────────

interface ProgramRun {
  readonly kind: "ran";
  readonly state: FoldedState;
  readonly created: EffectId[];
  readonly dealt: number;
  readonly tried: boolean;
}

function runProgram(
  state: FoldedState,
  program: Program,
  action: IntentAction,
  castLevel: number | null,
  events: CombatEvent[],
  options: RunOptions
): ProgramRun | RunHeld | Rejection {
  let next = state;
  const created: EffectId[] = [];
  let dealt = 0;
  let tried = false;
  // An area program runs once per derived target and not at all when its shape is empty — a
  // blast on empty ground is legal and costs its action. Every other untargeted program (e.g.
  // `core:move`) still runs once against a null target.
  const targets: (EntityId | null)[] =
    action.targets.length > 0
      ? [...action.targets]
      : program.targets?.count === "area"
        ? []
        : [null];
  for (const target of targets) {
    const run = runSteps(next, program, action, target, castLevel, events, options);
    if ("reason" in run) return run;
    if (run.kind === "held") return run;
    next = run.state;
    created.push(...run.created);
    dealt += run.dealt;
    tried = tried || run.outcomes.length > 0;
  }
  return { kind: "ran", state: next, created, dealt, tried };
}

function settleConcentration(
  state: FoldedState,
  action: IntentAction,
  created: readonly EffectId[],
  wants: boolean,
  events: CombatEvent[]
): FoldedState {
  const held = created.filter((id) => state.effects[id]?.concentration);
  const first = held[0];
  if (!wants || first === undefined) return state;
  let next = state;
  const caster = mustEntity(next, action.entity);
  if (caster.concentration !== null) {
    const replaced = endEffects(next, [caster.concentration]);
    next = replaced.state;
    events.push(...replaced.events);
  }
  return {
    ...next,
    entities: {
      ...next.entities,
      [action.entity]: { ...mustEntity(next, action.entity), concentration: first },
    },
  };
}

function receiptOutcome(
  created: number,
  dealt: number,
  tried: boolean
): Receipt["outcome"] {
  return created > 0 || dealt > 0 ? "established" : tried ? "negated" : "applied";
}

/** The one place automation level decides which of two already-computed states lands: the
 *  verdict always runs and the receipt always reports it, but at `log-only` only bookkeeping
 *  (`withheld`) is kept — `applied` is discarded (ADR-0011). */
function commitAt(
  level: FoldedState["settings"]["automation"],
  withheld: FoldedState,
  applied: FoldedState
): FoldedState {
  switch (level) {
    case "full-auto":
      return applied;
    case "log-only":
      return withheld;
    default:
      return assertNever(level, "automation level");
  }
}

// ── Entry points ────────────────────────────────────────────────────────────

export function applyIntent(
  state: FoldedState,
  action: IntentAction,
  catalogue: Catalogue
): StepResult {
  const entity = state.entities[action.entity];
  if (!entity) return rejected({ reason: "unknown-entity", entity: action.entity });
  const program = programOf(catalogue, action.mechanic, action.program);
  if (!program || !entity.mechanics.includes(action.mechanic)) {
    return rejected({ reason: "unknown-mechanic", mechanic: action.mechanic });
  }

  let windowEvent: EntityId | null = null;
  if (action.window !== null) {
    const window = state.windows.find((w) => w.id === action.window);
    if (!window) return rejected({ reason: "no-window", window: action.window });
    if (!window.eligible.includes(action.entity)) {
      return rejected({
        reason: "not-eligible",
        window: action.window,
        entity: action.entity,
      });
    }
    if (program.trigger.kind !== "event" || !program.trigger.window) {
      return rejected({
        reason: "not-eligible",
        window: action.window,
        entity: action.entity,
      });
    }
    windowEvent = eventEntity(window.event);
  } else {
    const claimsTurn =
      program.trigger.kind === "invocation" &&
      program.trigger.economy !== "none" &&
      program.trigger.economy !== "reaction";
    if (claimsTurn) {
      if (state.clock.phase !== "turns") return rejected({ reason: "not-in-turns" });
      if (state.clock.current !== action.entity) {
        return rejected({ reason: "not-your-turn", entity: action.entity });
      }
    }
  }

  let effectiveTargets = action.targets;
  if (program.targets) {
    if (program.targets.count === "area") {
      const spec = program.targets.area;
      // Conformance forbids an area count without a shape; the type still needs narrowing.
      if (!spec)
        return rejected({ reason: "unknown-mechanic", mechanic: action.mechanic });
      const resolved = areaShapeFrom(spec, action.answers);
      if (resolved.kind === "missing") {
        return rejected({ reason: "missing-answer", input: resolved.input });
      }
      const candidates = Object.values(state.entities).map((e) => ({
        id: e.id,
        position: e.position,
      }));
      const targets = program.targets;
      // Sorted before filtering: membership follows `Object.values(state.entities)`, whose key
      // enumeration order must never decide the fold order — every client folds the same log and
      // has to derive the same per-target sequence.
      const derived = [...areaMembership(resolved.shape, candidates)].sort();
      effectiveTargets = derived.filter((target) => {
        const ctx: EvalContext = {
          self: action.entity,
          target,
          eventEntity: windowEvent,
          outcome: null,
          answers: action.answers,
        };
        return evalPredicate(targets.eligibility, state, ctx);
      });
    } else {
      if (action.targets.length !== program.targets.count) {
        return rejected({ reason: "invalid-target", entity: "" });
      }
      for (const target of action.targets) {
        if (!state.entities[target])
          return rejected({ reason: "unknown-entity", entity: target });
        const ctx: EvalContext = {
          self: action.entity,
          target,
          eventEntity: windowEvent,
          outcome: null,
          answers: action.answers,
        };
        if (!evalPredicate(program.targets.eligibility, state, ctx)) {
          return rejected({ reason: "invalid-target", entity: target });
        }
      }
    }
  }
  const effectiveAction: IntentAction = { ...action, targets: effectiveTargets };

  const payment = payCosts(entity, program, action);
  if ("reason" in payment) return rejected(payment);

  const events: CombatEvent[] = [];
  const paidState: FoldedState = {
    ...state,
    entities: {
      ...state.entities,
      [action.entity]: { ...entity, turn: payment.ledger, resources: payment.resources },
    },
  };
  const run = runProgram(paidState, program, effectiveAction, payment.castLevel, events, {
    catalogue,
    hold: action.window === null,
    eventEntity: windowEvent,
  });
  if ("reason" in run) return rejected(run);

  if (run.kind === "held") {
    const window: ReactionWindow = {
      id: `window-${paidState.nextOrdinal}`,
      event: run.event,
      eligible: run.eligible,
      declared: action.id,
    };
    const declaredEntry = { ...effectiveAction, payment: [] };
    // A log-only table withholds the declaration itself — the reactor's reaction would be
    // withheld too, and a window declared unpaid must never resolve into an unpaid outcome after
    // a level switch — so nothing lands: no window, no `declared` entry, no cost (ADR-0011).
    const appliedState: FoldedState = {
      ...paidState,
      nextOrdinal: paidState.nextOrdinal + 1,
      windows: [...paidState.windows, window],
      declared: { ...paidState.declared, [action.id]: declaredEntry },
    };
    return {
      kind: "applied",
      state: commitAt(state.settings.automation, state, appliedState),
      receipt: {
        action: action.id,
        outcome: "applied",
        paid: payment.paid,
        events: [run.event],
        summary: [action.mechanic, `window:${run.event.kind}`],
      },
    };
  }

  const next = settleConcentration(
    run.state,
    action,
    run.created,
    payment.concentration,
    events
  );
  const receipt: Receipt = {
    action: action.id,
    outcome: receiptOutcome(run.created.length, run.dealt, run.tried),
    paid: payment.paid,
    events,
    summary: [action.mechanic],
  };
  // At log-only, `run.state` (and any window it opened mid-run, e.g. from a `move` step leaving
  // reach) is discarded entirely: only the pre-run `state` is kept, so a departure that never
  // committed cannot spawn a reaction to react to (ADR-0011).
  return {
    kind: "applied",
    state: commitAt(state.settings.automation, state, next),
    receipt,
  };
}

/** Closes a window: a held attack is resolved against the state the reactions produced. */
export function applyResolve(
  state: FoldedState,
  action: ResolveAction,
  catalogue: Catalogue
): StepResult {
  const window = state.windows.find((w) => w.id === action.window);
  if (!window) return rejected({ reason: "no-window", window: action.window });
  const closed: FoldedState = {
    ...state,
    windows: state.windows.filter((w) => w.id !== window.id),
  };
  const declared = state.declared[window.declared];
  if (!declared || declared.kind !== "intent") {
    return {
      kind: "applied",
      state: closed,
      receipt: {
        action: action.id,
        outcome: "applied",
        paid: [],
        events: [],
        summary: ["window:closed"],
      },
    };
  }
  const program = programOf(catalogue, declared.mechanic, declared.program);
  if (!program)
    return rejected({ reason: "unknown-mechanic", mechanic: declared.mechanic });
  const events: CombatEvent[] = [];
  const remaining = Object.fromEntries(
    Object.entries(closed.declared).filter(([id]) => id !== declared.id)
  );
  const base: FoldedState = { ...closed, declared: remaining };
  const run = runProgram(base, program, declared, null, events, {
    catalogue,
    hold: false,
    eventEntity: null,
  });
  if ("reason" in run) return rejected(run);
  if (run.kind === "held") return rejected({ reason: "no-window", window: window.id });
  const receipt: Receipt = {
    action: action.id,
    outcome: receiptOutcome(run.created.length, run.dealt, run.tried),
    paid: [],
    events,
    summary: [declared.mechanic, "window:resolved"],
  };
  // `base` clears the resolved window and its `declared` entry either way — that bookkeeping
  // always lands; only the program's outcome is gated.
  return {
    kind: "applied",
    state: commitAt(base.settings.automation, base, run.state),
    receipt,
  };
}

/** Opens an opportunity-attack window when `mover` has just left `from`'s reach; a no-op if
 *  nothing subscribes. Shared by `applyDeclare` (a manual departure) and the `move` step (a real
 *  one) — design doc §2.4 of the stage-2 addendum. */
function openLeftReachWindow(
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
function repositionRelations(
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

const LIFE_STATES = new Set<LifeState>(["alive", "dying", "stable", "dead"]);

/** Widened to `ReadonlySet<string>` so an arbitrary persisted string is *tested*, not asserted
 *  into the union before the test; the predicate is the only narrowing. */
function isLifeState(value: string): value is LifeState {
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
function patchDirectOverride(entity: Entity, path: string, value: unknown): Entity {
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
  return {
    kind: "applied",
    state: { ...state, entities: { ...state.entities, [action.entity]: patched } },
    receipt: {
      action: action.id,
      outcome: "applied",
      paid: [],
      events: [],
      summary: ["override"],
    },
  };
}

export function applyCheck(state: FoldedState, action: CheckAction): StepResult {
  const check = state.checks.find((c) => c.id === action.check);
  if (!check) return rejected({ reason: "no-such-check", check: action.check });
  const face = answerNumber(state, action.answers, "d20");
  if (face === null) return rejected({ reason: "missing-answer", input: "d20" });
  const entity = mustEntity(state, check.entity);
  const withoutCheck: FoldedState = {
    ...state,
    checks: state.checks.filter((c) => c.id !== check.id),
  };
  const passed = face + entity.stats.saves.CON >= check.dc;
  const events: CombatEvent[] = [];
  let next = withoutCheck;
  if (!passed && entity.concentration !== null) {
    const ended = endEffects(withoutCheck, [entity.concentration]);
    next = ended.state;
    events.push(...ended.events);
  }
  const receipt: Receipt = {
    action: action.id,
    outcome: passed ? "applied" : "negated",
    paid: [],
    events,
    summary: ["check:concentration"],
  };
  return {
    kind: "applied",
    state: commitAt(withoutCheck.settings.automation, withoutCheck, next),
    receipt,
  };
}
