/**
 * Solo «End turn» with Rage lit and not kept going this turn: the question comes
 * BEFORE the turn ends (BG3-style), so «Extend (Bonus Action)» spends this turn's
 * Bonus Action (2024 Rage), and «Let it end» drops it. The turn then ends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { useSoloTurn } from "@/domains/play/ui/PlaySoloTurn";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

const RAGE = "barbarian-rage";

function Solo() {
  const solo = useSoloTurn("en");
  return (
    <>
      {solo.controls}
      {solo.notes}
    </>
  );
}

/** Mounts the solo strip, starts the fight as a player would, and returns its round
 *  (round 2 unless `round` says otherwise; a started fight runs from round 1). */
function renderSolo(at = 2): number {
  render(
    <MemoryRouter>
      <TurnEconomyProvider renderPrompts={false}>
        <Solo />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  const start = screen.queryByRole("button", { name: "Start combat" });
  if (start) fireEvent.click(start);
  act(() => useCombatStore.getState().setRound(at));
  return round();
}

const raging = () => useCharacterStore.getState().character?.session.activeFeatures ?? [];
const round = () => useCombatStore.getState().round;

describe("solo End Turn with Rage lit", () => {
  /** The rounds in which a Bonus Action was taken. */
  let bonusRounds = new Set<number>();
  let unsubscribe = () => {};

  beforeEach(() => {
    useCharacterStore.setState({
      character: makeCharacterDoc(
        {
          classes: [{ classId: "barbarian", level: 1 }],
          features: [{ srdId: RAGE }],
        },
        { activeFeatures: [RAGE] }
      ),
      readonly: false,
      loading: false,
      error: null,
      combatRound: 1,
    });
    useCombatStore.getState().endCombat();
    bonusRounds = new Set();
    unsubscribe = useCombatStore.subscribe((s) => {
      if (s.selected.bonus.length > 0) bonusRounds.add(s.round);
    });
  });

  afterEach(() => {
    unsubscribe();
    useCharacterStore.setState({ character: null });
    useUndoStore.getState().clear(null);
  });

  it("asks before the turn ends", () => {
    const start = renderSolo();
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    expect(screen.getByText(/is about to end/)).toBeTruthy();
    expect(round()).toBe(start);
  });

  it("«Extend» spends this turn's Bonus Action, keeps Rage, then ends the turn", async () => {
    const start = renderSolo();
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    fireEvent.click(screen.getByRole("button", { name: "Extend (Bonus Action)" }));
    await waitFor(() => expect(round()).toBe(start + 1));
    expect([...bonusRounds]).toEqual([start]);
    expect(raging()).toContain(RAGE);
    expect(round()).toBe(start + 1);
    expect(screen.queryByText(/is about to end/)).toBeNull();
  });

  it("round 1 after «Start combat», no initiative: «Extend» spends this turn's Bonus Action too", async () => {
    const start = renderSolo(1);
    expect(start).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    fireEvent.click(screen.getByRole("button", { name: "Extend (Bonus Action)" }));
    await waitFor(() => expect(round()).toBe(start + 1));
    expect([...bonusRounds]).toEqual([start]);
    expect(raging()).toContain(RAGE);
  });

  it("«Let it end» drops Rage, then ends the turn", () => {
    const start = renderSolo();
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Let it end" }));
    });
    expect(raging()).not.toContain(RAGE);
    expect(round()).toBe(start + 1);
  });

  it("the Bonus Action already spent: «Extend» is off", () => {
    renderSolo();
    act(() =>
      useCombatStore.setState({
        selected: {
          action: [],
          bonus: [{ id: "x", name: "x", slot: "bonus" } as never],
          free: [],
        },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    expect(
      screen
        .getByRole("button", { name: "Extend (Bonus Action)" })
        .getAttribute("aria-disabled")
    ).toBe("true");
  });

  it("nothing due: End Turn ends at once", () => {
    useCharacterStore.setState({ character: makeCharacterDoc({}) });
    const start = renderSolo();
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    expect(round()).toBe(start + 1);
    expect(screen.queryByText(/is about to end/)).toBeNull();
  });
});
