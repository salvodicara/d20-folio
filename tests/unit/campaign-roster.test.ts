/**
 * The creatures the DM keeps between fights (M19): entries read at the untrusted
 * boundary, bounded; the documents live under the campaign, by entry id, and nothing
 * is read or written before the v0.26 rules deploy.
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
          {
            id: "sildar",
            data: () => ({ name: "Sildar", hp: { current: 70, max: 58 } }),
          },
          { id: "nameless", data: () => ({ hp: { current: 1, max: 1 } }) },
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
  subscribeRoster,
  writeDmRosterEntry,
  writeRosterEntry,
} from "@/features/campaigns/roster-io";
import { parseDmRosterEntry, parseRosterEntry } from "@/lib/play/campaign-roster";

describe("a roster entry read at the boundary", () => {
  it("keeps the known fields, bounded, and needs a name", () => {
    expect(
      parseRosterEntry({
        name: "  Sildar  ",
        monsterId: "veteran",
        hp: { current: 70, max: 58, temp: 0 },
        location: { plane: "material" },
        junk: 1,
      })
    ).toEqual({
      name: "Sildar",
      monsterId: "veteran",
      hp: { current: 58, max: 58 },
      location: { plane: "material" },
    });
    expect(parseRosterEntry({ hp: { current: 1, max: 1 } })).toBeNull();
    expect(parseDmRosterEntry({ notes: "x".repeat(25000) }).notes?.length).toBe(20000);
    expect(parseDmRosterEntry(null)).toEqual({});
  });
});

describe("the roster documents", () => {
  beforeEach(() => {
    rules.v26 = true;
    fs.setDoc.mockClear();
    fs.deleteDoc.mockClear();
    fs.onSnapshot.mockClear();
  });

  it("reads the party's roster through the parser, dropping a nameless entry", () => {
    const seen: unknown[] = [];
    subscribeRoster(
      "c1",
      (docs) => seen.push(docs),
      () => undefined
    );
    expect(seen).toEqual([{ sildar: { name: "Sildar", hp: { current: 58, max: 58 } } }]);
  });

  it("writes by entry id; removing an entry removes its DM side too", async () => {
    expect(await writeRosterEntry("c1", "sildar", { name: "Sildar" })).toBe(true);
    expect(fs.setDoc).toHaveBeenCalledWith(
      { path: "campaigns/c1/roster/sildar" },
      { name: "Sildar" }
    );
    await writeRosterEntry("c1", "sildar", null);
    expect(fs.deleteDoc).toHaveBeenCalledWith({ path: "campaigns/c1/roster/sildar" });
    expect(fs.deleteDoc).toHaveBeenCalledWith({ path: "campaigns/c1/dmRoster/sildar" });
  });

  it("nothing before the rules deploy, and no malformed id", async () => {
    expect(await writeDmRosterEntry("c1", "bad id", { notes: "x" })).toBe(false);
    rules.v26 = false;
    expect(await writeRosterEntry("c1", "sildar", { name: "Sildar" })).toBe(false);
    const seen: unknown[] = [];
    subscribeRoster(
      "c1",
      (docs) => seen.push(docs),
      () => undefined
    );
    expect(seen).toEqual([{}]);
    expect(fs.onSnapshot).not.toHaveBeenCalled();
  });
});
