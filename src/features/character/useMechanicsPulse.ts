/**
 * Possessor-declared pulse of one armed engine program (the recurring zone or
 * reactive phase a spell left active): a replay-driven advance through the
 * coordinator, exposing the SAME `MechanicsCastState` protocol the cast hook
 * uses so `MechanicsCastModal` renders both flows unchanged.
 *
 * The advance authenticates against the AUTHORITY THE ROOT ALREADY CARRIES —
 * save DC and bindings stay frozen at their cast-time values, exactly as the
 * 2024 rules fix a spell's DC when it is cast.
 */

import { useCallback, useMemo, useState } from "react";

import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import {
  characterMaterialRef,
  characterSelfRef,
  characterWorldState,
  commitCharacterAction,
} from "@/lib/mechanics-world-store";
import { beginMechanicsCausalState } from "@/lib/mechanics-world";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import type {
  MechanicsCastPhase,
  MechanicsCastState,
} from "@/features/character/useMechanicsCast";
import type { CharacterMaterialState } from "@/types/material-state";
import type { MechanicsAnswer } from "@/types/mechanics-program";
import type { MechanicsCompilerResponse } from "@/types/mechanics-compiler";
import type { ProgramOccurrence } from "@/types/mechanic-occurrence";

/** One armed pulse phase of one active engine program root. */
export interface EnginePulseRef {
  readonly eventId: string;
  readonly execution: number;
  readonly lastTriggerEventId: string | null;
  readonly occurrenceId: string;
  readonly phaseId: string;
  /** The catalogue spell id when the root's capability is a catalogue spell. */
  readonly spellId: string | null;
}

function programRoots(
  world: Readonly<CharacterMaterialState>
): readonly (readonly [string, Readonly<ProgramOccurrence>])[] {
  return Object.entries(world.occurrences).flatMap(([occurrenceId, occurrence]) =>
    occurrence.kind === "program" && occurrence.ending === null
      ? [[occurrenceId, occurrence] as const]
      : []
  );
}

/** Every armed root-pulse phase in the character's persisted engine world. */
export function activeEnginePulses(
  world: Readonly<CharacterMaterialState> | null
): readonly EnginePulseRef[] {
  if (!world) return [];
  return programRoots(world).flatMap(([occurrenceId, root]) => {
    const program = root.authority.snapshot.program;
    if (!program) return [];
    const definition = root.authority.snapshot.ref.definition;
    const spellId =
      definition.kind === "catalogue" && definition.catalogueKind === "spell"
        ? definition.entityId
        : null;
    return program.phases.flatMap((phase) => {
      if (phase.trigger.kind !== "root-pulse") return [];
      const state = root.phaseState[phase.phaseId];
      if (!state) return [];
      return [
        {
          eventId: phase.trigger.eventId,
          execution: state.execution,
          lastTriggerEventId: state.lastTriggerEventId,
          occurrenceId,
          phaseId: phase.phaseId,
          spellId,
        },
      ];
    });
  });
}

export function useMechanicsPulse(
  pulse: Readonly<EnginePulseRef> | null,
  maxHp: number
): MechanicsCastState {
  const doc = useCharacterStore((state) => state.character);
  const updateSession = useCharacterStore((state) => state.updateSession);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const [answers, setAnswers] = useState<readonly MechanicsAnswer[]>([]);
  const [responses, setResponses] = useState<readonly MechanicsCompilerResponse[]>([]);

  const replay = useMemo(() => {
    if (!doc || uid === null || pulse === null) {
      return { phase: { kind: "unavailable", reason: "no-pulse" } as const };
    }
    const world = characterWorldState(doc, uid, maxHp);
    if (!world) {
      return { phase: { kind: "unavailable", reason: "world" } as const };
    }
    const material = characterMaterialRef(doc, uid);
    const root = world.occurrences[pulse.occurrenceId];
    if (root?.kind !== "program" || root.ending !== null) {
      return { phase: { kind: "unavailable", reason: "no-root" } as const };
    }
    const state = beginMechanicsCausalState({
      documents: [{ kind: "character", material, state: world }],
      scope: material,
    });
    if (!state.ok) {
      return { phase: { kind: "unavailable", reason: "causal-state" } as const };
    }
    const self = characterSelfRef(doc, uid);
    const triggerEventId = `${pulse.phaseId}.${pulse.execution + 1}`;
    const outcome = runMechanicsCausalAction({
      answers,
      authoritySnapshot: { definitions: [] },
      facts: [
        {
          address: ["hit-point-maximum"],
          expected: { present: true, value: maxHp },
          lifecycle: "commit-redo",
          owner: self,
        },
      ],
      frameAnswers: [],
      intent: {
        actionId: `pulse:${pulse.occurrenceId}:${pulse.phaseId}:${pulse.execution + 1}`,
        factGuards: [],
        frame: {
          authority: root.authority,
          invocation: {
            kind: "program-root",
            occurrence: {
              occurrence: { material, occurrenceId: pulse.occurrenceId },
              ordinal: root.ordinal,
            },
          },
          rootReceipt: {
            expected: {
              execution: pulse.execution,
              phaseId: pulse.phaseId,
              triggerEventId: pulse.lastTriggerEventId,
            },
            kind: "advance",
            next: {
              execution: pulse.execution + 1,
              phaseId: pulse.phaseId,
              triggerEventId,
            },
            root: {
              occurrence: { material, occurrenceId: pulse.occurrenceId },
              ordinal: root.ordinal,
            },
          },
          trigger: { eventId: pulse.eventId, kind: "root-pulse", triggerEventId },
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
      return { phase: { kind: "rejected", reason: "unexpected-response" } as const };
    }
    if (outcome.status === "rejected") {
      return { phase: { kind: "rejected", reason: outcome.reason } as const };
    }
    return { outcome, phase: { kind: "ready", outcome } as const, world };
  }, [answers, doc, maxHp, pulse, responses, uid]);

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

  const phase: MechanicsCastPhase = replay.phase;
  return { answer, answers, commit, phase, reset, respond };
}
