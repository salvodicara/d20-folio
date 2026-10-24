/**
 * Two cast outcomes that hang on the target's own numbers, kept pure so the
 * damage tray (or any homebrew effect) can ask them:
 *
 *  - a revive returns a dead creature with a fixed number of Hit Points or all
 *    of them (Revivify "with 1 Hit Point", Resurrection "with all its Hit Points");
 *  - a Hit Point threshold picks the branch a target takes from its current Hit
 *    Points (Power Word Kill: "100 Hit Points or fewer, it dies").
 */
import type { SpellHitPointThreshold, SpellRevive } from "@/data/types";

/** The Hit Points a revived creature returns with, never above its maximum. */
export function revivalHitPoints(revive: SpellRevive, maximumHitPoints: number): number {
  const max = Math.max(0, Math.floor(maximumHitPoints));
  return revive.hitPoints === "all" ? max : Math.min(revive.hitPoints, max);
}

/**
 * The branch a target with `currentHitPoints` takes: the threshold's own outcome at
 * or below `max`, otherwise the rest of the spell (Power Word Kill's damage, Power
 * Word Stun's Speed 0).
 */
export function hitPointThresholdOutcome(
  threshold: Pick<SpellHitPointThreshold, "max" | "atOrBelow">,
  currentHitPoints: number
): SpellHitPointThreshold["atOrBelow"] | "otherwise" {
  return currentHitPoints <= threshold.max ? threshold.atOrBelow : "otherwise";
}
