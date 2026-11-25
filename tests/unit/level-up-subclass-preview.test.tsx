/**
 * The new level-up previews the picked subclass (#1230, gap map item 8b; BG3's and
 * D&D Beyond's subclass detail): before a pick nothing shows; after it, the
 * subclass's features at this level and its always-prepared spells, before Confirm.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({}));
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import { LevelUpScreen } from "@/domains/leveling/ui/LevelUpScreen";
import { makeCharacterDoc } from "./_helpers";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
  localStorage.clear();
});

const cleric = makeCharacterDoc({
  classId: "cleric",
  level: 2,
  abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 16, CHA: 10 },
});

function mount() {
  const router = createMemoryRouter(
    [
      {
        path: "/characters/:id/level-up",
        element: <LevelUpScreen doc={cleric} locale="en" onClose={() => undefined} />,
      },
      { path: "*", element: null },
    ],
    { initialEntries: [`/characters/${cleric.id}/level-up`] }
  );
  render(<RouterProvider router={router} />);
}

describe("the subclass preview", () => {
  it("shows nothing before a pick, then the features and spells the pick brings", () => {
    mount();
    expect(screen.queryByText("Bonus spells · always prepared")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Life Domain/ }));
    expect(screen.getByText("What it gives you now")).toBeTruthy();
    expect(screen.getByText("Disciple of Life", { selector: "summary" })).toBeTruthy();
    expect(screen.getByText("Bonus spells · always prepared")).toBeTruthy();
    expect(
      screen.getByText("Aid · Bless · Cure Wounds · Lesser Restoration")
    ).toBeTruthy();
  });
});
