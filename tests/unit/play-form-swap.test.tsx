/**
 * The step after a Long Rest on the new Play screen: «Whenever you finish a Long Rest,
 * you can replace one of your known forms with another eligible form» (SRD 5.2.1,
 * Druid, Wild Shape). One form out, one eligible form in its place; changing the
 * pick keeps it to one swap against the forms the step opened with.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayFormSwap } from "@/domains/play/ui/PlayFormSwap";
import { canSwapFormOnRest } from "@/lib/wild-shape-forms";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";
import "@/i18n";

const druid = makeCharacterDoc({
  classes: [{ classId: "druid", level: 4 }],
  wildShapeForms: ["wolf", "ape", "panther"],
});
const forms = () => useCharacterStore.getState().character?.character.wildShapeForms;

describe("PlayFormSwap", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: druid, readonly: false, loading: false });
  });
  afterEach(() => {
    useCharacterStore.setState({ character: null });
  });

  it("replaces one known form with an eligible one, in its place", () => {
    render(<PlayFormSwap doc={druid} locale="en" />);
    expect(screen.getByRole("heading", { name: "Wild Shape" })).toBeTruthy();
    expect(screen.getByText("Swap a known form (optional)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ape" }));
    // A known form, or a beast that flies before Druid 8, is not offered in its place.
    expect(screen.queryAllByRole("button", { name: "Wolf" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Eagle" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Black Bear" }));
    expect(forms()).toEqual(["wolf", "black-bear", "panther"]);
  });

  it("only one swap: another pick replaces the first, against the forms it opened with", () => {
    render(<PlayFormSwap doc={druid} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Ape" }));
    fireEvent.click(screen.getByRole("button", { name: "Black Bear" }));
    fireEvent.click(screen.getByRole("button", { name: "Wolf" }));
    expect(forms()).toEqual(["wolf", "ape", "panther"]);
    fireEvent.click(screen.getByRole("button", { name: "Boar" }));
    expect(forms()).toEqual(["boar", "ape", "panther"]);
  });

  it("is offered to a Druid with known forms only", () => {
    expect(canSwapFormOnRest(druid)).toBe(true);
    expect(canSwapFormOnRest(makeCharacterDoc({ classId: "druid", level: 4 }))).toBe(
      false
    );
    expect(canSwapFormOnRest(makeCharacterDoc({ classId: "fighter", level: 4 }))).toBe(
      false
    );
  });
});
