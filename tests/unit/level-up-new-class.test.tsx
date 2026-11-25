/**
 * Starting a new class on the new level-up (#1230, E4; D&D Beyond's level-up «add a
 * class»): «Another class» opens the classes the scores allow (13+ in each primary
 * ability), never the others; picking one gives the level to it at 1 and asks its
 * own questions (a Rogue's one multiclass skill).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({}));
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import { LevelUpScreen } from "@/domains/leveling/ui/LevelUpScreen";
import i18n from "@/i18n";
import { makeCharacterDoc } from "./_helpers";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});

const bard = makeCharacterDoc({
  classId: "bard",
  level: 4,
  abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 16 },
});

function mount() {
  const router = createMemoryRouter(
    [
      {
        path: "/characters/:id/level-up",
        element: <LevelUpScreen doc={bard} locale="en" onClose={() => undefined} />,
      },
      { path: "*", element: null },
    ],
    { initialEntries: [`/characters/${bard.id}/level-up`] }
  );
  render(<RouterProvider router={router} />);
}

describe("a new class on the new level-up", () => {
  it("lists only the classes the scores allow", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Another class" }));
    const pane = screen.getByRole("dialog");
    expect(within(pane).getByRole("button", { name: /Rogue/ })).toBeTruthy();
    expect(within(pane).queryByRole("button", { name: /Wizard/ })).toBeNull();
    expect(within(pane).queryByRole("button", { name: /Bard/ })).toBeNull();
  });

  it("picking one gives it the level at 1 and asks its skill", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Another class" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /Rogue/ })
    );
    expect(
      screen.getByRole("button", { name: "Rogue 1 · new", pressed: true })
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.textContent).toContain(
      i18n.t("levelUp.chooseMulticlassSkill", { count: 1, class: "Rogue" })
    );
  });
});
