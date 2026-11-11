/**
 * «Danni e cure» › Difese (board 2b, D4c + D6b; D&D Beyond's HP panel › Defenses):
 * the character's defenses by kind, the chosen resistance re-picked in place (Fiendish
 * Resilience), and a temporary defense added (kind, then type) and removed with ×.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayDefenses } from "@/domains/play/ui/PlayDefenses";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

/** The value, or the test fails here. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("missing in test");
  return value;
}

const session = () => must(useCharacterStore.getState().character).session;

function Live() {
  const doc = useCharacterStore((s) => s.character);
  return doc ? <PlayDefenses doc={doc} locale="en" /> : null;
}

describe("PlayDefenses", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(
      makeCharacterDoc({
        classes: [{ classId: "warlock", level: 10, subclassId: "fiend-patron" }],
        features: [{ srdId: "warlock-fiend-patron-fiendish-resilience" }],
      })
    );
    useCharacterStore.setState({ readonly: false });
  });

  it("the chosen resistance is picked in place, then shown as a resistance", () => {
    render(<Live />);
    const group = screen.getByRole("group", { name: "Resistances" });
    fireEvent.click(within(group).getByRole("button", { name: /Choose/ }));
    fireEvent.click(screen.getByRole("button", { name: "Fire" }));
    expect(
      session().grantBundleChoices?.["warlock-fiend-patron-fiendish-resilience"]
    ).toBe("fire");
    expect(within(group).getByRole("button", { name: /Fire/ })).toBeTruthy();
  });

  it("adds a temporary defense by kind and type, and removes it with ×", () => {
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Immunity" }));
    fireEvent.click(screen.getByRole("button", { name: "Poison" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(session().sessionDefenses?.immunity).toEqual(["poison"]);
    const immunities = screen.getByRole("group", { name: "Immunities" });
    expect(within(immunities).getByText(/Poison · temporary/)).toBeTruthy();
    fireEvent.click(within(immunities).getByRole("button", { name: "Remove Poison" }));
    expect(session().sessionDefenses?.immunity ?? []).toEqual([]);
  });

  it("a type already held is offered disabled", () => {
    useCharacterStore.getState().addSessionDefense("resistance", "cold");
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(
      screen.getByRole("button", { name: "Cold" }).getAttribute("aria-disabled")
    ).toBe("true");
  });
});
