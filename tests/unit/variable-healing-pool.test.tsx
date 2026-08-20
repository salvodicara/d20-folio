import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import "@/i18n";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import {
  useTurnEconomy,
  type PreparedCommit,
} from "@/features/character/center/useTurnEconomy";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";

let vitalityAction: ResolvedAction;
let preparedAction: ResolvedAction | null;
let preparedCommit: PreparedCommit | null;

function PoolProbe() {
  const { prepareResolution } = useTurnEconomy();
  const [formula, setFormula] = useState("");
  return (
    <>
      <button
        onClick={() =>
          prepareResolution(vitalityAction, (action, commit) => {
            preparedAction = action;
            preparedCommit = commit;
            setFormula(action.summary.healApply?.dice ?? "");
          })
        }
      >
        Start vitality
      </button>
      <output>{formula}</output>
      <button
        onClick={() =>
          preparedCommit?.(
            () => undefined,
            preparedAction ? { action: preparedAction } : undefined
          )
        }
      >
        Commit vitality
      </button>
    </>
  );
}

const used = (): number =>
  useCharacterStore.getState().character?.session.trackers["recover-vitality"]?.used ?? 0;

describe("variable healing pools", () => {
  beforeEach(() => {
    preparedAction = null;
    preparedCommit = null;
    const doc = makeCharacterDoc({
      features: [
        {
          custom: true,
          title: "Recover Vitality",
          emoji: "❤",
          source: "Test",
          tags: [],
          contentBlocks: [],
          trackers: [
            {
              id: "recover-vitality",
              label: "Recover Vitality",
              total: "10",
              recovery: "long-rest",
              die: "d10",
              isPool: true,
              unit: "dice",
            },
          ],
          actions: [
            {
              type: "bonus",
              label: "Recover Vitality",
              description: "Spend d10s and regain the rolled Hit Points.",
              costTracker: "recover-vitality",
              poolSpendEffect: "healing",
              targeting: { affinity: "self", maxTargets: 1 },
            },
          ],
        },
      ],
    });
    const resolved = localizeActions(doc, "en").find(
      (action) => action.id === "custom-Recover Vitality-bonus"
    );
    if (!resolved) throw new Error("custom healing-pool action did not resolve");
    vitalityAction = resolved;
    useCharacterStore.setState({ character: doc, loading: false, error: null });
    useCombatStore.setState({
      round: 1,
      initiative: "",
      selected: { action: [], bonus: [], free: [] },
      reactionUsed: false,
      movementUsedFt: 0,
      damageTakenThisRound: false,
    });
    useConfirmStore.setState({ open: false, options: null, _resolve: null });
    useToastStore.setState({ toasts: [], timers: {} });
    useUndoStore.setState({ characterId: null, past: [], future: [] });
  });

  it("chooses dice before target resolution, spends only on commit, and rechecks redo", async () => {
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <PoolProbe />
        </TurnEconomyProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Start vitality" }));
    const picker = screen.getByRole("dialog", { name: /recover vitality/i });
    fireEvent.change(
      within(picker).getByRole("spinbutton", {
        name: /how many dice are you spending/i,
      }),
      { target: { value: "3" } }
    );
    fireEvent.click(within(picker).getByRole("button", { name: "Spend" }));

    expect(await screen.findByText("3d10")).toBeInTheDocument();
    expect(preparedAction?.summary.healApply).toEqual({ dice: "3d10", bonus: 0 });
    expect(preparedAction?.trackerCost).toBe(3);
    expect(used()).toBe(0);
    expect(useCombatStore.getState().selected.bonus).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Commit vitality" }));
    await waitFor(() => expect(used()).toBe(3));
    const committed = useCombatStore
      .getState()
      .selected.bonus.find((entry) => entry.id === "custom-Recover Vitality-bonus");
    expect(committed?.cost).toMatchObject({ type: "tracker", trackerAmount: 3 });

    act(() => {
      expect(useUndoStore.getState().undo()).toBe(true);
    });
    expect(used()).toBe(0);
    expect(useCombatStore.getState().selected.bonus).toEqual([]);

    useCharacterStore.getState().useTracker("recover-vitality", 8);
    act(() => {
      expect(useUndoStore.getState().redo()).toBe(false);
    });
    expect(used()).toBe(8);
    expect(useCombatStore.getState().selected.bonus).toEqual([]);
  });
});
