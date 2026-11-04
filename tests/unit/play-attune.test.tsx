/**
 * Attunement on a Play inventory row: «Attune» / «End attunement» dispatch the
 * attune events; a refusal reads its reason in words and «Attune anyway» forces it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PlayAttuneRow } from "@/domains/play/ui/PlayAttune";
import { useCharacterStore } from "@/stores/characterStore";

describe("PlayAttuneRow", () => {
  const dispatch = vi.fn(() => () => undefined);
  beforeEach(() => {
    dispatch.mockClear();
    useCharacterStore.setState({ dispatch: dispatch });
  });

  it("attunes an item with room", () => {
    render(
      <PlayAttuneRow
        attune={{ instanceId: "ring", attuned: false }}
        name="Ring"
        locale="en"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Attune" }));
    expect(dispatch).toHaveBeenCalledWith({ kind: "attune-item", instanceId: "ring" });
  });

  it("ends an attunement", () => {
    render(
      <PlayAttuneRow
        attune={{ instanceId: "cloak", attuned: true }}
        name="Cloak"
        locale="en"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "End attunement" }));
    expect(dispatch).toHaveBeenCalledWith({ kind: "unattune-item", instanceId: "cloak" });
  });

  it("names the items in the way at the limit, and forces on «Attune anyway»", () => {
    render(
      <PlayAttuneRow
        attune={{
          instanceId: "gauntlets",
          attuned: false,
          refusal: { reason: "limit", limit: 3, names: ["Cloak", "Amulet", "Ring"] },
        }}
        name="Gauntlets"
        locale="en"
      />
    );
    expect(
      screen.getByText("You're already attuned to 3 items: Cloak, Amulet, and Ring.")
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Attune anyway" }));
    expect(dispatch).toHaveBeenCalledWith({
      kind: "attune-item",
      instanceId: "gauntlets",
      force: true,
    });
  });

  it("says who an item is for", () => {
    render(
      <PlayAttuneRow
        attune={{
          instanceId: "staff",
          attuned: false,
          refusal: {
            reason: "prerequisite",
            spellcaster: true,
            names: ["Wizard"],
            attunedTo: "Belt of Dwarvenkind",
          },
        }}
        name="Staff"
        locale="en"
      />
    );
    expect(
      screen.getByText(
        "Attunement only for: spellcasters, Wizard, or those attuned to Belt of Dwarvenkind."
      )
    ).toBeTruthy();
  });
});
