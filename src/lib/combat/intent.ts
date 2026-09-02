/**
 * Intents: a program of a mechanic, invoked by an entity, with the table's answers.
 *
 * Costs are compiled and paid before any effect; an unaffordable intent is rejected and
 * nothing changes. Every caster-side consequence (effects, concentration, receipt) is a
 * function of the resolved per-target outcomes, so a negated cast leaves only its payment.
 */
import { applyDamage, applyHealing, type DamagePacket } from "./damage";
import { endEffects } from "./effects";
import { assertNever, type EffectId, type EntityId } from "./ids";
import type { Catalogue } from "./catalogue";
import { programOf } from "./catalogue";
import type { LifetimeSpec, Program, Step } from "./mechanic";
import { bind, evalExpr, evalPredicate, type EvalContext } from "./predicates";
import type {
  Action,
  CombatEvent,
  Effect,
  Entity,
  FoldedState,
  Lifetime,
  Outcome,
  PaymentChoice,
  PendingCheck,
  Receipt,
  Rejection,
  TurnLedger,
} from "./types";

export type IntentAction = Extract<Action, { kind: "intent" }>;
export type CheckAction = Extract<Action, { kind: "check" }>;

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
        if (!pool || pool.current < cost.amount)
          return { reason: "unaffordable", cost: `resource:${cost.id}` };
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
      // "until the start of your next turn": the next start is next round when it is your turn now
      // or your turn already passed this round; otherwise it is later this round.
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
  const entity = state.entities[target];
  let ac = entity.stats.ac;
  for (const effect of Object.values(state.effects)) {
    if (effect.target === target && effect.payload.kind === "standing")
      ac += effect.payload.facts.acBonus ?? 0;
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
  const before = state.entities[target];
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

function answerNumber(answers: IntentAction["answers"], key: string): number | null {
  const value = answers[key];
  return typeof value === "number" ? value : null;
}

// ── The program runner ──────────────────────────────────────────────────────

interface RunOutcome {
  readonly state: FoldedState;
  readonly created: EffectId[];
  readonly dealt: number;
  readonly outcomes: Outcome[];
}

function runSteps(
  state: FoldedState,
  program: Program,
  action: IntentAction,
  target: EntityId | null,
  castLevel: number | null,
  events: CombatEvent[]
): RunOutcome | Rejection {
  let next = state;
  const created: EffectId[] = [];
  const outcomes: Outcome[] = [];
  let dealt = 0;
  let halve = false;
  let ctx: EvalContext = {
    self: action.entity,
    target,
    eventEntity: null,
    outcome: null,
    answers: action.answers,
  };
  const caster = state.entities[action.entity];

  for (const step of program.steps) {
    if (step.when && !evalPredicate(step.when, next, ctx)) continue;
    const result = runStep(step);
    if ("reason" in result) return result;
    if (result.stop) break;
  }
  return { state: next, created, dealt, outcomes };

  function runStep(step: Step): { stop: boolean } | Rejection {
    switch (step.kind) {
      case "attack": {
        if (target === null) return { reason: "invalid-target", entity: "" };
        const face = answerNumber(action.answers, step.roll);
        if (face === null) return { reason: "missing-answer", input: step.roll };
        const bonus = evalExpr(step.bonus, caster, castLevel);
        const ac = effectiveAc(next, target, action.entity);
        events.push({
          kind: "attack-declared",
          attacker: action.entity,
          target,
          action: action.id,
        });
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
          const amount = answerNumber(action.answers, part.dice);
          if (amount === null) return { reason: "missing-answer", input: part.dice };
          packets.push({ amount, type: part.type });
        }
        for (const relation of next.relations) {
          if (
            relation.kind !== "mark" ||
            relation.by !== action.entity ||
            relation.on !== target
          )
            continue;
          const mark = next.effects[relation.effect];
          if (!mark || mark.payload.kind !== "mark") continue;
          for (const rider of mark.payload.riders) {
            if (rider.on !== "weapon-hit" && rider.on !== "any-hit") continue;
            const key = `rider:${mark.id}`;
            const amount = answerNumber(action.answers, key);
            if (amount === null) return { reason: "missing-answer", input: key };
            packets.push({ amount, type: rider.type });
          }
        }
        const hpBefore = next.entities[target].vitals.hp;
        next = deliverDamage(next, target, packets, action.id, events);
        dealt += hpBefore - next.entities[target].vitals.hp;
        return { stop: false };
      }
      case "save": {
        if (target === null) return { reason: "invalid-target", entity: "" };
        const key = program.inputs?.find(
          (i) => i.id === step.roll && i.kind === "d20" && i.perTarget
        )
          ? `${step.roll}:${target}`
          : step.roll;
        const face = answerNumber(action.answers, key);
        if (face === null) return { reason: "missing-answer", input: key };
        const dc =
          step.dc === "spell"
            ? (caster.stats.spellSaveDc ?? 0)
            : evalExpr(step.dc, caster, castLevel);
        const total = face + next.entities[target].stats.saves[step.ability];
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
          const amount = answerNumber(action.answers, part.dice);
          if (amount === null) return { reason: "missing-answer", input: part.dice };
          packets.push({
            amount: halve ? Math.floor(amount / 2) : amount,
            type: part.type,
          });
        }
        const hpBefore = next.entities[to].vitals.hp;
        next = deliverDamage(next, to, packets, action.id, events);
        dealt += hpBefore - next.entities[to].vitals.hp;
        return { stop: false };
      }
      case "heal": {
        const to = bind(step.to, ctx);
        if (to === null) return { reason: "invalid-target", entity: "" };
        const amount = evalExpr(step.amount, caster, castLevel);
        next = {
          ...next,
          entities: { ...next.entities, [to]: applyHealing(next.entities[to], amount) },
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
        if (next.entities[to].stats.conditionImmunities.includes(step.condition))
          return { stop: false };
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
        const ledger = next.entities[action.entity].turn;
        if (ledger.claims.includes(step.key))
          return { reason: "unaffordable", cost: `claim:${step.key}` };
        next = {
          ...next,
          entities: {
            ...next.entities,
            [action.entity]: {
              ...next.entities[action.entity],
              turn: { ...ledger, claims: [...ledger.claims, step.key] },
            },
          },
        };
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
  const claimsTurn =
    program.trigger.kind === "invocation" &&
    program.trigger.economy !== "none" &&
    program.trigger.economy !== "reaction";
  if (claimsTurn && action.window === null) {
    if (state.clock.phase !== "turns") return rejected({ reason: "not-in-turns" });
    if (state.clock.current !== action.entity)
      return rejected({ reason: "not-your-turn", entity: action.entity });
  }
  if (program.targets) {
    if (action.targets.length !== program.targets.count)
      return rejected({ reason: "invalid-target", entity: "" });
    for (const target of action.targets) {
      if (!state.entities[target])
        return rejected({ reason: "unknown-entity", entity: target });
      const ctx: EvalContext = {
        self: action.entity,
        target,
        eventEntity: null,
        outcome: null,
        answers: action.answers,
      };
      if (!evalPredicate(program.targets.eligibility, state, ctx))
        return rejected({ reason: "invalid-target", entity: target });
    }
  }

  const payment = payCosts(entity, program, action);
  if ("reason" in payment) return rejected(payment);

  const events: CombatEvent[] = [];
  let next: FoldedState = {
    ...state,
    entities: {
      ...state.entities,
      [action.entity]: { ...entity, turn: payment.ledger, resources: payment.resources },
    },
  };
  const created: EffectId[] = [];
  const outcomes: Outcome[] = [];
  let dealt = 0;
  const targets: (EntityId | null)[] =
    action.targets.length > 0 ? [...action.targets] : [null];
  for (const target of targets) {
    const run = runSteps(next, program, action, target, payment.castLevel, events);
    if ("reason" in run) return rejected(run);
    next = run.state;
    created.push(...run.created);
    outcomes.push(...run.outcomes);
    dealt += run.dealt;
  }

  // Concentration is a consequence of established effects, never of the cast alone.
  const held = created.filter((id) => next.effects[id]?.concentration);
  if (payment.concentration && held.length > 0) {
    const caster = next.entities[action.entity];
    if (caster.concentration !== null) {
      const replaced = endEffects(next, [caster.concentration]);
      next = replaced.state;
      events.push(...replaced.events);
    }
    next = {
      ...next,
      entities: {
        ...next.entities,
        [action.entity]: { ...next.entities[action.entity], concentration: held[0] },
      },
    };
  }

  const tried = outcomes.length > 0;
  const outcome: Receipt["outcome"] =
    created.length > 0 || dealt > 0 ? "established" : tried ? "negated" : "applied";
  return {
    kind: "applied",
    state: next,
    receipt: {
      action: action.id,
      outcome,
      paid: payment.paid,
      events,
      summary: [action.mechanic],
    },
  };
}

export function applyCheck(state: FoldedState, action: CheckAction): StepResult {
  const check = state.checks.find((c) => c.id === action.check);
  if (!check) return rejected({ reason: "no-such-check", check: action.check });
  const face = answerNumber(action.answers, "d20");
  if (face === null) return rejected({ reason: "missing-answer", input: "d20" });
  const entity = state.entities[check.entity];
  const events: CombatEvent[] = [];
  let next: FoldedState = {
    ...state,
    checks: state.checks.filter((c) => c.id !== check.id),
  };
  const passed = face + entity.stats.saves.CON >= check.dc;
  if (!passed && entity.concentration !== null) {
    const ended = endEffects(next, [entity.concentration]);
    next = ended.state;
    events.push(...ended.events);
  }
  return {
    kind: "applied",
    state: next,
    receipt: {
      action: action.id,
      outcome: passed ? "applied" : "negated",
      paid: [],
      events,
      summary: ["check:concentration"],
    },
  };
}
