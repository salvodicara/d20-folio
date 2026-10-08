/**
 * Round countdowns in a shared encounter count the owner's turn even when the DM
 * advances past it (no End Turn pressed), exactly once per round.
 */
import { act, render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

const ME = "pc-user";

function status(round: number, current: string): GlobalCombat {
  return {
    campaignId: "campaign-1",
    characterId: "test-char",
    myId: ME,
    round,
    gathering: false,
    isMyTurn: current === ME,
    initiativeBonus: 2,
    initiativeRoll: 12,
    encounter: {
      combatants: [
        { kind: "pc", id: ME, memberUid: "user", characterId: "test-char" },
        {
          kind: "monster",
          id: "monster-1",
          name: "Goblin",
          ac: 13,
          initiative: 10,
          conditions: [],
          hp: { current: 7, temp: 0, max: 7 },
        },
      ],
      nextMonsterOrdinal: 2,
      round,
      currentCombatantId: current,
      order: [ME, "monster-1"],
      epoch: 9,
      status: "active",
    },
    view: {
      rows: [
        { id: ME, kind: "pc", name: "Hero" },
        { id: "monster-1", kind: "monster", name: "Goblin" },
      ],
      turnOrderIds: [ME, "monster-1"],
      currentId: current,
    } as GlobalCombat["view"],
  };
}

const rage = () =>
  useCharacterStore.getState().character?.session.effectTimers?.["barbarian-rage"]
    ?.roundsLeft;

beforeEach(() => {
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useCombatStatusStore.getState().set(null, null);
  const doc = makeCharacterDoc({
    classId: "barbarian",
    level: 5,
    features: [{ srdId: "barbarian-rage" }],
  });
  doc.session.activeFeatures = ["barbarian-rage"];
  doc.session.effectTimers = { "barbarian-rage": { roundsLeft: 10, tickedRound: 3 } };
  useCharacterStore.setState({
    character: doc,
    readonly: false,
    loading: false,
    error: null,
  });
});

it("counts the turn the DM advanced past, once per round", () => {
  act(() => useCombatStatusStore.getState().set(status(4, ME), null));
  render(
    <MemoryRouter>
      <TurnEconomyProvider>{null}</TurnEconomyProvider>
    </MemoryRouter>
  );
  expect(rage()).toBe(10);

  // The DM moves on without the player's End Turn; the pointer comes back next round.
  act(() => useCombatStatusStore.getState().set(status(4, "monster-1"), null));
  act(() => useCombatStatusStore.getState().set(status(5, ME), null));
  expect(rage()).toBe(9);

  // A repeated snapshot of the same turn changes nothing.
  act(() => useCombatStatusStore.getState().set({ ...status(5, ME) }, null));
  expect(rage()).toBe(9);

  act(() => useCombatStatusStore.getState().set(status(5, "monster-1"), null));
  act(() => useCombatStatusStore.getState().set(status(6, ME), null));
  expect(rage()).toBe(8);
});
