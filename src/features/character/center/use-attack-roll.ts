/**
 * The character's ATTACK-roll state right now, netted (RAW): grant clauses
 * (`deriveAdvantageChips` over the aggregate) merged with the active conditions'
 * self-side clauses (`resolveConditionEffects`, e.g. Frightened → Disadvantage on
 * attacks) and unproficient armour. One derivation read by the Play board (every
 * attack card's gloss) and by the character's status row (the "Disadvantage on
 * attack rolls" line under a condition), so the two can never disagree.
 */
import { useMemo } from "react";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { armorDisadvantageClauses } from "@/lib/smart-tracker";
import {
  deriveAdvantageChips,
  deriveAttackRollView,
  NO_ATTACK_ROLL,
  type AdvantageChip,
  type AttackRollView,
} from "@/lib/views/sheet-view";
import { useTurnState } from "./turn-state";

export function useBaseAttackChips(): AdvantageChip[] {
  const character = useCharacterStore((s) => s.character);
  const { round } = useTurnState();
  const nextAttackAdvantage = useCombatStore((s) => s.nextAttackAdvantage);
  return useMemo<AdvantageChip[]>(() => {
    if (!character) return [];
    const aggregate = aggregateCharacterGrants(character.character, character.session);
    const cond = resolveConditionEffects(effectiveSessionConditions(character.session));
    // S13 — wearing armor the class lacks proficiency with imposes Disadvantage on
    // STR/DEX attacks (+ checks/saves); merged like the condition clauses so it
    // nets into the attack-roll state alongside Frightened/Poisoned/etc.
    const armorDis = armorDisadvantageClauses(character);
    const attackChips = deriveAdvantageChips(aggregate, {
      advantages: cond.advantages,
      disadvantages: [...cond.disadvantages, ...armorDis],
    })
      .filter((c) => c.rollType === "attack")
      // FRONTIER-S3 — a `round1` clause (Assassinate's first-round attack
      // advantage) applies ONLY in combat round 1, then auto-clears from round 2+.
      // A permanent clause has no `round1` flag and always applies.
      .filter((c) => !c.round1 || round === 1);
    if (nextAttackAdvantage) {
      attackChips.push({
        sourceId: "turn-next-attack-advantage",
        mode: "advantage",
        rollType: "attack",
        vs: "next-attack",
        description: { lit: { en: "Next attack", it: "Prossimo attacco" } },
      });
    }
    // PS-J — ONLY a blanket clause (no `scope`) may become the card's verdict; a
    // scoped one is netted against that verdict and stated with its scope instead
    // (`combatGloss`), because the sheet models no enemies and cannot know whether
    // it applies to this swing.
    return attackChips;
  }, [character, round, nextAttackAdvantage]);
}

/** The netted attack-roll view over {@link useBaseAttackChips}. */
export function useAttackRollView(baseAttackChips: AdvantageChip[]): AttackRollView {
  const character = useCharacterStore((s) => s.character);
  return useMemo(
    () => (character ? deriveAttackRollView(baseAttackChips) : NO_ATTACK_ROLL),
    [character, baseAttackChips]
  );
}
