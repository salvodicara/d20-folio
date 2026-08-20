import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({}));

import { MemoryRouter } from "react-router";
import { PlayTab } from "@/features/character/center/tabs/PlayTab";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";

import { makeCharacterDoc } from "./_helpers";

const BOOTS_INSTANCE_ID = "winged-boots-copy";
const BOOTS_ACTIVE_KEY = `magic-item:${BOOTS_INSTANCE_ID}:winged-boots`;

describe("magic-item activation wiring", () => {
  beforeEach(() => {
    const character = makeCharacterDoc({
      classId: "fighter",
      level: 5,
      equipment: [
        {
          srdId: "winged-boots",
          instanceId: BOOTS_INSTANCE_ID,
          equipped: true,
          attuned: true,
          quantity: 1,
        },
      ],
    });
    character.session.itemResources = {
      [BOOTS_INSTANCE_ID]: {
        itemId: "winged-boots",
        instanceId: BOOTS_INSTANCE_ID,
        revision: 0,
        resources: {
          charges: { capacity: 4, current: 4, disabled: false },
        },
        disposition: "magical",
        causalHead: null,
      },
    };
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
        <ItemResourceCommandProvider>
          <TurnEconomyProvider>
            <PlayTab />
          </TurnEconomyProvider>
        </ItemResourceCommandProvider>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByLabelText("Use: Winged Boots (flying)"));
    await waitFor(() => {
      const session = useCharacterStore.getState().character?.session;
      expect(
        session?.itemResources?.[BOOTS_INSTANCE_ID]?.resources.charges?.current
      ).toBe(3);
      expect(session?.activeFeatures).toContain(BOOTS_ACTIVE_KEY);
      expect(session?.effectTimers?.[BOOTS_ACTIVE_KEY]).toEqual({ roundsLeft: 600 });
    });

    const toast = useToastStore.getState().toasts.at(-1);
    expect(toast?.onUndo).toBeTypeOf("function");
    toast?.onUndo?.();

    const restored = useCharacterStore.getState().character?.session;
    expect(restored?.itemResources?.[BOOTS_INSTANCE_ID]?.resources.charges?.current).toBe(
      4
    );
    expect(restored?.activeFeatures).not.toContain(BOOTS_ACTIVE_KEY);
    expect(restored?.effectTimers?.[BOOTS_ACTIVE_KEY]).toBeUndefined();
  });
});
