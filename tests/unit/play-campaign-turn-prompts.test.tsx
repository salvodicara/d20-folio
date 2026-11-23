/**
 * The new Play's turn prompts in a CAMPAIGN fight, on my turn: the same as a solo
 * fight and the classic sheet. End Turn asks about Rage first, then passes the turn
 * through the classic End Turn; «Rialzati» shows when Prone; a Wish cast this turn
 * leaves its note. The fight itself is the DM's: no «Start combat» or «End combat».
 * Extra turns and Time Stop stay solo, as on the classic sheet: in a shared fight
 * the DM's turn order steps them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { useSoloTurn } from "@/domains/play/ui/PlaySoloTurn";
import {
  useCombatStatusStore,
  type GlobalCombat,
} from "@/features/campaigns/global-combat-context";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import { WISH_ID } from "@/lib/play/wish";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const RAGE = "barbarian-rage";
const ME = "pc-test-uid";

function fight(characterId: string, current: string): GlobalCombat {
  const rows = [
    { id: ME, kind: "pc", side: "ally", name: "Me" },
    { id: "monster-1", kind: "monster", side: "enemy", name: "Orc" },
  ];
  return {
    campaignId: "camp-1",
    encounter: {
      nextMonsterOrdinal: 2,
      round: 3,
      currentCombatantId: current,
      epoch: 1,
      status: "active",
      combatants: [],
    },
    view: { rows, turnOrderIds: [ME, "monster-1"], currentId: current },
    myId: ME,
    characterId,
    gathering: false,
    isMyTurn: current === ME,
    initiativeBonus: 0,
    initiativeRoll: 12,
    round: 3,
  } as unknown as GlobalCombat;
}

let passTurn = vi.fn();
let passing = false;

function Strip() {
  const turn = useSoloTurn("en", { passTurn, passing, inCampaign: true });
  return (
    <>
      {turn.controls}
      {turn.notes}
    </>
  );
}

function open(doc: CharacterDoc, current = ME) {
  useCharacterStore.setState({ character: doc, readonly: false, loading: false });
  useCombatStatusStore.setState({ status: fight(doc.id, current) });
  render(
    <MemoryRouter>
      <TurnEconomyProvider renderPrompts={false}>
        <Strip />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

const raging = () => useCharacterStore.getState().character?.session.activeFeatures ?? [];

beforeEach(() => {
  passTurn = vi.fn();
  passing = false;
  useCombatStore.getState().endCombat();
});

afterEach(() => {
  useCombatStatusStore.setState({ status: null });
  useCharacterStore.setState({ character: null });
  useUndoStore.getState().clear(null);
});

describe("a campaign fight, on my turn", () => {
  const barbarian = () =>
    makeCharacterDoc(
      { classes: [{ classId: "barbarian", level: 1 }], features: [{ srdId: RAGE }] },
      { activeFeatures: [RAGE] }
    );

  it("End Turn asks about Rage before the turn passes", () => {
    open(barbarian());
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    expect(screen.getByText(/is about to end/)).toBeTruthy();
    expect(passTurn).not.toHaveBeenCalled();
  });

  it("«Let it end» drops Rage, then the turn passes once", () => {
    open(barbarian());
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Let it end" }));
    });
    expect(raging()).not.toContain(RAGE);
    expect(passTurn).toHaveBeenCalledTimes(1);
  });

  it("nothing due: End Turn passes the turn at once", () => {
    open(makeCharacterDoc({}));
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    expect(passTurn).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/is about to end/)).toBeNull();
  });

  it("End Turn waiting for the fight to reach the sheet: the button shows it works", () => {
    passing = true;
    open(makeCharacterDoc({}));
    expect(
      screen.getByRole("button", { name: "End turn" }).getAttribute("aria-busy")
    ).toBe("true");
  });

  it("the fight is the DM's: no «Start combat» and no «End combat»", () => {
    open(makeCharacterDoc({}));
    expect(screen.queryByRole("button", { name: "Start combat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "End fight" })).toBeNull();
  });

  it("a Wish cast this turn leaves its note", () => {
    const doc = makeCharacterDoc({});
    doc.session.logEntries = [
      {
        id: "wish-1",
        event: { kind: "action-use", action: { srd: { kind: "spell", key: WISH_ID } } },
      } as never,
    ];
    open(doc);
    expect(screen.getByText(/^Wish: duplicate a spell/)).toBeTruthy();
  });

  it("Prone: «Stand up» shows", () => {
    open(makeCharacterDoc({}, { conditions: ["prone"] }));
    expect(screen.getByRole("button", { name: /^Stand up/ })).toBeTruthy();
  });
});

describe("a campaign fight, not my turn", () => {
  it("no End Turn and no «Stand up»", () => {
    open(makeCharacterDoc({}, { conditions: ["prone"] }), "monster-1");
    expect(screen.queryByRole("button", { name: "End turn" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Stand up/ })).toBeNull();
  });
});

describe("a campaign whose fight has not reached the turn model yet", () => {
  it("never offers the solo fight's start or end inside a campaign", () => {
    useCharacterStore.setState({
      character: makeCharacterDoc({}),
      readonly: false,
      loading: false,
    });
    render(
      <MemoryRouter>
        <TurnEconomyProvider renderPrompts={false}>
          <Strip />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    expect(screen.queryByRole("button", { name: "Start combat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "End fight" })).toBeNull();
    expect(screen.queryByRole("button", { name: "End turn" })).toBeNull();
  });
});
