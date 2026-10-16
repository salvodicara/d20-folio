/**
 * What a creature's own condition does to attacks made AGAINST it (the
 * `against-self` side of `CONDITION_RULES`): Advantage or Disadvantage on every
 * attack, Disadvantage for attackers that can't see you (Invisible), Prone's
 * within-5-ft / beyond split, and the automatic Critical Hit within 5 ft
 * (Paralyzed, Unconscious). Read straight from the rules table, so a condition
 * row is the only place such a rule lives. Pure ids and numbers.
 */
import { CONDITION_RULES } from "@/lib/condition";
import type { ConditionRollMode } from "@/types/condition";

export type AttacksAgainstLine =
  /** Every attack roll against you has this mode. */
  | { kind: "roll"; mode: ConditionRollMode }
  /** Attackers that can't see you roll with this mode. */
  | { kind: "unseen"; mode: ConditionRollMode }
  /** Within `thresholdFt` one mode, farther away the other (Prone). */
  | {
      kind: "range";
      thresholdFt: number;
      within: ConditionRollMode;
      beyond: ConditionRollMode;
    }
  /** A hit from within `distanceFt` is a Critical Hit. */
  | { kind: "autoCrit"; distanceFt: number };

/** The attacks-against lines one condition id carries; [] for none or unknown. */
export function attacksAgainstSelf(conditionId: string): AttacksAgainstLine[] {
  if (!Object.hasOwn(CONDITION_RULES, conditionId)) return [];
  const rule = CONDITION_RULES[conditionId as keyof typeof CONDITION_RULES];
  if (rule.kind !== "occurrence") return [];
  const lines: AttacksAgainstLine[] = [];
  for (const effect of rule.effects) {
    // An against-self roll mode is always an attack roll (the table's type).
    if (effect.kind === "roll-mode" && effect.perspective === "against-self") {
      lines.push({ kind: "roll", mode: effect.mode });
    }
  }
  for (const req of rule.requirements) {
    switch (req.kind) {
      case "visibility-attack-roll":
        if (req.perspective === "against-self")
          lines.push({ kind: "unseen", mode: req.mode });
        break;
      case "prone-attacks-against":
        lines.push({
          kind: "range",
          thresholdFt: req.thresholdFt,
          within: req.within,
          beyond: req.beyond,
        });
        break;
      case "automatic-critical-on-hit":
        lines.push({ kind: "autoCrit", distanceFt: req.distanceFt });
        break;
    }
  }
  return lines;
}
