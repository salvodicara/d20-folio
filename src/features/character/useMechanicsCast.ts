/**
 * One replay-driven engine action through the deterministic mechanics engine.
 *
 * The hook owns only the collected answer/response ledgers; every render-time
 * truth (requirement, outcome) is recomputed by replaying the coordinator over
 * the character's persisted world, so the UI can never disagree with the
 * engine. Committing routes the planned action through the canonical journal
 * reducer and the store's ordinary session update (auto-save included).
 *
 * `useMechanicsEngineAction` is the shared protocol core; `useMechanicsCast`
 * closes it over a transcribed SPELL capability, and the actions surface closes
 * it over feature-action/weapon-attack capabilities (`EngineActionFlow`).
 */

import { useCallback, useMemo, useState } from "react";

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import {
  characterMaterialRef,
  characterSlotDefinitionFacts,
  characterSpellCapability,
  characterTrackerSeeds,
  characterTurnEconomy,
  characterWorldState,
  commitCharacterAction,
  engineSelfDamage,
  mechanicsAuthorityDefinition,
  type CharacterCastCapability,
  type CharacterCastDerived,
} from "@/lib/mechanics-world-store";
import { beginMechanicsCausalState } from "@/lib/mechanics-world";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import type { ActionFactGuard } from "@/types/action-journal";
import type { CharacterDoc } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";
import type { MechanicsCoordinationResult } from "@/types/mechanics-coordinator";
import type { MechanicsAnswer, MechanicsRequirement } from "@/types/mechanics-program";
import type { MechanicsCompilerResponse } from "@/types/mechanics-compiler";

export type MechanicsCastPhase =
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "collecting"; readonly requirement: MechanicsRequirement }
  | {
      readonly kind: "ready";
      readonly outcome: Extract<MechanicsCoordinationResult, { status: "complete" }>;
    }
  | { readonly kind: "rejected"; readonly reason: string };

export interface MechanicsCastState {
  readonly answers: readonly MechanicsAnswer[];
  readonly answer: (value: MechanicsAnswer) => void;
  /** Commit the planned action; returns its journal action id (the undo
   *  pairing — `registerEngineCommitUndo` reverses exactly it), null on any
   *  rejection. Truthy exactly when committed. */
  readonly commit: () => string | null;
  readonly phase: MechanicsCastPhase;
  readonly reset: () => void;
  readonly respond: (value: MechanicsCompilerResponse) => void;
}

/** One engine-executable capability closed for the replay protocol. */
export interface EngineActionSource {
  readonly capability: CharacterCastCapability;
  /** Facts beyond the capability's own (a spell's slot definitions). */
  readonly extraFacts?: readonly ActionFactGuard[];
  /** Stable id stem for the run's action/occurrence identities. */
  readonly key: string;
}

/**
 * The shared replay protocol over ANY engine capability: derive the world,
 * close the capability, and re-run the coordinator with the growing answer
 * ledger until the planned action is complete, then commit it canonically.
 */
