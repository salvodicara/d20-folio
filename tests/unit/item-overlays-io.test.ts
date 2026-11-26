/**
 * The DM's item documents (M20): `dmItems` and `itemReveals` under the campaign, one
 * per copy by its instanceId; an empty state removes the document; a malformed id is refused.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({
  collection: vi.fn((...path: unknown[]) => ({ path: path.slice(1).join("/") })),
  doc: vi.fn((...path: unknown[]) => ({ path: path.slice(1).join("/") })),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: vi.fn(
    (
      _ref: { path: string },
      next: (snap: { docs: Array<{ id: string; data: () => unknown }> }) => void
    ) => {
      next({
        docs: [
          { id: "axe-1", data: () => ({ cursed: true, notes: "Thirsty", junk: 1 }) },
        ],
      });
      return () => undefined;
    }
  ),
}));
vi.mock("firebase/firestore", () => fs);
vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  subscribeDmItems,
  writeDmItem,
  writeItemReveal,
} from "@/features/campaigns/item-overlays-io";

describe("the DM's item documents", () => {
  beforeEach(() => {
    fs.setDoc.mockClear();
    fs.deleteDoc.mockClear();
    fs.onSnapshot.mockClear();
  });

  it("reveals a copy's curse at itemReveals/{instanceId}", async () => {
    expect(await writeItemReveal("c1", "axe-1", { curse: true })).toBe(true);
    expect(fs.setDoc).toHaveBeenCalledWith(
      { path: "campaigns/c1/itemReveals/axe-1" },
      { curse: true }
    );
  });

  it("an empty state removes the document", async () => {
    await writeDmItem("c1", "axe-1", {});
    expect(fs.deleteDoc).toHaveBeenCalledWith({ path: "campaigns/c1/dmItems/axe-1" });
  });

  it("reads the DM's documents through the parser", () => {
    const seen: unknown[] = [];
    subscribeDmItems(
      "c1",
      (docs) => seen.push(docs),
      () => undefined
    );
    expect(seen).toEqual([{ "axe-1": { cursed: true, notes: "Thirsty" } }]);
  });

  it("no malformed id", async () => {
    expect(await writeItemReveal("c1", "bad/id", { curse: true })).toBe(false);
    expect(fs.setDoc).not.toHaveBeenCalled();
  });
});
