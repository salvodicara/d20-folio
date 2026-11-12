/**
 * A use that changes a roll already rolled (Cutting Words subtracts the Bardic
 * Inspiration die from another creature's attack, check or damage; Indomitable
 * rerolls your failed save). The app never rolls: this module resolves what the use
 * does, with its die, and the plan for one roll; the caller spends the use and the
 * Reaction and says it at the table. Pure.
 */
import type { ActionRollEffect, ConditionId, ReactableRoll } from "@/data/types";
import { getClassTable } from "@/data/classes";
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
      /** Offered only while this state is active (`barbarian-rage`). */
      whileActive?: string;
    };

/** A class's level on the sheet (0 without it). */
function classLevel(doc: CharacterDoc | undefined, classId: string): number {
  return doc?.character.classes.find((c) => c.classId === classId)?.level ?? 0;
}

/** A number from a class's table at the sheet's level in it (0 without it). */
function classTableValue(
  doc: CharacterDoc | undefined,
  classId: string,
  key: string
): number {
  const level = classLevel(doc, classId);
  const row = getClassTable(classId)?.levels[level - 1];
  const value = (row?.classSpecific as Record<string, unknown> | undefined)?.[key];
  return typeof value === "number" ? value : 0;
}

/** The resolved bonus of a reroll: a class's level, or a value of its table. */
function rerollBonus(
  doc: CharacterDoc | undefined,
  bonus: Extract<ActionRollEffect, { kind: "reroll" }>["bonus"]
): number {
  if (!bonus) return 0;
  if ("classLevel" in bonus) return classLevel(doc, bonus.classLevel);
  return classTableValue(doc, bonus.classTable.classId, bonus.classTable.key);
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
    const bonus = rerollBonus(doc, effect.bonus);
    return {
      kind: "reroll",
      rolls: effect.rolls,
      whose: effect.whose,
      ...(effect.advantage ? { advantage: true as const } : {}),
      ...(bonus > 0 ? { bonus } : {}),
      ...(effect.against ? { against: effect.against } : {}),
      ...(effect.whileActive ? { whileActive: effect.whileActive } : {}),
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
/** One reroll the sheet can offer: the use (to spend it) and what it does. */
export interface RerollOffer<A> {
  action: A;
  reaction: Extract<RollReaction, { kind: "reroll" }>;
}

export function rerollOffers<A extends { summary: { rollEffect?: ActionRollEffect } }>(
  doc: CharacterDoc,
  actions: ReadonlyArray<A>,
  moment: FailedRollMoment
): Array<RerollOffer<A>> {
  return actions.flatMap((action) => {
    const reaction = rollReactionOf(action, doc);
    if (reaction?.kind !== "reroll") return [];
    if (!reaction.rolls.includes(moment.roll)) return [];
    if (reaction.whose !== "any" && reaction.whose !== moment.whose) return [];
    if (
      reaction.whileActive &&
      !(doc.session.activeFeatures ?? []).includes(reaction.whileActive)
    ) {
      return [];
    }
    if (
      reaction.against &&
      (!moment.against || !reaction.against.includes(moment.against))
    ) {
      return [];
    }
    return [{ action, reaction }];
  });
}

/** The source id of a reroll paid with Heroic Inspiration (not an action). */
export const HEROIC_INSPIRATION_REROLL_ID = "heroic-inspiration";

/**
 * Heroic Inspiration as a reroll offer (SRD 5.2.1: "expend it to reroll any die
 * immediately after rolling it, and you must use the new roll"): offered on a failed
 * save while the character holds it, beside Indomitable and the like. `name` is the
 * reader's label for it.
 */
export function heroicInspirationReroll(
  doc: CharacterDoc,
  name: string
): RerollOffer<{ id: string; name: string }> | null {
  if (!doc.session.inspiration) return null;
  return {
    action: { id: HEROIC_INSPIRATION_REROLL_ID, name },
    reaction: { kind: "reroll", rolls: ["save"], whose: "self" },
  };
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

/** The i18n key naming a roll ("Tiro per colpire"). */
export function rollLabelKey(roll: ReactableRoll): string {
  return roll === "initiative" ? "monster.initiative" : `play.rollReaction.roll_${roll}`;
}

/** The i18n key of an operation's chip ("Aggiungi" / "Sottrai"). */
export function operationLabelKey(operation: "add" | "subtract"): string {
  return operation === "add" ? "common.add" : "play.rollReaction.subtract";
}

/** The toast for a planned use on a roll, as an i18n key and its values: the die to
 *  roll at the table, what it does, to which roll (`rollKey`, localized by the
 *  caller) and on whom. Null for no plan, or a reroll. */
export function rollPlanCopy(plan: RollReactionPlan | undefined): {
  key: string;
  rollKey: string;
  values: { die: string; target?: string };
} | null {
  if (!plan || !("die" in plan)) return null;
  const op = plan.operation === "add" ? "Add" : "Subtract";
  return {
    key: `play.rollReaction.toast${op}${plan.target ? "" : "NoTarget"}`,
    rollKey: rollLabelKey(plan.roll),
    values: { die: plan.die, ...(plan.target ? { target: plan.target.name } : {}) },
  };
}
