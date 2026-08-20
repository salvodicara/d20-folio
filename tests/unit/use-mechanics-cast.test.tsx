import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { MOCK_CHARACTER } from "@/lib/mock";
import {
  useMechanicsCast,
  useMechanicsEngineAction,
  type EngineActionSource,
  type MechanicsCastPhase,
} from "@/features/character/useMechanicsCast";
import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { concentrationValue } from "@/lib/concentration";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import { conformMechanicsProgramAuthorityReceipt } from "@/lib/mechanics-program-receipt";
import { characterSelfRef } from "@/lib/mechanics-world-store";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import type { User } from "firebase/auth";

const DERIVED = {
  attackBonus: 7,
  castingModifier: 3,
  characterLevel: 3,
  maxHp: 60,
  saveDc: 15,
} as const;

afterEach(() => {
  useCharacterStore.setState({ character: null });
  useAuthStore.setState({ user: null });
});

describe("useMechanicsCast", () => {
  it("walks the replay protocol from slot requirement to a committable heal", () => {
    useCharacterStore.setState({
      character: structuredClone(MOCK_CHARACTER),
      loading: false,
      readonly: false,
    });
    useAuthStore.setState({ user: { uid: "test-uid" } as User });

    const { result } = renderHook(() => useMechanicsCast("cure-wounds", DERIVED));
    const phase = (): MechanicsCastPhase => result.current.phase;
    const initial = phase();
    expect(initial.kind).toBe("collecting");
    if (initial.kind !== "collecting") return;
    expect(initial.requirement.kind).toBe("resource");

    act(() => {
      result.current.answer({
        inputId: "slot",
        kind: "resource",
        resource: {
          character: {
            characterId: MOCK_CHARACTER.id,
            kind: "character-play",
            uid: "test-uid",
          },
          kind: "standard-spell-slot",
          level: 1,
        },
      });
    });
    const phaseAfterSlot = phase();
    expect(phaseAfterSlot.kind).toBe("collecting");
    if (phaseAfterSlot.kind !== "collecting") return;
    expect(phaseAfterSlot.requirement.kind).toBe("entities");

    act(() => {
      result.current.answer({
        inputId: "targets",
        kind: "entities",
        targets: [
          {
            entityId: "self",
            material: {
              characterId: MOCK_CHARACTER.id,
              kind: "character-play",
              uid: "test-uid",
            },
          },
        ],
      });
    });
    const phaseAfterTargets = phase();
    expect(phaseAfterTargets.kind).toBe("collecting");
    if (phaseAfterTargets.kind !== "collecting") return;
    const requirement = phaseAfterTargets.requirement;
    expect(requirement.kind).toBe("dice");
    if (requirement.kind !== "dice") return;

    const trailIds = [
      ...new Set(
        [...JSON.stringify(requirement).matchAll(/"trailId":"([^"]+)"/g)].map(
          (match) => match[1] ?? ""
        )
      ),
    ];
    act(() => {
      result.current.answer({
        inputId: requirement.inputId,
        kind: "dice",
        requests: requirement.requests.map(({ identity }) => ({
          identity,
          observation: {
            aggregates: [],
            trails: trailIds.map((trailId) => ({
              initialFace: 5,
              steps: [],
              trailId,
            })),
          },
          payments: [],
        })),
      });
    });
    expect(phase().kind).toBe("ready");

    let committed: string | null = null;
    act(() => {
      committed = result.current.commit();
    });
    expect(committed).not.toBeNull();
    const session = useCharacterStore.getState().character?.session;
    expect(session?.world).toBeDefined();
    const hpBefore = MOCK_CHARACTER.session.hp.current;
    expect(session?.hp.current).toBeGreaterThanOrEqual(hpBefore);
  });

  // Deliverable: an engine commit that damages the character ITSELF must
  // surface the SAME entered-d20 Concentration prompt seam the legacy damage
  // path owns — wired through `queueConcentrationSaveForDamage` on commit.
  it("queues the concentration save when an engine commit damages the caster", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.session.concentration = concentrationValue("hold-person");
    doc.session.hp = { current: 40, temp: 0 };
    useCharacterStore.setState({
      character: doc,
      combatPendingConcentrationSaves: [],
      loading: false,
      readonly: false,
    });
    useAuthStore.setState({ user: { uid: "test-uid" } as User });

    // A closed one-step program dealing 9 automatic force damage to its owner.
    const program = conformMechanicsProgram({
      id: "test-self-damage",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              delivery: "automatic",
              kind: "damage",
              parts: [
                {
                  amount: { expression: { kind: "fixed", value: 9 }, kind: "integer" },
                  damageType: "force",
                  partId: "burn",
                },
              ],
              stepId: "self-burn",
              target: { kind: "role", role: "owner" },
              traits: [],
              when: null,
            },
            { kind: "end-program", stepId: "finish", when: null },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    expect(program).not.toBeNull();
    if (!program) return;
    const sourceFor = (document: Readonly<CharacterDoc>, uid: string) => {
      const self = characterSelfRef(document, uid);
      const capability = {
        capabilityId: program.id,
        definition: {
          catalogueKind: "spell" as const,
          entityId: program.id,
          kind: "catalogue" as const,
          mechanicsRevision: canonicalFingerprint({ program }),
        },
        kind: "program" as const,
      };
      const authority = conformMechanicsProgramAuthorityReceipt({
        anchors: {
          activator: self,
          caster: self,
          owner: self,
          source: self,
          target: self,
        },
        installation: {
          capability,
          generation: 1,
          installationId: program.id,
          owner: self,
        },
        schema: 1,
        snapshot: {
          grantGroups: {},
          program,
          ref: capability,
          resources: {},
          schema: 1,
        },
        source: { capability, kind: "capability", owner: self },
        staticBindings: {},
      });
      if (!authority) return null;
      const source: EngineActionSource = {
        capability: {
          authority,
          facts: [
            {
              address: ["hit-point-maximum"],
              expected: { present: true, value: document.character.hp.max },
              lifecycle: "commit-redo",
              owner: self,
            },
          ],
          transcription: { clauses: [], entityId: program.id, program },
        },
        key: "test-self-damage",
      };
      return source;
    };

    const { result } = renderHook(() => useMechanicsEngineAction(sourceFor));
    expect(result.current.phase.kind).toBe("ready");
    let committed: string | null = null;
    act(() => {
      committed = result.current.commit();
    });
    expect(committed).not.toBeNull();
    const state = useCharacterStore.getState();
    expect(state.character?.session.hp.current).toBe(31);
    const queue = state.combatPendingConcentrationSaves;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      damage: 9,
      difficultyClass: 10,
      spell: "hold-person",
    });
  });
});
