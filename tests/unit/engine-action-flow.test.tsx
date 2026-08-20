/**
 * EngineActionFlow — the Play-tab engine dispatch's LEGACY ECONOMY MIRROR:
 * a committed engine action must write the exact economy entry the legacy
 * commit loop would have (slot occupant, rules category, the "attack" turn
 * event), and an Extra-Attack weapon swing must ride the attack-pips ledger
 * (claim or ride an Attack action) instead of occupying a whole Action slot.
 * The engine protocol itself is proven by the world-store suite; here the
 * replay hook is stubbed so the mirror closure is the unit under test.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

const commitSpy = vi.fn((): string | null => "engine-action-1");
vi.mock("@/features/character/useMechanicsCast", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/character/useMechanicsCast")>();
  return {
    ...original,
    useMechanicsEngineAction: () => ({
      answer: vi.fn(),
      answers: [],
      commit: commitSpy,
      phase: { kind: "ready", outcome: {} },
      reset: vi.fn(),
      respond: vi.fn(),
    }),
  };
});

import { EngineActionFlow } from "@/features/character/center/tabs/EngineActionFlow";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import type { User } from "firebase/auth";

function load(): void {
  useCharacterStore.setState({
    character: structuredClone(MOCK_CHARACTER),
    loading: false,
    readonly: false,
  });
  useAuthStore.setState({ user: { uid: "test-uid" } as User });
}

afterEach(() => {
  commitSpy.mockClear();
  useCharacterStore.setState({ character: null });
  useAuthStore.setState({ user: null });
  useCombatStore.getState().endCombat();
});

describe("EngineActionFlow economy mirror", () => {
  it("mirrors a feature commit as the exact legacy economy entry", () => {
    load();
    render(
      <EngineActionFlow
        dispatch={{
          action: { type: "bonus" },
          actionName: "Second Wind",
          context: {},
          derived: { featureBonus: 3, saveDc: 8 },
          economyCategory: null,
          economySlot: "bonus",
          featureId: "fighter-second-wind",
          hasAttackRoll: false,
          kind: "feature",
          legacyActionId: "fighter-second-wind-bonus",
          nameLoc: { custom: "Second Wind" },
          ordinal: 0,
          triggersAttack: false,
        }}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(commitSpy).toHaveBeenCalledTimes(1);
    const combat = useCombatStore.getState();
    expect(combat.selected.bonus).toEqual([
      {
        id: "fighter-second-wind-bonus",
        name: "Second Wind",
        nameLoc: { custom: "Second Wind" },
        slot: "bonus",
      },
    ]);
    expect(combat.selected.action).toEqual([]);
  });

  it("stamps the attack turn event and rules category on an attack commit", () => {
    load();
    render(
      <EngineActionFlow
        dispatch={{
          actionName: "Test Blade",
          economyCategory: "attack",
          kind: "weapon",
          legacyActionId: "weapon-test-blade",
          swing: false,
        }}
        onClose={vi.fn()}
      />
    );
    // The stubbed protocol is ready; the armor class was already collected in
    // real flows before ready — enter it so the prompt clears, then commit.
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "15" } });
    // Two Apply rows coexist while the AC prompt is open (the prompt's and the
    // ready footer's); confirm the AC first, then the remaining ready Apply.
    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[0] as Element);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    const combat = useCombatStore.getState();
    expect(combat.selected.action).toEqual([
      {
        id: "weapon-test-blade",
        name: "Test Blade",
        slot: "action",
        economyCategory: "attack",
        triggerEvents: ["attack"],
      },
    ]);
    expect(combat.attacksUsed).toBe(0);
  });

  it("rides the attack-pips ledger for an Extra-Attack swing", () => {
    load();
    useCombatStore.getState().setAttackBudget(2);
    const flow = (
      <EngineActionFlow
        dispatch={{
          actionName: "Test Blade",
          economyCategory: "attack",
          kind: "weapon",
          legacyActionId: "weapon-test-blade",
          swing: true,
        }}
        onClose={vi.fn()}
      />
    );
    const first = render(flow);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "15" } });
    // Two Apply rows coexist while the AC prompt is open (the prompt's and the
    // ready footer's); confirm the AC first, then the remaining ready Apply.
    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[0] as Element);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    let combat = useCombatStore.getState();
    // The first swing CLAIMS one Attack action (the anonymous group entry).
    expect(combat.attacksUsed).toBe(1);
    expect(combat.attackSwings).toEqual([{ actionId: "weapon-test-blade" }]);
    expect(combat.selected.action).toHaveLength(1);
    expect(combat.selected.action[0]?.isAttackGroup).toBe(true);
    first.unmount();

    // The second swing RIDES the open Attack action without a new slot.
    render(flow);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "15" } });
    // Two Apply rows coexist while the AC prompt is open (the prompt's and the
    // ready footer's); confirm the AC first, then the remaining ready Apply.
    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[0] as Element);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    combat = useCombatStore.getState();
    expect(combat.attacksUsed).toBe(2);
    expect(combat.selected.action).toHaveLength(1);
  });
});
