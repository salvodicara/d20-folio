/**
 * Main Verify regression (combat.spec.ts:223): on the e2e character (Lyra Voss,
 * concentrating on Hypnotic Pattern), cast Bane at its base level, accept the
 * break-concentration prompt, undo: Hypnotic Pattern must come back.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import {
  useTurnEconomy,
  type TurnEconomyApi,
} from "@/features/character/center/useTurnEconomy";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { MOCK_CHARACTER } from "@/lib/mock";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";

let api: TurnEconomyApi | null = null;
function Probe() {
  const economy = useTurnEconomy();
  useEffect(() => {
    api = economy;
  }, [economy]);
  return null;
}
const concentration = () => useCharacterStore.getState().character?.session.concentration;

beforeEach(() => {
  api = null;
  useToastStore.setState({ toasts: [], timers: {} });
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useCombatStatusStore.getState().set(null, null);
  useCharacterStore.setState({
    character: structuredClone(MOCK_CHARACTER),
    readonly: false,
    loading: false,
    error: null,
  });
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <Probe />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
});

describe("a Concentration swap on the e2e character", () => {
  it("undo after casting Bane over Hypnotic Pattern gives Hypnotic Pattern back", async () => {
    expect(concentration()).toBe("hypnotic-pattern");
    const doc = useCharacterStore.getState().character;
    const bane = doc && localizeActions(doc, "en").find((a) => a.spellId === "bane");
    if (!bane) throw new Error("no Bane");
    act(() => api?.executeAction(bane));
    fireEvent.click(await screen.findByText(/Level 1 \(base\)/i));
    await waitFor(() => expect(useConfirmStore.getState().open).toBe(true));
    await act(async () => {
      useConfirmStore.getState().respond(true);
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    });
    expect(concentration()).toBe("bane");

    const toast = useToastStore.getState().toasts.at(-1);
    await act(async () => {
      toast?.onUndo?.();
      await Promise.resolve();
    });
    expect(concentration()).toBe("hypnotic-pattern");
  });
});
