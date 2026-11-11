/**
 * What the states on a monster change on its own turn, for the DM: its next attack
 * roll's mode (Sap, Vicious Mockery: Disadvantage) and its Speed (Slow, Ray of Frost;
 * Hypnotic Pattern's Charmed holds it at 0).
 * Same-name states don't add up (two Slow hits are still −10 ft): the effect ledger
 * keeps one per target, source and state.
 */
import {
  activeRollModeAdjustments,
  effectsForTarget,
  speedAdjustmentByEffects,
  speedZeroByEffects,
} from "@/lib/combat-effects";
import type { CombatEffectOp } from "@/types/combat-effect";

export interface MonsterTurnModifiers {
  /** Its attack rolls' mode, or null for a straight roll. */
  attack: "advantage" | "disadvantage" | null;
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
  const modes = new Set(
    activeRollModeAdjustments(effects, "attack")
      .filter(
        (a) =>
          a.exceptAgainst === undefined ||
          (attackTargetId !== undefined && attackTargetId !== a.exceptAgainst)
      )
      .map((a) => a.mode)
  );
  const attack =
    modes.size === 1 ? (modes.has("advantage") ? "advantage" : "disadvantage") : null;
  return {
    attack,
    speedDeltaFt: speedAdjustmentByEffects(effects),
    speedZero: speedZeroByEffects(effects),
  };
}
