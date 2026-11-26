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
  // every write in order: what a restore does first matters
  calls: [] as Array<[string, string?, unknown?]>,
  failSave: false,
}));
vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/lib/firestore", () => ({
  listCharacterSnapshots: () =>
    Promise.resolve([
      // the store's order is not trusted: the dialog shows the newest first
      {
        id: "s0",
        reason: "manual",
        createdAt: new Date(Date.UTC(2026, 10, 10, 18, 0)),
        character: { classes: [], quote: "older" },
        session: {},
      },
      {
        id: "s1",
        reason: "level-up",
        createdAt: new Date(Date.UTC(2026, 10, 20, 18, 0)),
        character: { classes: [], quote: "before level 5" },
        session: {},
      },
    ]),
  saveCharacterSnapshot: (
    _uid: string,
    _id: string,
    data: { reason: string; character: unknown }
  ) => {
    h.calls.push(["save", data.reason, data.character]);
    if (h.failSave) return Promise.reject(new Error("offline"));
    h.saved += 1;
    return Promise.resolve("s2");
  },
  restoreCharacterSnapshot: (...args: unknown[]) => {
    h.calls.push(["restore"]);
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
  h.calls.length = 0;
  h.failSave = false;
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
});

/** The first row's button: the newest snapshot. */
function firstButton(name: RegExp): HTMLElement {
  const [first] = screen.getAllByRole("button", { name, hidden: true });
  if (!first) throw new Error(`no button ${String(name)}`);
  return first;
}

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
    fireEvent.click(firstButton(/^restore$/i));
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
    fireEvent.click(firstButton(/^delete$/i));
    expect(h.deleted).toEqual([]);
    expect(screen.getByRole("button", { name: /cancel/i, hidden: true })).toBeTruthy();
    await act(async () => {
      fireEvent.click(firstButton(/^delete$/i));
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

  it("lists the newest snapshot first", async () => {
    await openDialog();
    const rows = screen.getAllByText(/level-up|manual/i).map((el) => el.textContent);
    expect(rows[0]).toMatch(/level-up/i);
    expect(rows[1]).toMatch(/manual/i);
  });

  it("a restore first saves the current sheet as a «before restore» snapshot", async () => {
    await openDialog();
    fireEvent.click(firstButton(/^restore$/i));
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /confirm restore/i, hidden: true })
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(h.calls.map(([kind, reason]) => [kind, reason])).toEqual([
      ["save", "pre-restore"],
      ["restore", undefined],
    ]);
    expect(h.calls[0]?.[2]).toBe(doc.character);
  });

  it("no backup, no restore: the sheet stays as it is", async () => {
    h.failSave = true;
    await openDialog();
    fireEvent.click(firstButton(/^restore$/i));
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /confirm restore/i, hidden: true })
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(h.restored).toHaveLength(0);
    expect(screen.getByRole("alert", { hidden: true })).toBeInTheDocument();
  });
});
