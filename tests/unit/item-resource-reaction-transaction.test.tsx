import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import { litText } from "@/lib/loc-text";
import { makeItemResourceIdentity } from "@/lib/resources";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import { makeCharacterDoc } from "./_helpers";

const instanceId = "reaction-wand-copy";
const commitReaction = useCombatStore.getState().useReaction;
let selectAction: ((action: ResolvedAction) => void) | null = null;

function Probe() {
  const { handleUseReaction } = useTurnEconomy();
  useEffect(() => {
    selectAction = handleUseReaction;
  }, [handleUseReaction]);
  return null;
}

function resourceReaction(): ResolvedAction {
  return {
    id: "volatile-item-reaction",
    name: "Volatile item reaction",
    nameLoc: litText({
      en: "Volatile item reaction",
      it: "Reazione dell'oggetto instabile",
    }),
    type: "reaction",
    source: "feature",
    spellLevel: null,
    concentration: false,
    summary: { uses: { current: 1, total: 7 } },
    costsSlot: false,
    resourcePayment: {
      kind: "item-resource",
      ...makeItemResourceIdentity("wand-of-magic-missiles", instanceId, "charges"),
    },
    resourceCost: 1,
    pinned: false,
    defaultPinned: false,
  };
}

beforeEach(() => {
  selectAction = null;
  const character = makeCharacterDoc({
    classId: "fighter",
    level: 5,
    equipment: [
      {
        srdId: "wand-of-magic-missiles",
        instanceId,
        equipped: true,
        quantity: 1,
      },
    ],
  });
  character.session.itemResources = {
    [instanceId]: {
      itemId: "wand-of-magic-missiles",
      instanceId,
      revision: 0,
      resources: { charges: { capacity: 7, current: 1, disabled: false } },
      disposition: "magical",
      causalHead: null,
    },
  };
  useCharacterStore.setState({
    character,
    readonly: false,
    loading: false,
    error: null,
  });
  useUIStore.setState({ sheetMode: "play" });
  useToastStore.setState({ toasts: [], timers: {} });
  useCombatStore.setState({
    round: 1,
    initiative: "",
    selected: { action: [], bonus: [], free: [] },
    reactionUsed: false,
    reactionUsedId: null,
    reactionOutcomeOccurrenceId: null,
    movementUsedFt: 0,
    damageTakenThisRound: false,
    useReaction: commitReaction,
  });
});

describe("item-resource reaction transaction", () => {
  it("rolls back the exact item spend if another reaction claims the slot while input is open", async () => {
    useCombatStore.setState({
      useReaction: (id, occurrenceId, outcomes) =>
        id === "volatile-item-reaction"
          ? false
          : commitReaction(id, occurrenceId, outcomes),
    });
    render(
      <MemoryRouter>
        <ItemResourceCommandProvider>
          <TurnEconomyProvider>
            <Probe />
          </TurnEconomyProvider>
        </ItemResourceCommandProvider>
      </MemoryRouter>
    );

    act(() => selectAction?.(resourceReaction()));
    await screen.findByRole("dialog", { name: "Volatile item reaction" });

    expect(useCombatStore.getState().useReaction("competing-reaction")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await act(async () => Promise.resolve());
    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.itemResources?.[instanceId]
          ?.resources.charges?.current
      ).toBe(1)
    );
    expect(useCombatStore.getState()).toMatchObject({
      reactionUsed: true,
      reactionUsedId: "competing-reaction",
    });
    expect(
      useToastStore.getState().toasts.map((toast) => ({
        message: toast.message,
        undoable: toast.onUndo !== undefined,
      }))
    ).toEqual([]);
  });

  it("rejects the whole delayed transaction when the character dies while input is open", async () => {
    render(
      <MemoryRouter>
        <ItemResourceCommandProvider>
          <TurnEconomyProvider>
            <Probe />
          </TurnEconomyProvider>
        </ItemResourceCommandProvider>
      </MemoryRouter>
    );

    act(() => selectAction?.(resourceReaction()));
    await screen.findByRole("dialog", { name: "Volatile item reaction" });

    act(() => {
      const live = useCharacterStore.getState().character;
      if (!live) throw new Error("character missing");
      useCharacterStore.setState({ character: { ...live, status: "dead" } });
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.itemResources?.[instanceId]
          ?.resources.charges?.current
      ).toBe(1)
    );
    expect(useCombatStore.getState()).toMatchObject({
      reactionUsed: false,
      reactionUsedId: null,
    });
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toMatch(/dead character can't act/i);
    expect(toasts[0]).not.toHaveProperty("onUndo");
  });
});
