/**
 * A level's new-spell picks never offer a spell that the same level makes always
 * prepared (SRD 5.2.1: oath, patron and sorcery spells, Find Steed, Divine Smite):
 * a pick spent on one would add nothing and leave the prepared list one short.
 */
import { describe, expect, it } from "vitest";

import { levelUpAsks, NO_ANSWERS } from "@/domains/leveling/level-up-asks";
import type { ClassEntry } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const newSpellIds = (classes: ClassEntry[], classId: string) =>
  levelUpAsks(makeCharacterDoc({ classes }), classId, NO_ANSWERS, "en")
    .rows.find((r) => r.key === "newSpells")
    ?.options.map((o) => o.id) ?? [];

describe("new spells skip what the level makes always prepared", () => {
  it("Paladin 4 → 5 (Devotion): not Find Steed, nor the oath's level-2 spells", () => {
    const ids = newSpellIds(
      [{ classId: "paladin", subclassId: "oath-of-devotion", level: 4 }],
      "paladin"
    );
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ["find-steed", "aid", "zone-of-truth"])
      expect(ids).not.toContain(id);
  });

  it("Sorcerer 2 → 3 (Draconic): not the Draconic spells of level 3", () => {
    const ids = newSpellIds([{ classId: "sorcerer", level: 2 }], "sorcerer");
    // The subclass is picked at 3: with it answered, its spells leave the list.
    expect(ids).toContain("chromatic-orb");
    const asks = levelUpAsks(
      makeCharacterDoc({ classes: [{ classId: "sorcerer", level: 2 }] }),
      "sorcerer",
      { ...NO_ANSWERS, subclassId: "draconic-sorcery" },
      "en"
    );
    const after =
      asks.rows.find((r) => r.key === "newSpells")?.options.map((o) => o.id) ?? [];
    expect(after).not.toContain("chromatic-orb");
    expect(after).not.toContain("command");
  });

  it("a spell picked before the subclass that grants it drops out of the picks", () => {
    const doc = makeCharacterDoc({ classes: [{ classId: "sorcerer", level: 2 }] });
    const early = levelUpAsks(
      doc,
      "sorcerer",
      { ...NO_ANSWERS, newSpells: ["chromatic-orb"] },
      "en"
    );
    expect(early.rows.find((r) => r.key === "newSpells")?.picked).toEqual([
      "chromatic-orb",
    ]);
    const asks = levelUpAsks(
      doc,
      "sorcerer",
      { ...NO_ANSWERS, newSpells: ["chromatic-orb"], subclassId: "draconic-sorcery" },
      "en"
    );
    expect(asks.rows.find((r) => r.key === "newSpells")?.picked).toEqual([]);
    expect(asks.picks.newSpells).toEqual([]);
  });

  it("a swap's replacement skips what the level makes always prepared", () => {
    const doc = makeCharacterDoc({
      classes: [{ classId: "sorcerer", subclassId: "draconic-sorcery", level: 4 }],
      spells: [{ srdId: "burning-hands", prepared: true }],
    });
    const asks = levelUpAsks(
      doc,
      "sorcerer",
      { ...NO_ANSWERS, swap: { removeId: "burning-hands", replaceId: null } },
      "en"
    );
    const ids = asks.rows.find((r) => r.key === "swapReplace")?.options.map((o) => o.id);
    expect(ids?.length).toBeGreaterThan(0);
    // Draconic Spells at Sorcerer 5: Fear and Fly.
    expect(ids).toContain("fireball");
    for (const id of ["fear", "fly"]) expect(ids).not.toContain(id);
  });

  it("a swap's replacement picked before the subclass that grants it is asked again", () => {
    const doc = makeCharacterDoc({
      classes: [{ classId: "sorcerer", level: 2 }],
      spells: [{ srdId: "burning-hands", prepared: true }],
    });
    const asks = levelUpAsks(
      doc,
      "sorcerer",
      {
        ...NO_ANSWERS,
        subclassId: "draconic-sorcery",
        swap: { removeId: "burning-hands", replaceId: "chromatic-orb" },
      },
      "en"
    );
    expect(asks.picks.swap.replaceId).toBeNull();
    expect(asks.rows.find((r) => r.key === "swapReplace")?.picked).toEqual([]);
  });
});
