/**
 * The new level-up never waits for the server (#1276). Offline, a Firestore write
 * settles only when the server answers: «Confirm level N» must still close the screen
 * at once, with the level on the sheet, the «level N» toast shown and the saved answers
 * cleared.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("@/lib/firestore", () => ({
  queueCharacterSnapshot: vi.fn(() => ({
    id: "snap",
    written: new Promise<void>(() => undefined),
  })),
}));
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import { LevelUpScreen } from "@/domains/leveling/ui/LevelUpScreen";
import { totalLevel } from "@/lib/classes";
import { loadLevelUpDraft, saveLevelUpDraft } from "@/lib/local-draft";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { makeCharacterDoc } from "./_helpers";

const fighter = { ...makeCharacterDoc({ classId: "fighter", level: 1 }), id: "c1" };

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
  useAuthStore.setState({ user: { uid: "u1" } as never });
  useCharacterStore.getState().setCharacter(fighter);
  // The sheet's ordered save queue, offline: it never answers.
  useCharacterStore
    .getState()
    .setWholeSheetWriter(() => new Promise<void>(() => undefined));
  useToastStore.setState({ toasts: [] });
});

describe("the new level-up, offline", () => {
  it("«Confirm level 2» closes at once with the level applied", async () => {
    saveLevelUpDraft("u1", fighter.id, {
      fromLevel: 1,
      classId: "fighter",
      answers: {},
    });
    const onClose = vi.fn();
    const router = createMemoryRouter(
      [
        {
          path: "/characters/:id/level-up",
          element: <LevelUpScreen doc={fighter} locale="en" onClose={onClose} />,
        },
        { path: "*", element: null },
      ],
      { initialEntries: [`/characters/${fighter.id}/level-up`] }
    );
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm level 2" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const shown = useCharacterStore.getState().character;
    expect(shown && totalLevel(shown.character)).toBe(2);
    expect(loadLevelUpDraft("u1", fighter.id, 1)).toBeNull();
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(
      "Test is level 2"
    );
  });
});
