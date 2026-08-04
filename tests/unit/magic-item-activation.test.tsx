import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({}));

import { MemoryRouter } from "react-router";
import { PlayTab } from "@/features/character/center/tabs/PlayTab";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";

import { makeCharacterDoc } from "./_helpers";

describe("magic-item activation wiring", () => {
  beforeEach(() => {
    const character = makeCharacterDoc({
      classId: "fighter",
      level: 5,
      equipment: [{ srdId: "winged-boots", equipped: true, attuned: true, quantity: 1 }],
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
      damageTakenThisRound: false,
    });
  });

  it("spends the item charge, lights the state, arms its timer, and undoes all three", async () => {
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <PlayTab />
        </TurnEconomyProvider>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByLabelText("Use: Winged Boots (flying)"));
    await waitFor(() => {
      const session = useCharacterStore.getState().character?.session;
      expect(session?.trackers["winged-boots"]).toEqual({ used: 1 });
      expect(session?.activeFeatures).toContain("winged-boots");
      expect(session?.effectTimers?.["winged-boots"]).toEqual({ roundsLeft: 600 });
    });

    const toast = useToastStore.getState().toasts.at(-1);
    expect(toast?.onUndo).toBeTypeOf("function");
    toast?.onUndo?.();

    const restored = useCharacterStore.getState().character?.session;
    expect(restored?.trackers["winged-boots"]?.used ?? 0).toBe(0);
    expect(restored?.activeFeatures).not.toContain("winged-boots");
    expect(restored?.effectTimers?.["winged-boots"]).toBeUndefined();
  });
});
