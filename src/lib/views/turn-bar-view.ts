/**
 * The Play turn bar's view model: one row per resource (Action, Bonus Action, Reaction,
 * Movement) with what is used, the budget, whether it is spent and the names spent on
 * it. Pure: the caller hands in the turn's facts (the combat store's selected actions,
 * slot budget, reaction and movement) and the mode from `playMode`.
 *
 * In exploration (no fight running) nothing gates: a use is counted and named, and a
 * row is never spent, so two Actions in a row (Search, then Study) both go through.
 */
import type { PlayMode } from "@/lib/play/cast-execution";

export type TurnBarKind = "action" | "bonus" | "reaction" | "move";

export interface TurnBarSlot {
  kind: TurnBarKind;
  /** Uses this turn; feet for movement. */
  used: number;
  /** The turn's allowance; feet (the walking speed) for movement. */
  budget: number;
  state: "open" | "spent";
  /** Display names of what was spent on it, in order. */
  spentNames: string[];
}

export interface TurnBarInput {
  mode: PlayMode;
  /** The combat store's committed actions per slot (current-locale names). */
  selected: {
    action: readonly { name: string }[];
    bonus: readonly { name: string }[];
  };
  budget: { action: number; bonus: number };
  reaction: { used: boolean; name?: string };
  movement: { usedFt: number; speedFt: number };
}

export function turnBarView(input: TurnBarInput): TurnBarSlot[] {
  const gated = input.mode === "combat";
  const row = (
    kind: TurnBarKind,
    used: number,
    budget: number,
    spentNames: string[]
  ): TurnBarSlot => ({
    kind,
    used,
    budget,
    state: gated && used >= budget ? "spent" : "open",
    spentNames,
  });
  const names = (list: readonly { name: string }[]) => list.map((entry) => entry.name);
  return [
    row(
      "action",
      input.selected.action.length,
      input.budget.action,
      names(input.selected.action)
    ),
    row(
      "bonus",
      input.selected.bonus.length,
      input.budget.bonus,
      names(input.selected.bonus)
    ),
    row(
      "reaction",
      input.reaction.used ? 1 : 0,
      1,
      input.reaction.used && input.reaction.name ? [input.reaction.name] : []
    ),
    row("move", input.movement.usedFt, input.movement.speedFt, []),
  ];
}
