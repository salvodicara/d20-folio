/**
 * Tactical Shift (SRD Fighter 5: "Whenever you use your Second Wind, you can move up
 * to half your Speed without provoking Opportunity Attacks"): using its row adds half
 * the fighter's Speed to this turn's movement, and the use's undo takes it back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import { buildScenario } from "@/lib/dev-scenarios";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";

let selectAction: ((action: ResolvedAction) => void) | null = null;
function Probe() {
  const { handleSelect } = useTurnEconomy();
  useEffect(() => {
    selectAction = handleSelect;
  }, [handleSelect]);
  return null;
}

beforeEach(() => {
  selectAction = null;
  const character = buildScenario({
    name: "Brakka",
    raceId: "human",
    classId: "fighter",
    level: 5,
    background: "soldier",
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    weapons: [{ srdId: "longsword", quantity: 1 }],
  });
  useCharacterStore.setState({ character, loading: false, error: null });
  useUIStore.setState({ sheetMode: "play" });
  useToastStore.setState({ toasts: [], timers: {} });
  useCombatStore.setState({
    round: 1,
    selected: { action: [], bonus: [], free: [] },
    movementUsedFt: 0,
    dashesThisTurn: 0,
    extraMovementFt: 0,
  });
});

describe("Tactical Shift on the sheet", () => {
  it("using it adds half the Speed to this turn's movement; undo takes it back", async () => {
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <Probe />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    const doc = useCharacterStore.getState().character;
    const shift = doc
      ? localizeActions(doc, "en").find((row) => row.id.endsWith(":tactical-shift"))
      : undefined;
    expect(shift?.selfMove).toEqual({ fraction: 0.5, noOpportunityAttacks: true });
    await act(async () => {
      if (shift) selectAction?.(shift);
      await Promise.resolve();
    });
    expect(useCombatStore.getState().extraMovementFt).toBe(15);
    const undo = useToastStore.getState().toasts.at(-1)?.onUndo;
    act(() => undo?.());
    expect(useCombatStore.getState().extraMovementFt).toBe(0);
  });
});
