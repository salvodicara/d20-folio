/**
 * Spending Hit Point Dice on a cast (pack case C7, Necromancy Adept): casting a
 * Necromancy spell with a slot asks the player how many dice to spend and what they
 * rolled; the answer spends the dice and heals the total plus the slot's level, and
 * one undo gives both back.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayPrompts } from "@/domains/play/ui/PlayPrompts";
import { usePlayPromptStore } from "@/features/character/center/playPromptStore";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CustomFeature } from "@/types/character";

import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

const adept: CustomFeature = {
  custom: true,
  title: "Adept",
  emoji: "*",
  source: "Homebrew",
  tags: [],
  contentBlocks: [],
  grants: [
    {
      type: "trigger",
      on: "cast-spell",
      if: { school: "necromancy", slot: true },
      do: { kind: "hit-point-dice", max: 2, bonus: "slot-level" },
    },
  ],
  instanceId: customInstanceId("adept"),
};

afterEach(() => {
  useCharacterStore.setState({ character: null });
  usePlayPromptStore.setState({ open: {} });
  useUndoStore.getState().clear(null);
});

describe("a cast that lets the caster spend Hit Point Dice", () => {
  it("spends the chosen dice and heals the roll plus the slot's level, with one undo", async () => {
    const doc = makeCharacterDoc(
      {
        classId: "wizard",
        level: 5,
        spells: [{ srdId: "false-life", prepared: true }],
        spellSlots: [{ level: 1, total: 4 }],
        features: [adept],
      },
      { hp: { current: 10, temp: 0 } }
    );
    useCharacterStore.setState({
      character: doc,
      readonly: false,
      loading: false,
      error: null,
    });
    let api: ReturnType<typeof useTurnEconomy> | null = null;
    function Probe() {
      api = useTurnEconomy();
      return null;
    }
    render(
      <MemoryRouter>
        <TurnEconomyProvider renderPrompts={false}>
          <Probe />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    const action = localizeActions(doc, "en").find(
      (a) => a.spellId === "false-life"
    ) as ResolvedAction;
    act(() => {
      api?.executeAction(action);
    });
    await waitFor(() =>
      expect(usePlayPromptStore.getState().open["hit-point-dice"]).toBeDefined()
    );
    const prompt = usePlayPromptStore.getState().open["hit-point-dice"];
    expect(prompt?.offer).toEqual({
      min: 0,
      max: 2,
      bonus: 1,
      into: "healing",
      evenOnly: false,
    });
    const hpAfterCast = useCharacterStore.getState().character?.session.hp.current ?? 0;
    act(() => prompt?.onConfirm(2, 7));
    const after = useCharacterStore.getState().character;
    expect(after?.session.hitDice.used).toBe(2);
    expect(after?.session.hp.current).toBe(hpAfterCast + 8);
    expect(usePlayPromptStore.getState().open["hit-point-dice"]).toBeUndefined();
    act(() => {
      useUndoStore.getState().undo();
    });
    const undone = useCharacterStore.getState().character;
    expect(undone?.session.hitDice.used).toBe(0);
    expect(undone?.session.hp.current).toBe(hpAfterCast);
  });
});

describe("Play's Hit Point Dice dialog", () => {
  it("asks how many dice and the total, says the healing, and answers the flow", () => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    const onConfirm = vi.fn();
    usePlayPromptStore.setState({
      open: {
        "hit-point-dice": {
          source: { custom: "Necromancy Adept" },
          offer: { min: 0, max: 2, bonus: 3, into: "healing", evenOnly: false },
          sizes: "d6",
          range: (count) => ({ min: count, max: count * 6 }),
          onConfirm,
          onCancel: vi.fn(),
        },
      },
    });
    render(<PlayPrompts locale="en" />);
    const spend = screen.getByRole("button", { name: "Spend" });
    expect(spend.getAttribute("aria-disabled")).toBe("true");
    // 13 is more than two d6 can roll.
    fireEvent.change(screen.getByLabelText("Total rolled (2×d6)"), {
      target: { value: "13" },
    });
    expect(spend.getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByLabelText("Total rolled (2×d6)"), {
      target: { value: "7" },
    });
    expect(screen.getByText("You regain 10 HP.")).toBeTruthy();
    fireEvent.click(spend);
    expect(onConfirm).toHaveBeenCalledWith(2, 7);
  });
});