export function useMechanicsEngineAction(
  sourceFor: (
    doc: Readonly<CharacterDoc>,
    uid: string,
    world: Readonly<CharacterMaterialState>
  ) => EngineActionSource | null
): MechanicsCastState {
  const doc = useCharacterStore((state) => state.character);
  const updateSession = useCharacterStore((state) => state.updateSession);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const [answers, setAnswers] = useState<readonly MechanicsAnswer[]>([]);
  const [responses, setResponses] = useState<readonly MechanicsCompilerResponse[]>([]);

  const replay = useMemo(() => {
    if (!doc || uid === null) {
      return { phase: { kind: "unavailable", reason: "no-character" } as const };
    }
    const world = characterWorldState(
      doc,
      uid,
      doc.character.hp.max,
      {},
      characterTrackerSeeds(doc)
    );
    if (!world) {
      return { phase: { kind: "unavailable", reason: "world" } as const };
    }
    const source = sourceFor(doc, uid, world);
    if (!source) {
      return { phase: { kind: "unavailable", reason: "not-transcribed" } as const };
    }
    const material = characterMaterialRef(doc, uid);
    const state = beginMechanicsCausalState({
      documents: [{ kind: "character", material, state: world }],
      scope: material,
    });
    if (!state.ok) {
      return { phase: { kind: "unavailable", reason: "causal-state" } as const };
    }
    const invocationId = `${source.key}-${world.nextOccurrenceOrdinal}`;
    const outcome = runMechanicsCausalAction({
      answers,
      authoritySnapshot: {
        definitions: [mechanicsAuthorityDefinition(source.capability.authority)],
      },
      facts: [...source.capability.facts, ...(source.extraFacts ?? [])],
      frameAnswers: [],
      intent: {
        actionId: `${invocationId}:${canonicalFingerprint({ answers, key: source.key })}`,
        factGuards: [],
        frame: {
          authority: source.capability.authority,
          invocation: {
            installation: source.capability.authority.installation,
            kind: "installed-capability",
          },
          rootReceipt: {
            kind: "create",
            materialEpoch: world.epoch,
            next: { execution: 1, phaseId: "resolve", triggerEventId: null },
            root: {
              occurrence: {
                material,
                occurrenceId: invocationId,
              },
              ordinal: world.nextOccurrenceOrdinal,
            },
          },
          trigger: { kind: "invocation" },
        },
      },
      responses,
      state: state.value,
      // The character itself is the one combatant a solo dispatch may claim
      // for; a turn-claim step compiles against this live projection and its
      // claim commits against the solo encounter's own economy ledger.
      turnEconomy: characterTurnEconomy(doc, uid),
    });
    if (outcome.status === "needs-answer") {
      return outcome.requirement
        ? { phase: { kind: "collecting", requirement: outcome.requirement } as const }
        : { phase: { kind: "rejected", reason: "missing-requirement" } as const };
    }
    if (outcome.status === "needs-response") {
      return {
        phase: { kind: "rejected", reason: "unexpected-response" } as const,
      };
    }
    if (outcome.status === "rejected") {
      return { phase: { kind: "rejected", reason: outcome.reason } as const };
    }
    return { outcome, phase: { kind: "ready", outcome } as const, world };
  }, [answers, doc, responses, sourceFor, uid]);

  const answer = useCallback((value: MechanicsAnswer) => {
    setAnswers((current) => [...current, value]);
  }, []);
  const respond = useCallback((value: MechanicsCompilerResponse) => {
    setResponses((current) => [...current, value]);
  }, []);
  const reset = useCallback(() => {
    setAnswers([]);
    setResponses([]);
  }, []);
  const commit = useCallback((): string | null => {
    if (!doc || uid === null || replay.phase.kind !== "ready") return null;
    const outcome = replay.phase.outcome;
    if (!outcome.action || !("world" in replay) || !replay.world) return null;
    const committed = commitCharacterAction(
      doc,
      uid,
      replay.world,
      outcome.action,
      outcome.action.guards.facts.map((fact) => ({
        actual: fact.expected,
        address: fact.address,
        owner: fact.owner,
      }))
    );
    if (!committed) return null;
    updateSession(committed.session);
    // Damage the engine landed on the character itself surfaces the SAME
    // entered-d20 Concentration prompt seam the legacy damage path owns
    // (queued after the mirror so the 0-HP outright break reads final HP).
    const selfDamage = engineSelfDamage(replay.world, committed.world);
    if (selfDamage > 0) {
      useCharacterStore.getState().queueConcentrationSaveForDamage(selfDamage);
    }
    reset();
    return outcome.action.id;
  }, [doc, replay, reset, uid, updateSession]);

  return { answer, answers, commit, phase: replay.phase, reset, respond };
}

export function useMechanicsCast(
  spellId: string,
  derived: Readonly<CharacterCastDerived>
): MechanicsCastState {
  const sourceFor = useCallback(
    (
      doc: Readonly<CharacterDoc>,
      uid: string,
      world: Readonly<CharacterMaterialState>
    ): EngineActionSource | null => {
      const capability = characterSpellCapability(doc, uid, spellId, derived);
      if (!capability) return null;
      return {
        capability,
        extraFacts: characterSlotDefinitionFacts(doc, uid, world),
        key: `cast-${spellId}`,
      };
    },
    [derived, spellId]
  );
  return useMechanicsEngineAction(sourceFor);
}
