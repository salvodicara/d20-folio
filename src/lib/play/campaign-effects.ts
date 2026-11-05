/**
 * The campaign's effects out of a fight (`campaigns/{id}/effects`): a state one
 * creature left on another that lasts on the game clock (Mage Armor on an ally, 8
 * hours), read through the campaign clock (`clockFor`). One identity across the fight
 * and the store: an effect that outlasts its fight moves here with the same id, and a
 * fight reads the store rather than copying it. Pure.
 */
import type { CombatStandingEffectSpec } from "@/lib/combat-resolution";
import { foldCombatEffectOps } from "@/lib/combat-effects";
import { ROUNDS_PER_MINUTE } from "@/lib/spell-duration";
import type {
  ActiveCombatEffect,
  CombatantRef,
  CombatEffectOp,
  EncounterPosition,
} from "@/types/combat-effect";

/** A stored campaign effect. `ended`: over before its time, by its Concentration
 *  ending or by a revoke; kept so an undo can bring the same occurrence back. */
export type CampaignEffectDoc = ActiveCombatEffect & {
  ended?: "concentration" | "revoked";
};

/** The live campaign effects on `targetId` at the campaign minute `minute`. */
export function campaignEffectsFor(
  docs: ReadonlyArray<CampaignEffectDoc>,
  targetId: string,
  minute: number
): ActiveCombatEffect[] {
  return docs.flatMap(({ ended, ...effect }) =>
    !ended &&
    effect.target.combatantId === targetId &&
    effect.duration.kind === "game-clock" &&
    effect.duration.untilMinute > minute
      ? [effect]
      : []
  );
}

/** The live campaign effects `actorId`'s Concentration on `sourceId` holds. */
export function concentrationLinkedIds(
  docs: ReadonlyArray<CampaignEffectDoc>,
  actorId: string,
  sourceId: string
): string[] {
  return docs.flatMap((doc) =>
    !doc.ended &&
    doc.duration.kind === "game-clock" &&
    doc.duration.concentration?.actorId === actorId &&
    doc.duration.concentration.sourceId === sourceId
      ? [doc.id]
      : []
  );
}

/**
 * The actor's effects that outlast the fight ending at `position`, on the campaign
 * clock from `minute`: same identity, whole minutes left. What ends with the fight (an
 * `encounter` duration), has under a minute left, is a zone or changed hit points stays
 * behind; a Concentration
 * effect keeps its link and runs for the caster's own Concentration countdown.
 */
export function outlastingFightEffects(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  position: EncounterPosition,
  input: {
    actorId: string;
    minute: number;
    concentrationRoundsLeft: (sourceId: string) => number | undefined;
  }
): ActiveCombatEffect[] {
  return foldCombatEffectOps(operations, position).flatMap((effect) => {
    if (effect.actor.combatantId !== input.actorId) return [];
    // A zone stays on its battlefield; a state that changed hit points stays with the
    // fight that can undo it.
    if (effect.payload.kind === "zone" || effect.applied) return [];
    const { duration } = effect;
    const rounds =
      duration.kind === "turn-boundary"
        ? duration.round - position.round
        : duration.kind === "concentration"
          ? input.concentrationRoundsLeft(duration.sourceId)
          : undefined;
    const minutes = rounds === undefined ? 0 : Math.floor(rounds / ROUNDS_PER_MINUTE);
    if (minutes < 1) return [];
    return [
      {
        ...effect,
        duration: {
          kind: "game-clock" as const,
          untilMinute: input.minute + minutes,
          ...(duration.kind === "concentration"
            ? {
                concentration: {
                  actorId: duration.actorId,
                  sourceId: duration.sourceId,
                },
              }
            : {}),
        },
      },
    ];
  });
}

/** The caster's Concentration as last seen, and what its last end ended, so the undo
 *  of that end can bring the same effects back. */
export interface ConcentrationMemo {
  holding: string;
  ended: { sourceId: string; ids: string[] } | null;
}

/**
 * The caster's Concentration is now `current` (a spell id, or "" for none). The first
 * look only records it (a reload is not a drop). When it moves on, the campaign effects
 * the old one held end; when it comes back to the spell whose end ended effects (the
 * undo of that end), those effects come back.
 */
export function concentrationChange(
  memo: ConcentrationMemo | null,
  current: string,
  docs: ReadonlyArray<CampaignEffectDoc>,
  actorId: string
): { end: string[]; reinstate: string[]; memo: ConcentrationMemo } {
  if (!memo) return { end: [], reinstate: [], memo: { holding: current, ended: null } };
  if (memo.holding === current) return { end: [], reinstate: [], memo };
  const end = memo.holding ? concentrationLinkedIds(docs, actorId, memo.holding) : [];
  const reinstate =
    memo.ended && memo.ended.sourceId === current && current ? memo.ended.ids : [];
  return {
    end,
    reinstate,
    memo: {
      holding: current,
      ended: end.length > 0 ? { sourceId: memo.holding, ids: end } : null,
    },
  };
}

/** One identity across the fight and the store: the fight's effects, plus the
 *  store's that the fight doesn't already hold. */
export function withCampaignEffects(
  fight: ReadonlyArray<ActiveCombatEffect>,
  store: ReadonlyArray<ActiveCombatEffect>
): ActiveCombatEffect[] {
  const ids = new Set(fight.map((effect) => effect.id));
  return [...fight, ...store.filter((effect) => !ids.has(effect.id))];
}

/**
 * What a cast out of a fight leaves on the party members it names, on the campaign
 * clock from `minute`: its countdown in whole minutes (Mage Armor, 8 hours), or, held
 * by Concentration, the spell's Concentration budget with the link to it. A state
 * bound to the turn order, or one with under a minute, leaves nothing out of a fight.
 */
export function standingOnClock(input: {
  spec: CombatStandingEffectSpec;
  caster: CombatantRef;
  targets: ReadonlyArray<CombatantRef>;
  minute: number;
  /** The spell's Concentration budget at the level cast, for a Concentration state. */
  concentrationRounds?: number | null;
  spellcastingModifier?: number;
  newId: () => string;
}): ActiveCombatEffect[] {
  const { spec, caster } = input;
  if (spec.lifetime.turnBoundary) return [];
  const rounds = spec.lifetime.concentration
    ? (input.concentrationRounds ?? spec.lifetime.maxRounds)
    : spec.lifetime.maxRounds;
  const minutes = rounds == null ? 0 : Math.floor(rounds / ROUNDS_PER_MINUTE);
  if (minutes < 1) return [];
  return input.targets.map((target) => ({
    id: input.newId(),
    actor: caster,
    target,
    source: spec.source,
    payload: spec.payload,
    ...(input.spellcastingModifier !== undefined
      ? { bindings: { spellcastingModifier: input.spellcastingModifier } }
      : {}),
    duration: {
      kind: "game-clock" as const,
      untilMinute: input.minute + minutes,
      ...(spec.lifetime.concentration
        ? { concentration: { actorId: caster.combatantId, sourceId: spec.source.id } }
        : {}),
    },
  }));
}
