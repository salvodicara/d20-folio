import { scaleUpcastDice, spellInstanceCount } from "@/lib/utils";

export interface CastSlotScalingFacts {
  readonly level: number;
  readonly damageDice?: string;
  readonly damageDicePerUpcast?: string;
  readonly healDice?: string;
  readonly healDicePerUpcast?: string;
  readonly instances?: number;
  readonly instancesPerUpcast?: number;
  readonly secondaryDamage?: {
    readonly dice: string;
    readonly damageType: string;
    readonly dicePerUpcast?: string;
  };
}

export function damageAtSlotLevel(
  upcast: CastSlotScalingFacts | undefined,
  level: number
): string | null {
  if (!upcast) return null;
  const dice = scaleUpcastDice(upcast, level);
  if (dice == null) return null;
  const count = spellInstanceCount(upcast, level);
  const primary = count != null && count > 1 ? `${count} × ${dice}` : dice;
  const secondary = upcast.secondaryDamage;
  if (!secondary) return primary;
  const secondaryDice = scaleUpcastDice(
    {
      level: upcast.level,
      damageDice: secondary.dice,
      damageDicePerUpcast: secondary.dicePerUpcast,
    },
    level
  );
  return secondaryDice ? `${primary} + ${secondaryDice}` : primary;
}

export function healAtSlotLevel(
  upcast: CastSlotScalingFacts | undefined,
  level: number
): string | null {
  if (!upcast?.healDice) return null;
  return (
    scaleUpcastDice(
      {
        level: upcast.level,
        damageDice: upcast.healDice,
        damageDicePerUpcast: upcast.healDicePerUpcast,
      },
      level
    ) ?? null
  );
}
