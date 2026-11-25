/**
 * #1342 — snapshots on the new Play screen: list, save now, restore (after a confirm,
 * through the whole-sheet writer at the sheet's revision, the undo stack cleared) and
 * delete (after a confirm). The classic sheet's seams, in the new UI's dialog.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  restored: [] as unknown[],
  deleted: [] as string[],
  saved: 0,
}));
vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/lib/firestore", () => ({
  listCharacterSnapshots: () =>
    Promise.resolve([
      {
        id: "s1",
        reason: "level-up",
        createdAt: new Date(Date.UTC(2026, 10, 20, 18, 0)),
        character: { classes: [], quote: "before level 5" },
        session: {},
      },
    ]),
  saveCharacterSnapshot: () => {
    h.saved += 1;
    return Promise.resolve("s2");
  },
  restoreCharacterSnapshot: (...args: unknown[]) => {
    h.restored.push(args);
    return Promise.resolve();
  },
  deleteCharacterSnapshot: (_uid: string, _id: string, snapId: string) => {
    h.deleted.push(snapId);
    return Promise.resolve();
  },
}));

import { PlaySnapshots } from "@/domains/play/ui/PlaySnapshots";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useUndoStore } from "@/stores/undoStore";

const doc = { ...structuredClone(MOCK_CHARACTER), id: "c1", revision: 7 };

beforeEach(() => {
  h.restored.length = 0;
  h.deleted.length = 0;
  h.saved = 0;
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
});

async function openDialog() {
  render(<PlaySnapshots uid="u1" doc={doc} open onClose={() => {}} />);
  await act(async () => {
    await Promise.resolve();
  });
}

describe("snapshots on the Play screen", () => {
  it("lists the saved snapshots with their reason", async () => {
    await openDialog();
    expect(screen.getByText(/level-up/i)).toBeInTheDocument();
  });

  it("restore asks to confirm, then writes the snapshot at the sheet's revision", async () => {
    const clear = vi.spyOn(useUndoStore.getState(), "clear");
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: /^restore$/i, hidden: true }));
    expect(h.restored).toHaveLength(0);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /confirm restore/i, hidden: true })
      );
      await Promise.resolve();
    });
    expect(h.restored).toHaveLength(1);
    const [uid, id, snapshot, revision] = h.restored[0] as [
      string,
      string,
      { character: { quote: string } },
      number,
    ];
    expect([uid, id, snapshot.character.quote, revision]).toEqual([
      "u1",
      "c1",
      "before level 5",
      7,
    ]);
    expect(clear).toHaveBeenCalled();
  });

  it("delete asks to confirm, then deletes", async () => {
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i, hidden: true }));
    expect(h.deleted).toEqual([]);
    expect(screen.getByRole("button", { name: /cancel/i, hidden: true })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^delete$/i, hidden: true }));
      await Promise.resolve();
    });
    expect(h.deleted).toEqual(["s1"]);
  });

  it("saves a snapshot now", async () => {
    await openDialog();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /save snapshot/i, hidden: true })
      );
      await Promise.resolve();
    });
    expect(h.saved).toBe(1);
  });
});
