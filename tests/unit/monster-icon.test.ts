/**
 * A monster's painted icon, in the order the interface tries it (`artFor`): its own
 * icon, then its creature type's (the 14 2024 types, one painted subject each), then
 * the glyph. The type icons are not painted yet: the interface tries the next key when
 * a file is missing, so nothing changes on screen until they exist ("the file is the
 * truth", src/ui/art-url.ts). A DM's custom monster has only a type.
 */
import { describe, expect, it } from "vitest";

import { MONSTERS } from "@/data/monsters";
import { ALL_CREATURE_TYPES } from "@/data/types";
import { artFor, CREATURE_TYPE_ART_SUBJECTS } from "@/data/monster-icon";

describe("a monster's icon, in the order it is tried", () => {
  it("a bestiary monster: its own icon, then its creature type's", () => {
    const goblin = MONSTERS.find((m) => m.id === "goblin-warrior");
    expect(goblin?.type).toBe("fey");
    expect(artFor({ srdId: "goblin-warrior", creatureType: "fey" })).toEqual([
      "monster/goblin-warrior",
      "creature-type/fey",
    ]);
  });

  it("a custom monster with a type: the type's icon", () => {
    expect(artFor({ creatureType: "fiend" })).toEqual(["creature-type/fiend"]);
  });

  it("a stat-less improvised creature: nothing to try (the glyph)", () => {
    expect(artFor({})).toEqual([]);
  });

  it("the type subjects to paint are exactly the 14 creature types", () => {
    expect(CREATURE_TYPE_ART_SUBJECTS).toHaveLength(14);
    expect(CREATURE_TYPE_ART_SUBJECTS).toEqual(
      ALL_CREATURE_TYPES.map((type) => `creature-type/${type}`)
    );
  });

  it("every bestiary monster falls back to one of those subjects", () => {
    for (const monster of MONSTERS)
      expect(CREATURE_TYPE_ART_SUBJECTS, monster.id).toContain(
        artFor({ srdId: monster.id, creatureType: monster.type }).at(-1)
      );
  });
});
