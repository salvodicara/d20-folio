/**
 * The next-attack note (headless): a creature whose OWN next attack roll has
 * Advantage or Disadvantage from a one-shot state on it, spent by that roll (Ray of
 * Enfeeblement on a success, Sap, Vicious Mockery). One note per creature, with the
 * states' sources and the effects «Used» revokes.
 */
import { nextAttackModes } from "@/lib/combat-effects";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";

export interface NextAttackNote {
  targetId: string;
  mode: "advantage" | "disadvantage";
  sources: ReadonlyArray<Pick<ActiveCombatEffect["source"], "kind" | "id">>;
  effectIds: ReadonlyArray<string>;
}

export function nextAttackNotes(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  targetIds: ReadonlyArray<string>
): NextAttackNote[] {
  return targetIds.flatMap((targetId) => {
    const modes = nextAttackModes(operations, targetId);
    const kinds = new Set(modes.map((m) => m.mode));
    // Advantage and Disadvantage together cancel: a straight roll, nothing to say.
    const [mode] = kinds;
    if (kinds.size !== 1 || !mode) return [];
    return [
      {
        targetId,
        mode,
        sources: modes.map((m) => ({ kind: m.sourceKind, id: m.sourceId })),
        effectIds: modes.map((m) => m.effect.id),
      },
    ];
  });
}
