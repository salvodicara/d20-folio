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
  type MechanicsCastPhase,
} from "@/features/character/useMechanicsCast";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
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

    let committed = false;
    act(() => {
      committed = result.current.commit();
    });
    expect(committed).toBe(true);
    const session = useCharacterStore.getState().character?.session;
    expect(session?.world).toBeDefined();
    const hpBefore = MOCK_CHARACTER.session.hp.current;
    expect(session?.hp.current).toBeGreaterThanOrEqual(hpBefore);
  });
});
