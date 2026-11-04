/**
 * Dispel Magic (SRD 5.2.1; edge-case family M17): choose one creature, object or
 * magical effect; any ongoing spell of level `autoMaxLevel` or lower on it ends (one
 * level more per slot above the spell's); for a higher one, the caster makes an
 * ability check with its spellcasting ability, DC 10 + that spell's level, and a
 * success ends it. Pure: which spells the target holds and what dispelling each
 * takes; the check is rolled at the table and the caller ends what it ends.
 */
import { foldCombatEffectOps } from "@/lib/combat-effects";
import { getSpellById } from "@/data/spells";
import type { CombatEffectOp } from "@/types/combat-effect";

export interface DispelRule {
  autoMaxLevel: number;
  perUpcast?: number;
}

export type DispelOutcome = { kind: "ends" } | { kind: "check"; dc: number };

/** What dispelling one spell of `spellLevel` takes, cast at `castLevel`. The base
 *  level the reach grows from is the rule's own (Dispel Magic: 3rd). */
export function dispelOutcome(
  rule: DispelRule,
  castLevel: number,
  spellLevel: number
): DispelOutcome {
  const reach =
    rule.autoMaxLevel +
    Math.max(0, castLevel - rule.autoMaxLevel) * (rule.perUpcast ?? 0);
  return spellLevel <= reach ? { kind: "ends" } : { kind: "check", dc: 10 + spellLevel };
}

export interface DispelOption {
  spellId: string;
  /** The level the spell was cast at (its base level when the effect doesn't say). */
  level: number;
  /** Every effect of that spell on the target: dispelling ends them together. */
  effectIds: string[];
  outcome: DispelOutcome;
}

/** The spells on `targetId` in the fight, one row per spell, in the order they
 *  landed, each with what dispelling it takes. */
export function dispelOptions(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  targetId: string,
  rule: DispelRule,
  castLevel: number
): DispelOption[] {
  const rows = new Map<string, DispelOption>();
  for (const effect of foldCombatEffectOps(operations)) {
    if (effect.target.combatantId !== targetId || effect.source.kind !== "spell")
      continue;
    const level = effect.source.castLevel ?? getSpellById(effect.source.id)?.level ?? 0;
    if (level <= 0) continue;
    const key = `${effect.source.id}:${String(level)}`;
    const row = rows.get(key);
    if (row) row.effectIds.push(effect.id);
    else {
      rows.set(key, {
        spellId: effect.source.id,
        level,
        effectIds: [effect.id],
        outcome: dispelOutcome(rule, castLevel, level),
      });
    }
  }
  return [...rows.values()];
}
