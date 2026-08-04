import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { PlayTab } from "@/features/character/center/tabs/PlayTab";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import { buildScenario } from "@/lib/dev-scenarios";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import type { ResolvedAction } from "@/lib/smart-tracker";

let selectAction: ((action: ResolvedAction) => void) | null = null;

function Probe() {
  const { handleSelect } = useTurnEconomy();
  useEffect(() => {
    selectAction = handleSelect;
  }, [handleSelect]);
  return null;
}

function action(id: string): ResolvedAction {
  const character = useCharacterStore.getState().character;
  if (!character) throw new Error("character missing");
  const resolved = localizeActions(character, "en").find((row) => row.id === id);
  if (!resolved) throw new Error(`action ${id} missing`);
  return resolved;
}

async function commit(id: string): Promise<void> {
  if (!selectAction) throw new Error("provider missing");
  await act(async () => {
    selectAction?.(action(id));
    await Promise.resolve();
  });
}

beforeEach(() => {
  selectAction = null;
  const character = buildScenario({
    name: "Rook",
    raceId: "human",
    classId: "rogue",
    level: 3,
    background: "criminal",
    abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 12, CHA: 8 },
    weapons: [{ srdId: "rapier", quantity: 1 }],
  });
  useCharacterStore.setState({ character, loading: false, error: null });
  useUIStore.setState({ sheetMode: "play" });
  useToastStore.setState({ toasts: [], timers: {} });
  useCombatStore.setState({
    round: 1,
    initiative: "",
    selected: { action: [], bonus: [], free: [] },
    reactionUsed: false,
    movementUsedFt: 0,
    dashesThisTurn: 0,
    nextAttackAdvantage: false,
    movementLocked: false,
    damageTakenThisRound: false,
  });
});

describe("Rogue Steady Aim turn contract", () => {
  it("arms one attack with Advantage, locks movement, and consumes only the roll", async () => {
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <Probe />
          <PlayTab />
        </TurnEconomyProvider>
      </MemoryRouter>
    );

    await commit("rogue-steady-aim-bonus");
    expect(useCombatStore.getState()).toMatchObject({
      nextAttackAdvantage: true,
      movementLocked: true,
    });
    expect(screen.getAllByText(/Adv\./i).length).toBeGreaterThan(0);

    await commit("weapon-rapier");
    expect(useCombatStore.getState()).toMatchObject({
      nextAttackAdvantage: false,
      movementLocked: true,
    });

    const undoAttack = useToastStore.getState().toasts.at(-1)?.onUndo;
    expect(undoAttack).toBeTypeOf("function");
    act(() => undoAttack?.());
    expect(useCombatStore.getState().nextAttackAdvantage).toBe(true);
  });

  it("cannot arm Steady Aim after movement has already been spent", async () => {
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <Probe />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    useCombatStore.getState().setMovementUsed(5);

    await commit("rogue-steady-aim-bonus");

    expect(useCombatStore.getState().selected.bonus).toEqual([]);
    expect(useCombatStore.getState().nextAttackAdvantage).toBe(false);
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/after moving/i);
  });

  it("routes Cunning Action Dash through the shared movement budget", async () => {
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <Probe />
        </TurnEconomyProvider>
      </MemoryRouter>
    );

    await commit("rogue-cunning-action-dash");

    expect(useCombatStore.getState().dashesThisTurn).toBe(1);
    expect(useCombatStore.getState().selected.bonus).toHaveLength(1);
    const undoDash = useToastStore.getState().toasts.at(-1)?.onUndo;
    expect(undoDash).toBeTypeOf("function");
    act(() => undoDash?.());
    expect(useCombatStore.getState().dashesThisTurn).toBe(0);
  });
});
