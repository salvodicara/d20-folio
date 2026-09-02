/**
 * The reducer. `resolve(state, action, catalogue)` is pure and total: no clock, no RNG, no
 * I/O, no locale. Every union is closed and every switch ends in `assertNever`.
 *
 * Design: docs/superpowers/specs/2026-09-02-total-combat-automation-design.md §3.
 */
import type { Catalogue } from "./catalogue";
import { assertNever } from "./ids";
import { applyTable } from "./table";
import type { Action, FoldedState, Receipt, Resolution } from "./types";

function applied(state: FoldedState, receipt: Receipt): Resolution {
  return { kind: "applied", state: { ...state, revision: state.revision + 1 }, receipt };
}

export function resolve(
  state: FoldedState,
  action: Action,
  catalogue: Catalogue
): Resolution {
  void catalogue; // consumed by intents (Task 5)
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
    case "intent":
    case "declare":
    case "override":
    case "resolve":
    case "check":
      return {
        kind: "rejected",
        rejection: { reason: "unknown-action", action: action.id },
      };
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
