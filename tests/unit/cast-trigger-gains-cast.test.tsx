/**
 * A cast that gives something scaled by the slot, through the real cast commit
 * (both screens use the same provider): Abjuration Adept's temporary Hit Points and
 * Transmutation Adept's Speed this turn arrive with the cast, and the cast's one
 * undo takes them back.
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

import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import type { Grant } from "@/lib/grants";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CustomFeature } from "@/types/character";

import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

const adept = (grant: Grant): CustomFeature => ({
  custom: true,
  title: "Adept",
  emoji: "*",
  source: "Homebrew",
  tags: [],
  contentBlocks: [],
  grants: [grant],
  instanceId: customInstanceId("adept"),
});

afterEach(() => {
  useCharacterStore.setState({ character: null });
  useCombatStore.setState(useCombatStore.getInitialState(), true);
  useUndoStore.getState().clear(null);
});

function castWith(grant: Grant, spellId: string) {
  const doc = makeCharacterDoc(
    {
      classId: "wizard",
      level: 5,
      spells: [{ srdId: spellId, prepared: true }],
      spellSlots: [{ level: 1, total: 4 }],
      features: [adept(grant)],
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
    (a) => a.spellId === spellId
  ) as ResolvedAction;
  act(() => {
    api?.executeAction(action);
  });
}

describe("a cast trigger's gain scaled by the slot, at the cast", () => {
  it("Abjuration Adept: Shield with a 1st-level slot gives 2 temp HP; undo takes them", async () => {
    castWith(
      {
        type: "trigger",
        on: "cast-spell",
        if: { school: "abjuration", slot: true },
        do: { kind: "temp-hp", perSlotLevel: 2 },
      },
      "shield"
    );
    await waitFor(() =>
      expect(useCharacterStore.getState().character?.session.hp.temp).toBe(2)
    );
    act(() => {
      useUndoStore.getState().undo();
    });
    expect(useCharacterStore.getState().character?.session.hp.temp).toBe(0);
  });

  it("Transmutation Adept: Expeditious Retreat with a 1st-level slot adds 5 ft this turn; undo takes it", async () => {
    const before = useCombatStore.getState().extraMovementFt;
    castWith(
      {
        type: "trigger",
        on: "cast-spell",
        if: { school: "transmutation", slot: true },
        do: { kind: "speed-bonus", perSlotLevel: 5 },
      },
      "expeditious-retreat"
    );
    await waitFor(() =>
      expect(useCombatStore.getState().extraMovementFt).toBe(before + 5)
    );
    act(() => {
      useUndoStore.getState().undo();
    });
    expect(useCombatStore.getState().extraMovementFt).toBe(before);
  });
});
