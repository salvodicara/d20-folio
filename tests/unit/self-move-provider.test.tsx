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

function renderSheet(): void {
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <Probe />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

function row(suffix: string): ResolvedAction {
  const doc = useCharacterStore.getState().character;
  const found = doc
    ? localizeActions(doc, "en").find((r) => r.id.endsWith(suffix))
    : undefined;
  if (!found) throw new Error(`no row ${suffix}`);
  return found;
}

async function use(action: ResolvedAction): Promise<void> {
  await act(async () => {
    selectAction?.(action);
    await Promise.resolve();
  });
}

describe("Tactical Shift on the sheet", () => {
  // "Whenever you use your Second Wind, you can move up to half your Speed": the move
  // rides a Second Wind used this turn, once.
  it("using it after Second Wind adds half the Speed to this turn's movement; undo takes it back", async () => {
    renderSheet();
    const shift = row(":tactical-shift");
    expect(shift.selfMove).toEqual({ fraction: 0.5, noOpportunityAttacks: true });
    await use(row("fighter-second-wind-bonus"));
    await use(shift);
    expect(useCombatStore.getState().extraMovementFt).toBe(15);
    const undo = useToastStore.getState().toasts.at(-1)?.onUndo;
    act(() => undo?.());
    expect(useCombatStore.getState().extraMovementFt).toBe(0);
  });

  it("without Second Wind this turn it moves nothing, and it moves only once", async () => {
    renderSheet();
    await use(row(":tactical-shift"));
    expect(useCombatStore.getState().extraMovementFt).toBe(0);
    await use(row("fighter-second-wind-bonus"));
    await use(row(":tactical-shift"));
    await use(row(":tactical-shift"));
    expect(useCombatStore.getState().extraMovementFt).toBe(15);
  });
});

describe("Instinctive Pounce on the sheet", () => {
  // "As part of the Bonus Action you take to enter your Rage, you can move up to half
  // your Speed": only on the turn Rage is entered, once.
  beforeEach(() => {
    const character = buildScenario({
      name: "Vokka",
      raceId: "human",
      classId: "barbarian",
      level: 7,
      background: "soldier",
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      weapons: [{ srdId: "greataxe", quantity: 1 }],
    });
    useCharacterStore.setState({ character, loading: false, error: null });
  });

  it("moves half the Speed only after entering Rage this turn, once", async () => {
    renderSheet();
    // Speed 40 (30 + Fast Movement, no armour): half is 20
    const speed = 40;
    await use(row(":instinctive-pounce"));
    expect(useCombatStore.getState().extraMovementFt).toBe(0);
    await use(row("barbarian-rage-bonus"));
    await use(row(":instinctive-pounce"));
    await use(row(":instinctive-pounce"));
    expect(useCombatStore.getState().extraMovementFt).toBe(speed / 2);
  });
});
