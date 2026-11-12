/**
 * What a use leaves standing on the creatures it was aimed at, as encounter effects:
 * a buff on its chosen recipient (Warding Bond's `recipient: "selected"` state) or a
 * mark on its target (Hunter's Mark, Hex). One effect per target, with the duration
 * its lifetime says (held by Concentration, until a turn edge of the caster, a number
 * of rounds, or the fight) and the caster's spellcasting modifier frozen on it, so a
 * rule inside the state reads the caster's number, never the holder's. Pure.
 */
import {
  combatResolutionSpec,
  type CombatStandingEffectSpec,
} from "@/lib/combat-resolution";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { turnBoundaryAfter } from "@/lib/combat-effects";
import type {
  ActiveCombatEffect,
  CombatantRef,
  EncounterPosition,
} from "@/types/combat-effect";

export function standingEffectsForTargets(input: {
  spec: CombatStandingEffectSpec;
  caster: CombatantRef;
  targets: ReadonlyArray<CombatantRef>;
  position: EncounterPosition;
  spellcastingModifier?: number;
  newId: () => string;
}): ActiveCombatEffect[] {
  const { spec, caster, position } = input;
  const casterId = caster.combatantId;
  const edge = spec.lifetime.turnBoundary;
  const after = edge
    ? turnBoundaryAfter(casterId, edge.turns, edge.phase, position)
    : null;
  // "Your next turn" is never the one under way: cast on the caster's own turn, the
  // end of the next turn is the following round's (Vicious Mockery, Guiding Bolt; the
  // same rule as a condition's turn-edge lifetime in the tray).
  const underWay =
    after !== null &&
    edge?.phase === "turn-end" &&
    position.currentCombatantId === casterId &&
    after.round === position.round;
  const boundary = after && underWay ? { ...after, round: after.round + 1 } : after;
  const duration: ActiveCombatEffect["duration"] = spec.lifetime.concentration
    ? { kind: "concentration", actorId: casterId, sourceId: spec.source.id }
    : (boundary ??
      (spec.lifetime.maxRounds !== undefined
        ? {
            kind: "turn-boundary",
            combatantId: casterId,
            round: position.round + spec.lifetime.maxRounds,
            phase: "turn-end",
          }
        : { kind: "encounter" }));
  return input.targets.map((target) => ({
    id: input.newId(),
    actor: caster,
    target,
    source: spec.source,
    payload: spec.payload,
    ...(input.spellcastingModifier !== undefined
      ? { bindings: { spellcastingModifier: input.spellcastingModifier } }
      : {}),
    duration,
  }));
}

/**
 * The state a use leaves on its targets the moment it commits: an automatic use's
 * (no attack, no save: Bless, Warding Bond, a mark), at the level it was cast. One
 * that lands only on a failed save or a hit waits for its outcome; null when the use
 * leaves nothing standing.
 */
export function standingAtCommit(
  action: ResolvedAction,
  castLevel?: number
): CombatStandingEffectSpec | null {
  const resolution = combatResolutionSpec(action);
  const standing = resolution.standingEffect;
  if (!standing || resolution.kind !== "automatic") return null;
  return castLevel !== undefined && standing.source.kind === "spell"
    ? { ...standing, source: { ...standing.source, castLevel } }
    : standing;
}
