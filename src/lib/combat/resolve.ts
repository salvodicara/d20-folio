/**
 * The reducer. `resolve(state, action, catalogue)` is pure and total: no clock, no RNG, no
 * I/O, no locale. Every union is closed and every switch ends in `assertNever`.
 *
 * Design: docs/superpowers/specs/2026-09-02-total-combat-automation-design.md §3.
 */
import type { Catalogue } from "./catalogue";
import { verifyRoll } from "./dice";
import { assertNever, type EntityId } from "./ids";
import {
  applyCheck,
  applyDeclare,
  applyIntent,
  applyOverride,
  applyResolve,
} from "./intent";
import { applyTable } from "./table";
import type {
  Action,
  Answers,
  FoldedState,
  Receipt,
  Rejection,
  Resolution,
} from "./types";

function applied(state: FoldedState, receipt: Receipt): Resolution {
  return { kind: "applied", state: { ...state, revision: state.revision + 1 }, receipt };
}

/** The roll ids an action answers with. Total over a malformed persisted answer (`null`
 *  included, whose `typeof` is `"object"`): a bad answer is simply not a roll reference, and the
 *  step that needs it rejects with `missing-answer` further down. */
function referencedRolls(answers: Answers): string[] {
  // `unknown`, not `Answer`: a persisted log may carry an answer the union does not describe.
  return Object.values<unknown>(answers).flatMap((value) =>
    typeof value === "object" &&
    value !== null &&
    "roll" in value &&
    typeof value.roll === "string"
      ? [value.roll]
      : []
  );
}

/**
 * A roll is consumed by at most one action, and by the entity it was rolled for (ADR-0010):
 * a second action answering with the same roll is rejected, so one natural 20 never yields
 * two verdicts. A roll the state does not hold yet falls through to `missing-answer`.
 */
function rollsUsable(
  state: FoldedState,
  action: { readonly id: string; readonly answers: Answers },
  entity: EntityId | null
): Rejection | null {
  for (const id of referencedRolls(action.answers)) {
    const record = state.rolls[id];
    if (!record) continue;
    const by = state.spent[id];
    if (by !== undefined && by !== action.id)
      return { reason: "roll-consumed", roll: id, by };
    if (entity !== null && record.roller !== null && record.roller !== entity) {
      return { reason: "roll-roller-mismatch", roll: id, entity };
    }
  }
  return null;
}

function spend(
  state: FoldedState,
  action: { readonly id: string; readonly answers: Answers }
): FoldedState {
  const ids = referencedRolls(action.answers);
  if (ids.length === 0) return state;
  const spent = { ...state.spent };
  for (const id of ids) spent[id] = action.id;
  return { ...state, spent };
}

export function resolve(
  state: FoldedState,
  action: Action,
  catalogue: Catalogue
): Resolution {
  switch (action.kind) {
    case "table": {
      const result = applyTable(state, action.table);
      if (result.kind === "rejected") return result;
      return applied(result.state, {
        action: action.id,
        outcome: "applied",
        paid: [],
        events: result.events,
        summary: [`table:${action.table.op}`],
      });
    }
    case "intent": {
      const unusable = rollsUsable(state, action, action.entity);
      if (unusable) return { kind: "rejected", rejection: unusable };
      const result = applyIntent(state, action, catalogue);
      if (result.kind === "rejected") return result;
      return applied(spend(result.state, action), result.receipt);
    }
    case "check": {
      const pending = state.checks.find((c) => c.id === action.check);
      const unusable = rollsUsable(state, action, pending ? pending.entity : null);
      if (unusable) return { kind: "rejected", rejection: unusable };
      const result = applyCheck(state, action);
      if (result.kind === "rejected") return result;
      return applied(spend(result.state, action), result.receipt);
    }
    case "declare": {
      const result = applyDeclare(state, action, catalogue);
      if (result.kind === "rejected") return result;
      return applied(result.state, result.receipt);
    }
    case "override": {
      const result = applyOverride(state, action);
      if (result.kind === "rejected") return result;
      return applied(result.state, result.receipt);
    }
    case "resolve": {
      const result = applyResolve(state, action, catalogue);
      if (result.kind === "rejected") return result;
      return applied(result.state, result.receipt);
    }
    case "roll": {
      const error = verifyRoll(action.roll);
      if (error) {
        return {
          kind: "rejected",
          rejection: { reason: "invalid-roll", code: error.code },
        };
      }
      const roller = action.roll.roller;
      if (roller !== null && !state.entities[roller]) {
        return {
          kind: "rejected",
          rejection: { reason: "unknown-entity", entity: roller },
        };
      }
      return applied(
        { ...state, rolls: { ...state.rolls, [action.id]: action.roll } },
        {
          action: action.id,
          outcome: "applied",
          paid: [],
          events: [],
          summary: ["roll", `roll:${action.roll.purpose}`],
        }
      );
    }
    case "undo":
      // Undo is a fold-level operation: the fold skips the undone action and its dependents.
      return {
        kind: "rejected",
        rejection: { reason: "unknown-action", action: action.id },
      };
    default:
      return assertNever(action, "action kind");
  }
}
