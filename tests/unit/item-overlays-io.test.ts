/**
 * The DM's item documents (M20): `dmItems` and `itemReveals` under the campaign, one
 * per copy by its instanceId; nothing is read or written before the v0.26 rules
 * deploy; an empty state removes the document; a malformed id is refused.
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
const rules = vi.hoisted(() => ({ v26: true }));
vi.mock("@/lib/deployed-rules", () => ({ combatEffectsV26On: () => rules.v26 }));

import {
  subscribeDmItems,
  writeDmItem,
  writeItemReveal,
} from "@/features/campaigns/item-overlays-io";

describe("the DM's item documents", () => {
  beforeEach(() => {
    rules.v26 = true;
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

  it("nothing before the rules deploy, and no malformed id", async () => {
    expect(await writeItemReveal("c1", "bad/id", { curse: true })).toBe(false);
    rules.v26 = false;
    expect(await writeDmItem("c1", "axe-1", { cursed: true })).toBe(false);
    const seen: unknown[] = [];
    subscribeDmItems(
      "c1",
      (docs) => seen.push(docs),
      () => undefined
    );
    expect(seen).toEqual([{}]);
    expect(fs.onSnapshot).not.toHaveBeenCalled();
    expect(fs.setDoc).not.toHaveBeenCalled();
  });
});
