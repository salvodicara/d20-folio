/**
 * One replay-driven cast through the deterministic mechanics engine.
 *
 * The hook owns only the collected answer/response ledgers; every render-time
 * truth (requirement, outcome) is recomputed by replaying the coordinator over
 * the character's persisted world, so the UI can never disagree with the
 * engine. Committing routes the planned action through the canonical journal
 * reducer and the store's ordinary session update (auto-save included).
 */

import { useCallback, useMemo, useState } from "react";

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { mechanicsAuthorityDefinitionFingerprint } from "@/lib/mechanics-authority";
import {
  mechanicsDefinitionFactAddress,
  mechanicsInstallationFactAddress,
} from "@/lib/mechanics-authority-ref";
import { mechanicsCapabilitySnapshotFingerprint } from "@/lib/mechanics-capability";
import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import {
  characterMaterialRef,
  characterSlotDefinitionFacts,
  characterSpellCapability,
  characterWorldState,
  commitCharacterAction,
  type CharacterCastDerived,
} from "@/lib/mechanics-world-store";
import { beginMechanicsCausalState } from "@/lib/mechanics-world";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import type { MechanicsAuthorityDefinition } from "@/types/mechanics-authority";
import type { MechanicsCoordinationResult } from "@/types/mechanics-coordinator";
import type { MechanicsAnswer, MechanicsRequirement } from "@/types/mechanics-program";
import type { MechanicsCompilerResponse } from "@/types/mechanics-compiler";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";

function authorityDefinition(
  authority: Readonly<MechanicsProgramAuthorityReceipt>
): MechanicsAuthorityDefinition {
  const definition: MechanicsAuthorityDefinition = {
    actorSpec: { kind: "role", role: "owner" },
    anchors: authority.anchors,
    definitionGuards: [
      {
        address: mechanicsDefinitionFactAddress(authority.snapshot.ref.definition),
        expected: {
          present: true,
          value: mechanicsCapabilitySnapshotFingerprint(authority.snapshot),
        },
        lifecycle: "commit",
        owner: authority.installation.owner,
      },
    ],
    installation: authority.installation,
    installationGuards: [],
    owner: authority.installation.owner,
    snapshot: authority.snapshot,
    source: authority.source,
    staticBindings: authority.staticBindings,
  };
  return {
    ...definition,
    installationGuards: [
      {
        address: mechanicsInstallationFactAddress(authority.installation),
        expected: {
          present: true,
          value: mechanicsAuthorityDefinitionFingerprint(definition),
        },
        lifecycle: "commit",
        owner: authority.installation.owner,
      },
    ],
  };
}

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
  readonly commit: () => boolean;
  readonly phase: MechanicsCastPhase;
  readonly reset: () => void;
  readonly respond: (value: MechanicsCompilerResponse) => void;
}

export function useMechanicsCast(
  spellId: string,
  derived: Readonly<CharacterCastDerived>
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
    const world = characterWorldState(doc, uid, derived.maxHp);
    if (!world) {
      return { phase: { kind: "unavailable", reason: "world" } as const };
    }
    const capability = characterSpellCapability(doc, uid, spellId, derived);
    if (!capability) {
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
    const outcome = runMechanicsCausalAction({
      answers,
      authoritySnapshot: {
        definitions: [authorityDefinition(capability.authority)],
      },
      facts: [...capability.facts, ...characterSlotDefinitionFacts(doc, uid, world)],
      frameAnswers: [],
      intent: {
        actionId: `cast:${spellId}:${canonicalFingerprint({ answers, spellId })}`,
        factGuards: [],
        frame: {
          authority: capability.authority,
          invocation: {
            installation: capability.authority.installation,
            kind: "installed-capability",
          },
          rootReceipt: {
            kind: "create",
            materialEpoch: world.epoch,
            next: { execution: 1, phaseId: "resolve", triggerEventId: null },
            root: {
              occurrence: {
                material,
                occurrenceId: `cast-${spellId}-${world.nextOccurrenceOrdinal}`,
              },
              ordinal: world.nextOccurrenceOrdinal,
            },
          },
          trigger: { kind: "invocation" },
        },
      },
      responses,
      state: state.value,
      turnEconomy: [],
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
  }, [answers, derived, doc, responses, spellId, uid]);

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
  const commit = useCallback((): boolean => {
    if (!doc || uid === null || replay.phase.kind !== "ready") return false;
    const outcome = replay.phase.outcome;
    if (!outcome.action || !("world" in replay) || !replay.world) return false;
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
    if (!committed) return false;
    updateSession(committed.session);
    reset();
    return true;
  }, [doc, replay, reset, uid, updateSession]);

  return { answer, answers, commit, phase: replay.phase, reset, respond };
}
