import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import { makeCharacterDoc } from "./_helpers";

const instanceId = "alternate-boots-copy";
const trackerId = "fighter-second-wind";
let selectAction: ((action: ResolvedAction) => void) | null = null;

function Probe() {
  const { handleSelect } = useTurnEconomy();
  useEffect(() => {
    selectAction = handleSelect;
  }, [handleSelect]);
  return null;
}

function liveAction(): ResolvedAction {
  const character = useCharacterStore.getState().character;
  if (!character) throw new Error("character missing");
  const action = localizeActions(character, "en").find(
    (candidate) => candidate.resourcePayment?.instanceId === instanceId
  );
  if (!action) throw new Error("Winged Boots action missing");
  return {
    ...action,
    alternateCost: { kind: "tracker", trackerId, amount: 1 },
  };
}

function currentCharges(): number | undefined {
  return useCharacterStore.getState().character?.session.itemResources?.[instanceId]
    ?.resources.charges?.current;
}

function trackerUsed(): number {
  return useCharacterStore.getState().character?.session.trackers[trackerId]?.used ?? 0;
}

function mount(): void {
  render(
    <MemoryRouter>
      <ItemResourceCommandProvider>
        <TurnEconomyProvider>
          <Probe />
        </TurnEconomyProvider>
      </ItemResourceCommandProvider>
    </MemoryRouter>
  );
}

async function openPicker() {
  act(() => selectAction?.(liveAction()));
  return screen.findByRole("dialog", { name: /how to pay for winged boots/i });
}

beforeEach(() => {
  selectAction = null;
  const character = makeCharacterDoc({
    classId: "fighter",
    level: 5,
    equipment: [
      {
        srdId: "winged-boots",
        instanceId,
        equipped: true,
        attuned: true,
        quantity: 1,
      },
    ],
  });
  if (
    !character.character.features.some(
      (feature) => !("custom" in feature) && feature.srdId === trackerId
    )
  ) {
    character.character.features.push({ srdId: trackerId });
  }
  character.session.trackers[trackerId] = { used: 0 };
  character.session.itemResources = {
    [instanceId]: {
      itemId: "winged-boots",
      instanceId,
      revision: 0,
      resources: { charges: { capacity: 4, current: 4, disabled: false } },
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
    movementUsedFt: 0,
    damageTakenThisRound: false,
  });
});

describe("exact item-resource alternate payment", () => {
  it("choosing the primary spends only the addressed physical item", async () => {
    mount();
    const dialog = await openPicker();
    const itemLabel = within(dialog).getByText("Winged Boots", { exact: true });
    const itemRow = itemLabel.closest("button");
    if (!itemRow) throw new Error("item payment row missing");
    fireEvent.click(itemRow);

    await waitFor(() => expect(currentCharges()).toBe(3));
    expect(trackerUsed()).toBe(0);
  });

  it("choosing the alternate spends only its legacy tracker", async () => {
    mount();
    const dialog = await openPicker();
    const trackerLabel = within(dialog).getByText("Second Wind", { exact: true });
    const trackerRow = trackerLabel.closest("button");
    if (!trackerRow) throw new Error("tracker payment row missing");
    fireEvent.click(trackerRow);

    await waitFor(() => expect(trackerUsed()).toBe(1));
    expect(currentCharges()).toBe(4);
  });

  it("still offers an affordable alternate when the primary item is empty", async () => {
    const character = useCharacterStore.getState().character;
    const itemState = character?.session.itemResources?.[instanceId];
    if (!itemState) {
      throw new Error("item resource missing");
    }
    const charges = itemState.resources.charges;
    if (!charges) throw new Error("charge counter missing");
    charges.current = 0;

    mount();
    const dialog = await openPicker();
    const itemLabel = within(dialog).getByText("Winged Boots", { exact: true });
    const itemRow = itemLabel.closest("button");
    const trackerLabel = within(dialog).getByText("Second Wind", { exact: true });
    const trackerRow = trackerLabel.closest("button");
    if (!itemRow || !trackerRow) throw new Error("payment row missing");

    expect(itemRow).toBeDisabled();
    expect(trackerRow).toBeEnabled();
    fireEvent.click(trackerRow);

    await waitFor(() => expect(trackerUsed()).toBe(1));
    expect(currentCharges()).toBe(0);
  });
});
