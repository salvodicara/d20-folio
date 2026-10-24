/**
 * Characterization of End Turn before its orchestration leaves the provider
 * (extraction programme, step 1b). Pins today's behaviour on the three paths:
 * solo (the round advances, the per-turn tracker refills, a turn-end line, one undo
 * restores all of it and redo replays it), an encounter turn that isn't yours (a
 * true no-op), and your encounter turn (the shared pointer advances, the hand-off
 * shows at once, the solo round never moves).
 */
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));
const advanceSharedTurn = vi.fn();
vi.mock("@/features/character/center/turn-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/character/center/turn-state")>()),
  advanceSharedTurn: (...args: unknown[]) => {
    advanceSharedTurn(...args);
  },
}));

import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

const ME = "pc-user";
let endTurn: (() => void) | null = null;

function Probe() {
  const { handleEndTurn } = useTurnEconomy();
  useEffect(() => {
    endTurn = handleEndTurn;
  }, [handleEndTurn]);
  return null;
}

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

const sneak = () =>
  useCharacterStore.getState().character?.session.trackers["rogue-sneak-attack"]?.used ??
  0;
const lastEvent = () =>
  useCharacterStore.getState().character?.session.logEntries.at(-1)?.event;

beforeEach(() => {
  advanceSharedTurn.mockReset();
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useCombatStatusStore.getState().set(null, null);
  const doc = makeCharacterDoc(
    { classId: "rogue", level: 3, features: [{ srdId: "rogue-sneak-attack" }] },
    { trackers: { "rogue-sneak-attack": { used: 1 } } }
  );
  doc.id = "test-char";
  doc.session.initiative = "12";
  useCharacterStore.setState({
    character: doc,
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

describe("End Turn today", () => {
  it("solo: the round advances, Sneak Attack refills, a turn-end line; one undo, one redo", () => {
    const round = useCombatStore.getState().round;
    act(() => endTurn?.());
    expect(useCombatStore.getState().round).toBe(round + 1);
    expect(sneak()).toBe(0);
    expect(lastEvent()).toEqual({ kind: "turn-end", round: round + 1 });

    act(() => void useUndoStore.getState().undo());
    expect(useCombatStore.getState().round).toBe(round);
    expect(sneak()).toBe(1);
    expect(lastEvent()?.kind).not.toBe("turn-end");

    act(() => void useUndoStore.getState().redo());
    expect(useCombatStore.getState().round).toBe(round + 1);
    expect(sneak()).toBe(0);
  });

  it("an encounter turn that isn't yours: nothing happens", () => {
    useCombatStatusStore.getState().set(status(3, "monster-1"), null);
    const round = useCombatStore.getState().round;
    act(() => endTurn?.());
    expect(useCombatStore.getState().round).toBe(round);
    expect(sneak()).toBe(1);
    expect(advanceSharedTurn).not.toHaveBeenCalled();
  });

  it("your encounter turn: the shared pointer advances and the hand-off shows at once", () => {
    useCombatStatusStore.getState().set(status(3, ME), null);
    const round = useCombatStore.getState().round;
    act(() => endTurn?.());
    expect(advanceSharedTurn).toHaveBeenCalledWith("campaign-1", ME, ME);
    expect(useCombatStatusStore.getState().status?.isMyTurn).toBe(false);
    expect(useCombatStatusStore.getState().pendingTurn).toMatchObject({
      campaignId: "campaign-1",
      fromId: ME,
      fromRound: 3,
    });
    expect(sneak()).toBe(0);
    expect(useCombatStore.getState().round).toBe(round);
  });
});
