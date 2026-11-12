/**
 * What the states on a monster change on its own turn, for the DM: its next attack
 * roll's mode (Sap, Vicious Mockery: Disadvantage), a die on its attacks and saves
 * (Bane: −1d4) and its Speed (Slow, Ray of Frost; Hypnotic Pattern's Charmed holds
 * it at 0).
 * Same-name states don't add up (two Slow hits are still −10 ft): the effect ledger
 * keeps one per target, source and state.
 */
import {
  activeRollDieAdjustments,
  activeRollModeAdjustments,
  effectsForTarget,
  speedAdjustmentByEffects,
  speedZeroByEffects,
} from "@/lib/combat-effects";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";

/** A die a state adds to or takes from a roll, and the state's source (Bane). */
export interface MonsterRollDie {
  operation: "add" | "subtract";
  dice: string;
  source: Pick<ActiveCombatEffect["source"], "kind" | "id">;
}

export interface MonsterTurnModifiers {
  /** Its attack rolls' mode, or null for a straight roll. */
  attack: "advantage" | "disadvantage" | null;
  /** The states that set that mode, for the DM to read («Disadvantage (Sap)»). */
  attackModeSources: ReadonlyArray<MonsterRollDie["source"]>;
  /** Dice on its attack rolls (Bane: −1d4). */
  attackDice: ReadonlyArray<MonsterRollDie>;
  /** Dice on its saving throws (Bane: −1d4). */
  saveDice: ReadonlyArray<MonsterRollDie>;
  /** Feet added to (negative: taken from) its Speed. */
  speedDeltaFt: number;
  /** A condition holds its Speed at 0 (Hypnotic Pattern's Charmed). */
  speedZero: boolean;
}

export function monsterTurnModifiers(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  monsterId: string,
  /** The creature it attacks: a state that holds only against others reads it. */
  attackTargetId?: string
): MonsterTurnModifiers {
  const effects = effectsForTarget(operations, monsterId);
  const modeAdjustments = activeRollModeAdjustments(effects, "attack").filter(
    (a) =>
      a.exceptAgainst === undefined ||
      (attackTargetId !== undefined && attackTargetId !== a.exceptAgainst)
  );
  const modes = new Set(modeAdjustments.map((a) => a.mode));
  const attack =
    modes.size === 1 ? (modes.has("advantage") ? "advantage" : "disadvantage") : null;
  const dice = (rollType: "attack" | "save"): MonsterRollDie[] =>
    activeRollDieAdjustments(effects, rollType).map((a) => ({
      operation: a.operation,
      dice: a.dice,
      source: { kind: a.effect.source.kind, id: a.effect.source.id },
    }));
  return {
    attack,
    attackModeSources: attack
      ? modeAdjustments.map((a) => ({
          kind: a.effect.source.kind,
          id: a.effect.source.id,
        }))
      : [],
    attackDice: dice("attack"),
    saveDice: dice("save"),
    speedDeltaFt: speedAdjustmentByEffects(effects),
    speedZero: speedZeroByEffects(effects),
  };
}
