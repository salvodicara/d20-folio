/**
 * A use that changes a roll already rolled (Cutting Words subtracts the Bardic
 * Inspiration die from another creature's attack, check or damage; Indomitable
 * rerolls your failed save). The app never rolls: this module resolves what the use
 * does, with its die, and the plan for one roll; the caller spends the use and the
 * Reaction and says it at the table. Pure.
 */
import type { ActionRollEffect, ConditionId, ReactableRoll } from "@/data/types";
import type { CharacterDoc } from "@/types/character";

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
      /** The bonus to the new roll, resolved (Indomitable: the Fighter level). */
      bonus?: number;
      against?: ReadonlyArray<ConditionId>;
    };

/** A class's level on the sheet (0 without it). */
function classLevel(doc: CharacterDoc | undefined, classId: string): number {
  return doc?.character.classes.find((c) => c.classId === classId)?.level ?? 0;
}

/** "d8" → "1d8"; a count already given stays. */
function oneDie(die: string): string {
  return /^\d/.test(die) ? die : `1${die}`;
}

/** The roll effect of a resolved use, or null when it has none (or its die is
 *  the tracker's and the tracker has none). */
export function rollReactionOf(
  action: { summary: { rollEffect?: ActionRollEffect; die?: string } },
  /** The sheet, for a bonus that reads it (Indomitable's Fighter level). */
  doc?: CharacterDoc
): RollReaction | null {
  const effect: ActionRollEffect | undefined = action.summary.rollEffect;
  // A paid Advantage acts at the roll, not on a roll already made: the save entry's
  // post-roll seam reads it (`postRollSources`).
  if (!effect || effect.kind === "advantage") return null;
  if (effect.kind === "reroll") {
    const bonus = effect.bonus ? classLevel(doc, effect.bonus.classLevel) : 0;
    return {
      kind: "reroll",
      rolls: effect.rolls,
      whose: effect.whose,
      ...(effect.advantage ? { advantage: true as const } : {}),
      ...(bonus > 0 ? { bonus } : {}),
      ...(effect.against ? { against: effect.against } : {}),
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

/** A roll whose failure is known: what it was, whose, and the condition the effect
 *  that called for it applies (a save against Charmed). */
export interface FailedRollMoment {
  roll: ReactableRoll;
  whose: "self" | "other";
  against?: ConditionId;
}

/** The rerolls the sheet can offer on a failed roll (Indomitable, Countercharm),
 *  each with its action (to spend it) and what it does. A reroll limited to some
 *  conditions needs the moment to name one of them. */
export function rerollOffers<A extends { summary: { rollEffect?: ActionRollEffect } }>(
  doc: CharacterDoc,
  actions: ReadonlyArray<A>,
  moment: FailedRollMoment
): Array<{ action: A; reaction: Extract<RollReaction, { kind: "reroll" }> }> {
  return actions.flatMap((action) => {
    const reaction = rollReactionOf(action, doc);
    if (reaction?.kind !== "reroll") return [];
    if (!reaction.rolls.includes(moment.roll)) return [];
    if (reaction.whose !== "any" && reaction.whose !== moment.whose) return [];
    if (
      reaction.against &&
      (!moment.against || !reaction.against.includes(moment.against))
    ) {
      return [];
    }
    return [{ action, reaction }];
  });
}

/** The toast for a planned reroll, as an i18n key and its values: whose roll is
 *  taken again (`target`), and whether the new roll has Advantage (Countercharm on
 *  Bren: «Bren ritira il tiro salvezza con Vantaggio»). Null for no plan, or a die. */
export function rerollPlanCopy(
  plan: RollReactionPlan | undefined
): { key: string; values: { target?: string } } | null {
  if (!plan || !("reroll" in plan)) return null;
  const mode = plan.advantage ? "Advantage" : "";
  return {
    key: `play.rollReaction.toastReroll${mode}${plan.target ? "" : "NoTarget"}`,
    values: plan.target ? { target: plan.target.name } : {},
  };
}
