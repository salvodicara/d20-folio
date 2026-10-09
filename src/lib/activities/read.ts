/** Small, pure reads of an Activity that presenters share. */
import type { ActionType } from "@/data/types";
import type { DamageType } from "@/types/damage";
import type { Activity, ActivityCost, ActivityDice, ActivityEffect } from "./types";

type DamageEffect = Extract<ActivityEffect, { kind: "damage" }>;

function minutesKey(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * The casting-time catalogue key suffix (`srd.castingTime_<key>`): "action",
 * "bonus action", "reaction", "1 action or 8 hours", "10 minutes", "1 hour".
 */
export function castingTimeKey(cost: ActivityCost): string {
  switch (cost.economy) {
    case "reaction":
      return "reaction";
    case "bonus":
      return "bonus action";
    case "action":
      return cost.orMinutes === undefined
        ? "action"
        : `1 action or ${minutesKey(cost.orMinutes)}`;
    default:
      return cost.minutes === undefined ? cost.economy : minutesKey(cost.minutes);
  }
}

/** The damage effects that are not conditional on the target's creature type. */
function unconditionalDamage(activity: Activity): DamageEffect[] {
  return activity.effects.filter(
    (effect): effect is DamageEffect =>
      effect.kind === "damage" && !effect.vsCreatureTypes
  );
}

/** The activity's primary damage component. */
export function primaryDamage(activity: Activity): DamageEffect | undefined {
  return unconditionalDamage(activity)[0];
}

/** A second simultaneous component with its own dice (Ice Storm's cold). */
export function secondaryDamage(activity: Activity): DamageEffect | undefined {
  return unconditionalDamage(activity)[1];
}

/** The one fixed damage type of the primary component, when it has exactly one. */
export function fixedDamageType(activity: Activity): DamageType | undefined {
  const primary = primaryDamage(activity);
  return primary?.types?.length === 1 && !primary.choose ? primary.types[0] : undefined;
}

/** The base healing dice of an activity that restores Hit Points. */
export function healDice(activity: Activity): string | undefined {
  for (const effect of activity.effects) {
    if (effect.kind === "heal" && effect.fromDamage === undefined && effect.dice?.dice) {
      return effect.dice.dice;
    }
  }
  return undefined;
}

/** How a damage component's types read: one fixed type, several at once, or the user's pick. */
export type DamageTypeFacet =
  | { kind: "single"; damageType: DamageType }
  | { kind: "multi" | "choice"; damageTypes: ReadonlyArray<DamageType> };

/** The damage-type facet of a damage component, when it declares a type. */
export function damageTypeFacet(
  effect: DamageEffect | undefined
): DamageTypeFacet | undefined {
  const types = effect?.types;
  const [first] = types ?? [];
  if (!types || !first) return undefined;
  if (effect.choose) return { kind: "choice", damageTypes: types };
  if (types.length === 1) return { kind: "single", damageType: first };
  return { kind: "multi", damageTypes: types };
}

/** Whether a formula adds the user's spellcasting ability modifier. */
export function addsSpellMod(formula: ActivityDice | undefined): boolean {
  return formula?.plus?.some((term) => term.kind === "spell-mod") === true;
}

/** The effects of one kind, in declaration order. */
export function effectsOfKind<K extends ActivityEffect["kind"]>(
  activity: Activity,
  kind: K
): Array<Extract<ActivityEffect, { kind: K }>> {
  return activity.effects.filter(
    (effect): effect is Extract<ActivityEffect, { kind: K }> => effect.kind === kind
  );
}

/** The turn-economy slot an activity takes, when it is one (not a cast longer than
 *  an action, a legendary action or a monster trait). */
export function actionTypeOf(cost: ActivityCost): ActionType | undefined {
  const { economy } = cost;
  return economy === "action" ||
    economy === "bonus" ||
    economy === "reaction" ||
    economy === "free"
    ? economy
    : undefined;
}
