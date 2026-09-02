/**
 * libraryStore — the in-memory home of the account library, including custom monsters.
 *
 * Pins the facts the portrait + custom-monster persistence rests on:
 *  1. every mutation flushes the whole entry list through the injected persist seam;
 *  2. `setEntryPortrait` attaches / removes a custom monster's portrait in place, by id,
 *     and is inert for a non-monster (or unknown) id.
 *
 * Pure store, no Firebase — the persist seam is a plain mock (mirrors how `LibraryMount`
 * injects the debounced writer in production).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLibraryStore, type LibraryPersistence } from "@/stores/libraryStore";
import { toLibraryEntry } from "@/lib/library";
import type { CustomMonster } from "@/types/campaign";
import type { CustomSpell } from "@/types/character";
import { customInstanceId } from "./__helpers__/custom-items";

const MONSTER: CustomMonster = { name: "Ashmaw Hound", ac: 14, maxHp: 33 };
const SPELL: CustomSpell = {
  custom: true,
  name: "Spark",
  level: 0,
  school: "evocation",
  castingTime: "action",
  range: "60 feet",
  components: { v: true, s: false, m: false },
  duration: "Instantaneous",
  concentration: false,
  description: "",
  instanceId: customInstanceId("Spark"),
};

function hydrate(): ReturnType<typeof vi.fn<LibraryPersistence>> {
  const persist = vi.fn<LibraryPersistence>();
  useLibraryStore.getState().hydrate([], persist);
  return persist;
}

/** The monster entry's stored portrait URL, or undefined (avoids non-null asserts). */
function firstMonsterPortrait(): string | undefined {
  const [entry] = useLibraryStore.getState().entries;
  return entry && entry.kind === "monster" ? entry.item.portraitUrl : undefined;
}

beforeEach(() => useLibraryStore.getState().reset());

describe("libraryStore — custom-monster portrait persistence", () => {
  it("attaches and removes a custom monster's portrait in place, by id", () => {
    const persist = hydrate();
    useLibraryStore.getState().saveToLibrary({ kind: "monster", item: MONSTER });
    const [seeded] = useLibraryStore.getState().entries;
    expect(seeded).toBeDefined();
    if (!seeded) return;
    const id = seeded.id;

    useLibraryStore.getState().setEntryPortrait(id, {
      portraitUrl: "https://x/monster-ashmaw.jpeg",
      portraitCrop: { x: 5, y: 5, width: 80, height: 80 },
    });
    const [entry] = useLibraryStore.getState().entries;
    expect(entry?.id).toBe(id); // same entry, same position
    expect(firstMonsterPortrait()).toBe("https://x/monster-ashmaw.jpeg");

    useLibraryStore.getState().setEntryPortrait(id, null);
    expect(firstMonsterPortrait()).toBeUndefined();
    expect(persist).toHaveBeenCalled();
  });

  it("is inert for an unknown id or a non-monster entry", () => {
    const persist = vi.fn<LibraryPersistence>();
    const spellEntry = toLibraryEntry({ kind: "spell", item: SPELL }, 1);
    useLibraryStore.getState().hydrate([spellEntry], persist);
    persist.mockClear();

    useLibraryStore
      .getState()
      .setEntryPortrait("no-such-id", { portraitUrl: "https://x/y.jpeg" });
    useLibraryStore
      .getState()
      .setEntryPortrait(spellEntry.id, { portraitUrl: "https://x/y.jpeg" });
    // Neither a missing id nor a spell entry is a monster → no write, no mutation.
    expect(persist).not.toHaveBeenCalled();
    expect(useLibraryStore.getState().entries).toEqual([spellEntry]);
  });
});
