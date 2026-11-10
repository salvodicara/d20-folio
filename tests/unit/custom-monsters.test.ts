/**
 * The DM's own monsters on the new fight screen (headless), from the classic custom
 * monsters panel: the saved list with a search and a one-line reading (type, CR, AC,
 * HP), saving a new one (a full library says so; its portrait uploads after), deleting,
 * and the entry that adds it to the fight.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";

vi.mock("@/lib/firebase", () => ({ db: {} }));
const storage = vi.hoisted(() => ({
  uploadMonsterPortrait: vi.fn(() => Promise.resolve("https://portrait")),
}));
vi.mock("@/lib/storage", () => storage);

import {
  customMonsterRows,
  deleteCustomMonster,
  saveCustomMonster,
} from "@/domains/combat/custom-monsters";
import { useLibraryStore } from "@/stores/libraryStore";
import { useToastStore } from "@/stores/toastStore";
import type { CustomMonster } from "@/types/campaign";

const t = ((key: string, args?: { cr?: string }) =>
  args?.cr ? `${key}:${args.cr}` : key) as unknown as TFunction;

const wolf: CustomMonster = {
  name: "Dire Wolf",
  ac: 14,
  maxHp: 37,
  creatureType: "beast",
  cr: "1",
};
const ghoul: CustomMonster = { name: "Grave Ghoul", ac: 12, maxHp: 22 };

beforeEach(() => {
  vi.clearAllMocks();
  useLibraryStore.getState().reset();
  useLibraryStore.getState().hydrate([], null);
});

const monsters = () =>
  useLibraryStore.getState().entries.filter((e) => e.kind === "monster");

describe("the DM's monster library", () => {
  it("saved monsters list with their one-line reading; the search narrows them", () => {
    saveCustomMonster(wolf, null, "dm", t);
    saveCustomMonster(ghoul, null, "dm", t);
    const rows = customMonsterRows(useLibraryStore.getState().entries, "", t);
    expect(rows.map((r) => r.name)).toEqual(["Dire Wolf", "Grave Ghoul"]);
    expect(rows[0]?.meta).toBe(
      "srd.creatureType_beast · polymorph.crShort:1 · character.armorClassShort 14 · 37 character.hp"
    );
    expect(
      customMonsterRows(useLibraryStore.getState().entries, "ghoul", t).map((r) => r.name)
    ).toEqual(["Grave Ghoul"]);
  });

  it("a saved monster's portrait uploads after the save and lands on it", async () => {
    const id = saveCustomMonster(
      wolf,
      { blob: new Blob(), crop: { x: 0, y: 0, width: 100, height: 100 } },
      "dm",
      t
    );
    expect(id).not.toBeNull();
    await vi.waitFor(() =>
      expect(monsters().find((e) => e.id === id)?.item).toMatchObject({
        portraitUrl: "https://portrait",
      })
    );
    expect(storage.uploadMonsterPortrait).toHaveBeenCalledWith(
      "dm",
      id,
      expect.any(Blob)
    );
  });

  it("deleting takes it off the list", () => {
    const id = saveCustomMonster(wolf, null, "dm", t);
    if (!id) throw new Error("not saved");
    deleteCustomMonster(id);
    expect(monsters()).toEqual([]);
  });

  it("a full library refuses and says so", () => {
    const save = vi
      .spyOn(useLibraryStore.getState(), "saveToLibrary")
      .mockReturnValueOnce({ outcome: "full", id: null });
    useLibraryStore.setState({ saveToLibrary: save });
    expect(saveCustomMonster(wolf, null, "dm", t)).toBeNull();
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe("custom.libraryFull");
  });
});
