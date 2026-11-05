/**
 * A use that changes a roll already rolled (Cutting Words subtracts the Bardic
 * Inspiration die from another creature's attack, check or damage; Indomitable
 * rerolls your failed save). The app never rolls: this module resolves what the use
 * does, with its die, and the plan for one roll; the caller spends the use and the
 * Reaction and says it at the table. Pure.
 */
import type { ActionRollEffect, ReactableRoll } from "@/data/types";

/** What the use does, with its die resolved (the Bardic Inspiration die by level). */
export type RollReaction =
  | {
      kind: "die";
      die: string;
      operations: ReadonlyArray<"add" | "subtract">;
      rolls: ReadonlyArray<ReactableRoll>;
      whose: "self" | "other" | "any";
      timing: "before-outcome" | "after-fail" | "after-outcome";
    }
  | {
      kind: "reroll";
      rolls: ReadonlyArray<ReactableRoll>;
      whose: "self" | "other" | "any";
      advantage?: true;
    };

/** "d8" → "1d8"; a count already given stays. */
function oneDie(die: string): string {
  return /^\d/.test(die) ? die : `1${die}`;
}

/** The roll effect of a resolved use, or null when it has none (or its die is
 *  the tracker's and the tracker has none). */
export function rollReactionOf(action: {
  summary: { rollEffect?: ActionRollEffect; die?: string };
}): RollReaction | null {
  const effect: ActionRollEffect | undefined = action.summary.rollEffect;
  if (!effect) return null;
  if (effect.kind === "reroll") {
    return {
      kind: "reroll",
      rolls: effect.rolls,
      whose: effect.whose,
      ...(effect.advantage ? { advantage: true as const } : {}),
    };
  }
  const die = "tracker" in effect.die ? action.summary.die : effect.die.dice;
  if (!die) return null;
  return {
    kind: "die",
    die: oneDie(die),
    operations: effect.operation === "choice" ? ["add", "subtract"] : [effect.operation],
    rolls: effect.rolls,
    whose: effect.whose,
    timing: effect.timing,
  };
}

/** One use on one roll: the die and what it does (or the reroll), and on whom. */
export type RollReactionPlan =
  | {
      die: string;
      operation: "add" | "subtract";
      roll: ReactableRoll;
      target?: { id: string; name: string };
    }
  | {
      reroll: true;
      advantage?: true;
      roll: ReactableRoll;
      target?: { id: string; name: string };
    };

/** The plan for using the reaction on `roll` (the first operation unless one is
 *  picked); null when the use can't touch that roll. */
export function rollReactionPlan(
  reaction: RollReaction,
  use: {
    roll: ReactableRoll;
    operation?: "add" | "subtract";
    target?: { id: string; name: string };
  }
): RollReactionPlan | null {
  if (!reaction.rolls.includes(use.roll)) return null;
  const target = use.target ? { target: use.target } : {};
  if (reaction.kind === "reroll") {
    return {
      reroll: true,
      ...(reaction.advantage ? { advantage: true as const } : {}),
      roll: use.roll,
      ...target,
    };
  }
  const operation = use.operation ?? reaction.operations[0];
  if (!operation || !reaction.operations.includes(operation)) return null;
  return { die: reaction.die, operation, roll: use.roll, ...target };
}
