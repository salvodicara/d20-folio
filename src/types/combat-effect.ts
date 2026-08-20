/**
 * Campaign-scoped persistent combat effects: the KEPT cross-document seam.
 *
 * Deletion-map L2 (first half) verdict: this family survives as the SMALLEST
 * live seam for exactly the behavior the canonical mechanics world cannot
 * express under this app's split-owner write topology. Every kernel world is
 * single-document, the shared encounter material composes ADVERSARY
 * participants only, and a member client may write only its own character
 * documents, so a player-cast effect that mechanically lands on ANOTHER
 * combatant (Warding Bond's transfer to the caster, Death Ward's floor on an
 * ally, Bless dice on table-mates, source-projected conditions, Aid's HP
 * arithmetic) has no canonical carrier yet (`encounter-world-store.ts`, "The
 * PC party lease", documents why a multi-document commit cannot ride this
 * topology). Character-side SELF standings already ride the engine world:
 * `active-key`/`target-mark` standing occurrences project through
 * `world-standing-grants.ts` into the one grants union.
 *
 * The dead machinery this wave deleted from the seam: the `set-active`
 * compare-and-swap op kind (no producer ever shipped), the local
 * `CombatState.effectOps` mirror ledger and its store/codec plumbing (no
 * production writer), and the never-produced `authoredLifetime` field.
 *
 * Hit points and conditions use the fresh-read direct combat-state transaction.
 * Standing effects are different: they remain declarative for their lifetime
 * and are projected onto their target. The append-only operation log gives
 * every action an exact inverse without restoring a stale shared snapshot.
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
 * not rewrite a spell that is already running. NOTE: the field's producer was deleted
 * with the effect-program runtime (deletion-map L0/L1); the carrier stays because the
 * catalogue still declares binding-priced grants (Heroism's per-turn Temp HP) and the
 * grants evaluator still resolves it; re-supplying the snapshot is recorded residue. */
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
    }
  | {
      /** A condition projected by this exact source occurrence. Manual conditions
       * remain in the combat-state list and are never removed with this effect. */
      kind: "condition";
      conditionId: string;
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
