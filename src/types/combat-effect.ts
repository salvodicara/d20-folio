/**
 * Campaign-scoped persistent combat effects.
 *
 * Hit points and conditions use the fresh-read direct combat-state transaction. Standing
 * effects are different: they remain declarative for their lifetime and are
 * projected onto their target. The append-only operation log gives every action
 * an exact inverse without restoring a stale shared snapshot.
 */

export type CombatantRef =
  | {
      kind: "pc";
      combatantId: string;
      memberUid: string;
      characterId: string;
    }
  | {
      kind: "monster";
      combatantId: string;
      /** Compatibility identity for an un-conformed legacy monster group. */
      tokenIndex?: number;
    };

export type CombatEffectDuration =
  | {
      kind: "concentration";
      actorId: string;
      sourceId: string;
    }
  | {
      kind: "turn-boundary";
      combatantId: string;
      round: number;
      phase: "turn-start" | "turn-end";
    }
  | { kind: "encounter" };

/** Values frozen when an effect is created because they belong to the source, not the
 * recipient. They are deliberately numeric snapshots: later source-sheet changes must
 * not rewrite a spell that is already running. */
export interface CombatEffectBindings {
  spellcastingModifier?: number;
}

/** Exact state delta performed together with applying an effect. Persisting the landed
 * delta makes revocation a true inverse even if the catalogue rule changes meanwhile. */
export interface CombatEffectAppliedState {
  currentHpDelta?: number;
}

export type CombatEffectPayload =
  | {
      kind: "grant-group";
      activeKey: string;
      /** The short successor state created by a data-declared end effect. */
      phase?: "active" | "aftereffect";
    }
  | {
      /** A caster-owned rider whose selected creature identity matters (Hex / Mark). */
      kind: "target-mark";
      activeKey: string;
      scope: "marked" | "cursed" | "vowed";
    };

export interface ActiveCombatEffect {
  /** Opaque instance identity. Undo/revoke always addresses this exact instance. */
  id: string;
  actor: CombatantRef;
  target: CombatantRef;
  source: {
    kind: "spell" | "feature";
    id: string;
    actionId: string;
    castLevel?: number;
  };
  /** Stable catalogue reference; grants themselves remain owned by the source data. */
  payload: CombatEffectPayload;
  bindings?: CombatEffectBindings;
  applied?: CombatEffectAppliedState;
  duration: CombatEffectDuration;
}

export type CombatEffectOp =
  | { id: string; kind: "apply"; effect: ActiveCombatEffect }
  | {
      id: string;
      kind: "revoke";
      effectId: string;
      actorId: string;
      targetId: string;
    };

export interface EncounterPosition {
  round: number;
  currentCombatantId: string | null;
  phase: "turn-start" | "turn-end";
  order: ReadonlyArray<string>;
}
