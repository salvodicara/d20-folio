/**
 * Derive the action the table actually resolves after a spell's cast level is chosen.
 * Resource payment stays in TurnEconomyProvider; this engine seam only updates the
 * level-dependent facts consumed by the target/effect resolver.
 */
import type { SrdSpellData } from "@/data/types";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { whileActiveDurationAtCastLevel } from "@/lib/grants";
import { scaleUpcastDice, spellInstanceCount } from "@/lib/utils";

type ScalableCombatSummary = Pick<
  ResolvedAction["summary"],
  | "damage"
  | "healing"
  | "instances"
  | "secondaryDamage"
  | "tempHpApply"
  | "targeting"
  | "selfHealingOnOther"
>;

function replaceBaseFormula(
  formula: string | undefined,
  baseDice: string | undefined,
  scaledDice: string | undefined
): string | undefined {
  if (!formula || !baseDice || !scaledDice || scaledDice === baseDice) return formula;
  return formula.startsWith(baseDice)
    ? `${scaledDice}${formula.slice(baseDice.length)}`
    : formula;
}

/** Return a copy whose formulas and instance count match the selected slot level. */
export function actionAtCastLevel(
  action: ResolvedAction,
  spell: SrdSpellData | undefined,
  castLevel: number
): ResolvedAction {
  if (!spell || castLevel <= spell.level) return action;

  const activeKey = action.activatesKey ?? action.standingEffect?.activeKey;
  const durationGrant = spell.grants?.find(
    (grant) => grant.type === "while-active" && grant.activeKey === activeKey
  );
  const duration =
    durationGrant?.type === "while-active"
      ? whileActiveDurationAtCastLevel(durationGrant.duration, castLevel)
      : undefined;

  return {
    ...action,
    slotLevel: castLevel,
    ...(action.activatesKey && duration?.maxRounds !== undefined
      ? { activeDurationRounds: duration.maxRounds }
      : {}),
    ...(action.standingEffect && duration?.maxRounds !== undefined
      ? {
          standingEffect: {
            ...action.standingEffect,
            maxRounds: duration.maxRounds,
          },
        }
      : {}),
    summary: scaleCombatSummaryAtCastLevel(action.summary, spell, castLevel),
  };
}

/** Scale the shared combat facts without depending on a display/raw action shape. The
 * initial cast and every later active-spell use call this same function. */
export function scaleCombatSummaryAtCastLevel<T extends ScalableCombatSummary>(
  summary: T,
  spell: SrdSpellData,
  castLevel: number
): T {
  if (castLevel <= spell.level) return summary;

  const damage = scaleUpcastDice(spell, castLevel);
  const healing = spell.healDice
    ? scaleUpcastDice(
        {
          level: spell.level,
          damageDice: spell.healDice,
          damageDicePerUpcast: spell.healDicePerUpcast,
        },
        castLevel
      )
    : undefined;
  const instances = spellInstanceCount(spell, castLevel);
  const secondaryDamage = spell.secondaryDamage
    ? scaleUpcastDice(
        {
          level: spell.level,
          damageDice: spell.secondaryDamage.dice,
          damageDicePerUpcast: spell.secondaryDamage.dicePerUpcast,
        },
        castLevel
      )
    : undefined;
  const tempHpApply = summary.tempHpApply;
  const targeting = summary.targeting;
  const selfHealingOnOther = summary.selfHealingOnOther;
  const maxTargets =
    targeting?.maxTargets !== undefined && targeting.maxTargetsPerUpcast
      ? targeting.maxTargets +
        targeting.maxTargetsPerUpcast * Math.max(0, castLevel - spell.level)
      : undefined;
  const tempHpBonus =
    tempHpApply && spell.tempHpRoll?.bonusPerUpcast
      ? tempHpApply.bonus +
        spell.tempHpRoll.bonusPerUpcast * Math.max(0, castLevel - spell.level)
      : undefined;

  return {
    ...summary,
    ...(summary.damage
      ? {
          damage: replaceBaseFormula(summary.damage, spell.damageDice, damage),
        }
      : {}),
    ...(summary.healing
      ? {
          healing: replaceBaseFormula(summary.healing, spell.healDice, healing),
        }
      : {}),
    ...(instances !== null ? { instances } : {}),
    ...(secondaryDamage && summary.secondaryDamage
      ? {
          secondaryDamage: {
            ...summary.secondaryDamage,
            dice: secondaryDamage,
          },
        }
      : {}),
    ...(tempHpApply && tempHpBonus !== undefined
      ? { tempHpApply: { ...tempHpApply, bonus: tempHpBonus } }
      : {}),
    ...(targeting && maxTargets !== undefined
      ? { targeting: { ...targeting, maxTargets } }
      : {}),
    ...(selfHealingOnOther && selfHealingOnOther.perCastLevel > 0
      ? {
          selfHealingOnOther: {
            ...selfHealingOnOther,
            amount:
              selfHealingOnOther.amount +
              selfHealingOnOther.perCastLevel * (castLevel - spell.level),
          },
        }
      : {}),
  };
}
