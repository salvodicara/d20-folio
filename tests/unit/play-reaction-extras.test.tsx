/**
 * The new Play screen's reaction extras (board 2b, D4): the readied spell waits under
 * the turn strip with «Release · Reaction», and «Other reaction» marks a reaction
 * resolved at the table. Both spend the round's Reaction, undoably.
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

import { OtherReactionRow, ReadiedNote } from "@/domains/play/ui/PlayReactionExtras";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import type { StoredConcentration } from "@/types/ids";
import { makeCharacterDoc } from "./_helpers";

/** The value, or the test fails here. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("missing in test");
  return value;
}

function renderExtras() {
  render(
    <MemoryRouter>
      <TurnEconomyProvider renderPrompts={false}>
        <ReadiedNote locale="en" />
        <OtherReactionRow />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

const session = () => useCharacterStore.getState().character?.session;

describe("reaction extras", () => {
  beforeEach(() => {
    const doc = makeCharacterDoc({
      classId: "wizard",
      level: 5,
      spells: [{ srdId: "magic-missile", prepared: true }],
      spellSlots: [{ level: 1, total: 4 }],
    });
    doc.session.initiative = "12";
    useCharacterStore.setState({
      character: doc,
      readonly: false,
      loading: false,
      combatRound: 1,
    });
    useCombatStore.getState().endCombat();
  });
  afterEach(() => {
    useCharacterStore.setState({ character: null });
    useUndoStore.getState().clear(null);
  });

  it("no readied spell: no note", () => {
    renderExtras();
    expect(screen.queryByText(/Readied:/)).toBeNull();
  });

  it("a readied spell waits under the strip; Release spends the Reaction and lets it go", () => {
    const doc = must(useCharacterStore.getState().character);
    useCharacterStore.setState({
      character: {
        ...doc,
        session: {
          ...doc.session,
          concentration: "magic-missile" as StoredConcentration,
          readiedSpell: { expiresRound: 2 },
        },
      },
    });
    renderExtras();
    expect(screen.getByText(/Readied: Magic Missile/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Release · Reaction" }));
    expect(useCombatStore.getState().reactionUsed).toBe(true);
    expect(session()?.readiedSpell).toBeUndefined();
    expect(screen.queryByText(/Readied:/)).toBeNull();
    act(() => {
      useUndoStore.getState().undo();
    });
    expect(session()?.readiedSpell?.expiresRound).toBe(2);
    expect(useCombatStore.getState().reactionUsed).toBe(false);
  });

  it("«Other reaction» marks the Reaction used, then is off", async () => {
    renderExtras();
    const mark = screen.getByRole("button", { name: "Mark used: Other reaction" });
    fireEvent.click(mark);
    await vi.waitFor(() => expect(useCombatStore.getState().reactionUsed).toBe(true));
    expect(
      screen.getByRole("button", { name: /Other reaction/ }).getAttribute("aria-disabled")
    ).toBe("true");
  });
});
