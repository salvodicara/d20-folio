/**
 * What the new campaign page's monster picker reads (Direction's blocker 2): the DM's
 * homebrew monsters in the same shape as the bestiary rows, and the DDB-style budget
 * readout of the fight as it would be with the picked creatures, on the party the
 * campaign has attached (2024 SRD encounter-building XP budgets).
 */
import { describe, expect, it } from "vitest";

import {
  encounterBudget,
  homebrewPickerMonsters,
  homebrewMonsterInput,
} from "@/domains/combat/monster-picker-view";
import type { LibraryEntry } from "@/lib/library";
import type { CampaignDoc } from "@/types/campaign";

const library: LibraryEntry[] = [
  {
    id: "lib-1",
    savedAt: 1,
    kind: "monster",
    item: { name: "Bog Troll", ac: 15, maxHp: 84, cr: "5", creatureType: "giant" },
  },
  {
    id: "lib-2",
    savedAt: 2,
    kind: "monster",
    item: { name: "Village Elder", ac: 10, maxHp: 9 },
  },
  {
    id: "lib-3",
    savedAt: 3,
    kind: "spell",
    item: { name: "Not a monster" } as never,
  },
];

const member = (level: number) => ({
  displayName: "x",
  role: "player",
  characterId: `c-${level}`,
  character: { name: "x", classes: [{ classId: "fighter", level }] },
});

const campaign = (encounter?: unknown) =>
  ({
    id: "camp",
    dmUid: "dm",
    memberDetails: {
      dm: { displayName: "DM", role: "dm", characterId: null },
      a: member(3),
      b: member(3),
      c: member(3),
      d: member(3),
    },
    ...(encounter ? { encounter } : {}),
  }) as unknown as CampaignDoc;

describe("the homebrew rows of the monster picker", () => {
  it("are the library's monsters, in the bestiary rows' shape", () => {
    expect(homebrewPickerMonsters(library)).toEqual([
      { id: "lib-1", kind: "homebrew", name: "Bog Troll", cr: 5, ac: 15, maxHp: 84 },
      {
        id: "lib-2",
        kind: "homebrew",
        name: "Village Elder",
        cr: null,
        ac: 10,
        maxHp: 9,
      },
    ]);
  });

  it("a picked one becomes the add move's input, costed from its CR", () => {
    expect(homebrewMonsterInput(library, "lib-1", 2, 13)).toMatchObject({
      name: "Bog Troll",
      ac: 15,
      maxHp: 84,
      count: 2,
      initiative: 13,
      xp: 1800,
    });
    expect(homebrewMonsterInput(library, "missing", 1, null)).toBeNull();
  });
});

describe("the budget readout", () => {
  // Four level-3 characters: 2024 budgets 150 / 225 / 400 each → 600 / 900 / 1600.
  it("grades the picked creatures against the attached party", () => {
    expect(encounterBudget(campaign(), [{ cr: 1, count: 3 }])).toEqual({
      xp: 600,
      difficulty: "low",
    });
    expect(encounterBudget(campaign(), [{ cr: 2, count: 3 }])).toEqual({
      xp: 1350,
      difficulty: "high",
    });
  });

  it("counts the enemies already in the fight, never the allies", () => {
    const fight = {
      combatants: [
        { kind: "monster", id: "monster-1", xp: 450, side: "enemy" },
        { kind: "monster", id: "monster-2", xp: 450, side: "ally" },
      ],
    };
    expect(encounterBudget(campaign(fight), [{ cr: 1, count: 1 }])).toEqual({
      xp: 650,
      difficulty: "moderate",
    });
  });

  it("an un-costed creature (no CR) adds nothing, and no party grades nothing", () => {
    expect(encounterBudget(campaign(), [{ cr: null, count: 2 }])).toEqual({
      xp: 0,
      difficulty: null,
    });
    const empty = { ...campaign(), memberDetails: {} };
    expect(encounterBudget(empty, [{ cr: 1, count: 1 }]).difficulty).toBeNull();
  });
});
