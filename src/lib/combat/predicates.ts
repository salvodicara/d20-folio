/**
 * Predicate and expression evaluation over the folded state, pure and locale-free.
 */
import { assertNever, type EntityId } from "./ids";
import type { Binding, Expr, Predicate } from "./mechanic";
import type { Answers, Entity, FoldedState, Outcome } from "./types";

export interface EvalContext {
  readonly self: EntityId;
  readonly target: EntityId | null;
  readonly eventEntity: EntityId | null;
  readonly outcome: Outcome | null;
  readonly answers: Answers;
}

export function bind(binding: Binding, ctx: EvalContext): EntityId | null {
  switch (binding) {
    case "$self":
      return ctx.self;
    case "$target":
      return ctx.target;
    case "$event.entity":
      return ctx.eventEntity;
    default:
      return assertNever(binding, "binding");
  }
}

export function evalExpr(expr: Expr, entity: Entity, castLevel: number | null): number {
  if (typeof expr === "number") return expr;
  if ("byLevel" in expr) {
    const level = castLevel ?? 1;
    const levels = Object.keys(expr.byLevel)
      .map(Number)
      .filter((l) => l <= level)
      .sort((a, b) => b - a);
    const best = levels[0];
    return best === undefined ? 0 : (expr.byLevel[best] ?? 0);
  }
  if ("ability" in expr) return entity.stats.abilities[expr.ability];
  if ("stat" in expr) {
    switch (expr.stat) {
      case "proficiency":
        return entity.stats.proficiency;
      case "spellSaveDc":
        return entity.stats.spellSaveDc ?? 0;
      case "spellAttack":
        return entity.stats.spellAttack ?? 0;
      default:
        return assertNever(expr.stat, "stat expr");
    }
  }
  if ("sum" in expr) {
    return expr.sum.reduce<number>(
      (acc, part) => acc + evalExpr(part, entity, castLevel),
      0
    );
  }
  return assertNever(expr, "expr");
}

function hasCondition(state: FoldedState, entity: EntityId, condition: string): boolean {
  return Object.values(state.effects).some(
    (effect) =>
      effect.target === entity &&
      effect.payload.kind === "condition" &&
      effect.payload.condition === condition
  );
}

function relationHolds(
  state: FoldedState,
  kind: "adjacent" | "visible" | "engaged" | "mark",
  a: EntityId,
  b: EntityId,
  value: boolean | undefined
): boolean {
  switch (kind) {
    case "adjacent":
      return state.relations.some(
        (r) =>
          r.kind === "adjacent" && ((r.a === a && r.b === b) || (r.a === b && r.b === a))
      );
    case "engaged":
      return state.relations.some(
        (r) =>
          r.kind === "engaged" && ((r.a === a && r.b === b) || (r.a === b && r.b === a))
      );
    case "visible": {
      const declared = state.relations.find(
        (r) => r.kind === "visible" && r.a === a && r.b === b
      );
      const visible = declared && declared.kind === "visible" ? declared.value : true; // default: visible
      return visible === (value ?? true);
    }
    case "mark":
      return state.relations.some((r) => r.kind === "mark" && r.by === a && r.on === b);
    default:
      return assertNever(kind, "relation kind");
  }
}

export function evalPredicate(
  predicate: Predicate,
  state: FoldedState,
  ctx: EvalContext
): boolean {
  if ("outcome" in predicate) return ctx.outcome === predicate.outcome;
  if ("answer" in predicate) return ctx.answers[predicate.answer] === predicate.equals;
  if ("relation" in predicate) {
    const a = bind(predicate.between[0], ctx);
    const b = bind(predicate.between[1], ctx);
    if (a === null || b === null) return false;
    return relationHolds(state, predicate.relation, a, b, predicate.value);
  }
  if ("is" in predicate) {
    const a = bind(predicate.is[0], ctx);
    const b = bind(predicate.is[1], ctx);
    return a !== null && a === b;
  }
  if ("condition" in predicate) {
    const on = bind(predicate.on, ctx);
    if (on === null) return false;
    return hasCondition(state, on, predicate.condition) === predicate.present;
  }
  if ("hp" in predicate) {
    const id = bind(predicate.hp, ctx);
    const entity = id === null ? undefined : state.entities[id];
    if (!entity) return false;
    const value =
      predicate.value === "half-max"
        ? Math.floor(entity.stats.maxHp / 2)
        : predicate.value;
    switch (predicate.op) {
      case "<=":
        return entity.vitals.hp <= value;
      case "<":
        return entity.vitals.hp < value;
      case ">=":
        return entity.vitals.hp >= value;
      case ">":
        return entity.vitals.hp > value;
      default:
        return assertNever(predicate.op, "hp op");
    }
  }
  if ("all" in predicate) return predicate.all.every((p) => evalPredicate(p, state, ctx));
  if ("any" in predicate) return predicate.any.some((p) => evalPredicate(p, state, ctx));
  if ("not" in predicate) return !evalPredicate(predicate.not, state, ctx);
  return assertNever(predicate, "predicate");
}
