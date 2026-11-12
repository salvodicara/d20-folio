/**
 * The party paladin's Aura of Protection in the new Play's «Effetti» (parity with the
 * classic aura chip): the aura shows as an effect, «Outside the aura» marks this
 * character outside it, and the toast's undo puts it back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayEffects } from "@/domains/play/ui/PlayEffects";
import { usePartyAuraOffers } from "@/features/campaigns/use-party-aura";
import { outOfAuraKey } from "@/lib/play/aura-of-protection";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

function Live() {
  const doc = useCharacterStore((s) => s.character);
  return doc ? <PlayEffects doc={doc} locale="en" /> : null;
}

const active = () => useCharacterStore.getState().character?.session.activeFeatures ?? [];

describe("PlayEffects: the party aura", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(makeCharacterDoc({}));
    useCharacterStore.setState({ readonly: false });
    usePartyAuraOffers.setState({
      offers: [{ characterId: "pal", name: "Bren Ironbeard", bonus: 3, on: true }],
    });
  });

  it("an aura alone opens «Effects» and names the paladin and what it does", () => {
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: /Effects/ }));
    expect(screen.getByText("Bren's Aura")).toBeTruthy();
    expect(screen.getByText("+3 to saving throws")).toBeTruthy();
  });

  it("«Outside the aura» marks this character outside; undo puts it back", () => {
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: /Effects/ }));
    fireEvent.click(screen.getByRole("button", { name: "Outside the aura" }));
    expect(active()).toContain(outOfAuraKey("pal"));
    // where the character stands is not an effect: no row of its own, the aura's says it
    expect(screen.queryByText(/out-of-aura/)).toBeNull();
    act(() => {
      useUndoStore.getState().undo();
    });
    expect(active()).not.toContain(outOfAuraKey("pal"));
  });
});
