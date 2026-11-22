/**
 * Uncanny Metabolism (SRD 5.2.1 Monk 2): when you roll Initiative you can regain all
 * expended Focus Points and heal, once per Long Rest. The first initiative roll offers
 * it (a toast with «Uncanny Metabolism»), the way the initiative top-ups and the
 * ammunition recovery offer theirs; taking it runs the feature's own action.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import i18n from "@/i18n";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { applyFirstRollTopUps } from "@/features/character/center/initiative-top-up";
import { buildScenario } from "@/lib/dev-scenarios";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";

const t = i18n.getFixedT("en");

function monk(focusUsed: number, metabolismUsed: number) {
  const doc = buildScenario({
    name: "Shen",
    raceId: "human",
    classId: "monk",
    level: 2,
    background: "sage",
    abilityScores: { STR: 10, DEX: 16, CON: 14, INT: 10, WIS: 14, CHA: 8 },
  });
  doc.session.trackers = {
    ...doc.session.trackers,
    "monk-focus": { used: focusUsed },
    "monk-uncanny-metabolism": { used: metabolismUsed },
  };
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

const offer = () =>
  useToastStore
    .getState()
    .toasts.find((toast) => toast.action?.label === "Uncanny Metabolism");

beforeEach(() => {
  useUIStore.setState({ sheetMode: "play" });
  useToastStore.setState({ toasts: [], timers: {} });
  useCombatStore.setState({ round: 1, selected: { action: [], bonus: [], free: [] } });
});

function renderSheet() {
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <span />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

describe("Uncanny Metabolism at the first initiative roll", () => {
  it("is offered with Focus spent; taking it spends the use and refills Focus", async () => {
    monk(2, 0);
    renderSheet();
    act(() => applyFirstRollTopUps(t, "en"));
    const toast = offer();
    expect(toast).toBeDefined();
    await act(async () => {
      toast?.action?.run();
      await Promise.resolve();
    });
    const trackers = useCharacterStore.getState().character?.session.trackers;
    expect(trackers?.["monk-uncanny-metabolism"]?.used).toBe(1);
    expect(trackers?.["monk-focus"]?.used ?? 0).toBe(0);
  });

  it("is not offered once used, nor with nothing to regain", () => {
    monk(2, 1);
    renderSheet();
    act(() => applyFirstRollTopUps(t, "en"));
    expect(offer()).toBeUndefined();
    useToastStore.setState({ toasts: [], timers: {} });
    monk(0, 0);
    act(() => applyFirstRollTopUps(t, "en"));
    expect(offer()).toBeUndefined();
  });
});
