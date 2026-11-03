/**
 * The Play screen's «Incantesimi» tab (approved prototype x-play-spells): the casting
 * numbers, then the spells by level, each level with its slots left, every spell with
 * the same row and cast button as the actions, and an unprepared one shown but not cast.
 */
import { describe, expect, it } from "vitest";
import { playSpellsView } from "@/domains/play/play-spells-view";
import { makeCharacterDoc } from "./_helpers";

const cleric = makeCharacterDoc(
  {
    classId: "cleric",
    level: 3,
    abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 10 },
    spells: [
      { srdId: "sacred-flame", prepared: true },
      { srdId: "bless", prepared: true },
      { srdId: "cure-wounds", prepared: false },
    ],
    spellSlots: [
      { level: 1, total: 4 },
      { level: 2, total: 2 },
    ],
    spellcasting: {
      ability: "WIS",
      preparedCaster: true,
      preparedMax: 6,
      saveDCOverride: null,
      attackBonusOverride: null,
    },
  },
  { spellSlots: { "1": { used: 1 } } }
);

describe("playSpellsView", () => {
  const view = playSpellsView(cleric, "en");

  it("leads with the save DC and the spell attack", () => {
    expect(view.summary).toMatchObject({ saveDc: 13, attack: 5 });
  });

  it("groups the spells by level, cantrips first", () => {
    expect(view.groups.map((g) => g.level)).toEqual([0, 1]);
    expect(view.groups[0]?.spells.map((s) => s.row.spellId)).toEqual(["sacred-flame"]);
  });

  it("a level shows its slots left", () => {
    expect(view.groups.find((g) => g.level === 1)?.slots).toEqual({ left: 3, total: 4 });
  });

  it("a prepared spell casts; an unprepared one is shown but not cast", () => {
    const level1 = view.groups.find((g) => g.level === 1)?.spells ?? [];
    expect(level1.map((s) => [s.row.spellId, s.prepared])).toEqual([
      ["bless", true],
      ["cure-wounds", false],
    ]);
  });

  it("marks Concentration on the row", () => {
    const bless = view.groups
      .flatMap((g) => g.spells)
      .find((s) => s.row.spellId === "bless");
    expect(bless?.row.concentration).toBe(true);
  });
});
