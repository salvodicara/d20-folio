/**
 * A use whose effect spends Hit Point Dice (Durable's Speedy Recovery, Arcane
 * Vigor) asks how many and the roll after it commits, on the new Play screen.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

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

const recovery: CustomFeature = {
  custom: true,
  title: "Recovery",
  emoji: "*",
  source: "Homebrew",
  tags: [],
  contentBlocks: [],
  actions: [
    {
      name: { en: "Recovery", it: "Recupero" },
      type: "bonus",
      effects: [{ kind: "hit-point-dice", max: 1 }],
    },
  ],
  instanceId: customInstanceId("recovery"),
} as unknown as CustomFeature;

afterEach(() => {
  useCharacterStore.setState({ character: null });
  usePlayPromptStore.setState({ open: {} });
  useUndoStore.getState().clear(null);
});

describe("a use that spends Hit Point Dice", () => {
  it("offers the dice after it commits", async () => {
    const doc = makeCharacterDoc(
      { classId: "fighter", level: 5, features: [recovery] },
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
      (a) => a.summary.hitPointDice !== undefined
    ) as ResolvedAction;
    expect(action).toBeDefined();
    act(() => {
      api?.executeAction(action);
    });
    await waitFor(() =>
      expect(usePlayPromptStore.getState().open["hit-point-dice"]?.offer).toMatchObject({
        max: 1,
        into: "healing",
      })
    );
  });
});
