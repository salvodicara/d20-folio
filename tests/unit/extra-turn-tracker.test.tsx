/**
 * The solo turn band offers Thief's Reflexes' second turn in round 1 (the feature text in
 * `class-features.json`: "two turns during the first round"). One tap refreshes the turn's
 * economy and logs the turn, while the round stays 1.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
vi.mock("@/lib/firebase", () => ({}));
import { ThisTurnTracker } from "@/features/character/center/ThisTurnTracker";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { MOCK_CHARACTER } from "@/lib/mock";

function thief(level: number) {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.classes = [{ classId: "rogue", subclassId: "thief", level }];
  return doc;
}

function mount() {
  return render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <ThisTurnTracker />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

describe("solo extra turn — Thief's Reflexes", () => {
  beforeEach(() => {
    useCombatStatusStore.getState().set(null, null);
    useCombatStore.getState().endCombat();
  });

  it(
    "round 1: one tap starts the second turn without advancing the round",
    { timeout: 60_000 },
    () => {
      useCharacterStore.setState({ character: thief(17), loading: false, error: null });
      mount();
      act(() => useCombatStore.setState({ reactionUsed: true, movementUsedFt: 15 }));
      fireEvent.click(
        screen.getByRole("button", { name: "Second turn (Thief's Reflexes)" })
      );

      const combat = useCombatStore.getState();
      expect(combat.round).toBe(1);
      expect(combat.reactionUsed).toBe(false);
      expect(combat.movementUsedFt).toBe(0);
      expect(combat.reflexesTaken).toBe(true);
      expect(
        useCharacterStore.getState().character?.session.logEntries.at(-1)?.event
      ).toEqual({
        kind: "turn-end",
        round: 1,
        extraTurn: { source: "rogue-thief-reflexes", n: 2, of: 2 },
      });
      expect(screen.getByTestId("extra-turn-ordinal").textContent).toBe("Turn 2/2");
      expect(screen.queryByRole("button", { name: /Second turn/ })).toBeNull();
    }
  );

  it("no offer below level 17 or after round 1", { timeout: 60_000 }, () => {
    useCharacterStore.setState({ character: thief(16), loading: false, error: null });
    const { unmount } = mount();
    expect(screen.queryByRole("button", { name: /Second turn/ })).toBeNull();
    unmount();
    useCharacterStore.setState({ character: thief(17), loading: false, error: null });
    mount();
    expect(screen.getByRole("button", { name: /Second turn/ })).toBeTruthy();
    act(() => useCombatStore.setState({ round: 2 }));
    expect(screen.queryByRole("button", { name: /Second turn/ })).toBeNull();
  });
});
