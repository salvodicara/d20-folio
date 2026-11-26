/**
 * The DM edits a creature's initiative on the new fight screen (D&D Beyond's combat
 * tracker: type the number, the list re-sorts). Once turns have begun the order stands,
 * so the edited creatures move to their number's place: before the first other line with
 * a lower initiative, after any tie, a group kept together.
 */
import { describe, expect, it } from "vitest";

import { parseInitiative, placeByInitiative } from "@/domains/combat/initiative-edit";
import {
  planMonsterInitiative,
  planReorder,
  planRoll,
} from "@/features/campaigns/combat-lifecycle";
import { addMonster } from "@/lib/play/encounter";
import { passTurn } from "@/lib/play/encounter-lifecycle";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const order = [
  { id: "ogre", initiative: 19 },
  { id: "pc-kaela", initiative: 16 },
  { id: "wolf-1", initiative: 13 },
  { id: "wolf-2", initiative: 13 },
  { id: "pc-selene", initiative: 9 },
  { id: "pc-tib", initiative: null },
];

describe("placeByInitiative", () => {
  it("moves the creature before the first line it now out-rolls", () => {
    expect(placeByInitiative(order, ["ogre"], 10)).toBe("pc-selene");
    expect(placeByInitiative(order, ["pc-selene"], 17)).toBe("pc-kaela");
  });

  it("a tie goes after the line it ties with", () => {
    expect(placeByInitiative(order, ["ogre"], 16)).toBe("wolf-1");
  });

  it("a group moves as one, never landing among its own creatures", () => {
    expect(placeByInitiative(order, ["wolf-1", "wolf-2"], 20)).toBe("ogre");
    expect(placeByInitiative(order, ["wolf-1", "wolf-2"], 12)).toBe("pc-selene");
    expect(placeByInitiative(order, ["wolf-1", "wolf-2"], 14)).toBe("pc-selene");
  });

  it("lowest of all goes last; a hero still to roll is not in the order", () => {
    expect(placeByInitiative(order, ["ogre"], 1)).toBeNull();
  });
});

describe("parseInitiative", () => {
  it("reads a whole number, negative included", () => {
    expect(parseInitiative(" 17 ")).toBe(17);
    expect(parseInitiative("-2")).toBe(-2);
  });

  it("refuses anything else", () => {
    expect(parseInitiative("")).toBeNull();
    expect(parseInitiative("1.5")).toBeNull();
    expect(parseInitiative("abc")).toBeNull();
    expect(parseInitiative("120")).toBeNull();
  });
});

describe("on a fight whose turns have begun", () => {
  /** A DM and one hero (rolled 15), two raiders on 17 and an ogre on 10; one turn passed. */
  function begun(): CampaignDoc {
    let campaign = {
      id: "camp",
      dmUid: "dm",
      memberDetails: {
        dm: { displayName: "x", role: "dm", characterId: null, character: null },
        ana: {
          displayName: "x",
          role: "player",
          characterId: "char-ana",
          character: { name: "Ana" },
        },
      },
      encounterInit: {},
    } as unknown as CampaignDoc;
    const rolled = planRoll(campaign, { uid: "ana", roll: 15, bonuses: {}, now: 1 });
    campaign = { ...campaign, ...rolled?.patch };
    let fight = addMonster(campaign.encounter as EncounterState, {
      name: "Raider",
      ac: 13,
      maxHp: 11,
      count: 2,
      initiative: 17,
    });
    fight = addMonster(fight, {
      name: "Ogre",
      ac: 11,
      maxHp: 59,
      count: 1,
      initiative: 10,
    });
    return { ...campaign, encounter: passTurn(fight, 2) };
  }
  const idsOf = (fight: EncounterState, name: string) =>
    fight.combatants
      .filter((c) => c.kind === "monster" && c.name === name)
      .map((c) => c.id);

  it("the ogre set to 16 moves before the hero; the raiders stay first", () => {
    let campaign = begun();
    const fight = campaign.encounter as EncounterState;
    expect(fight.clock?.turnsBegun).toBe(true);
    const [ogre] = idsOf(fight, "Ogre");
    const raiders = idsOf(fight, "Raider");
    if (!ogre) throw new Error("no ogre");
    const order = (fight.order ?? []).map((id) => ({
      id,
      initiative: id === "pc-ana" ? 15 : id === ogre ? 10 : 17,
    }));
    const beforeId = placeByInitiative(order, [ogre], 16);
    expect(beforeId).toBe("pc-ana");
    const set = planMonsterInitiative(campaign, {
      uid: "dm",
      monsterId: ogre,
      value: 16,
    });
    campaign = { ...campaign, ...set?.patch };
    // The value changes but the begun order stands: the reorder places it.
    expect(campaign.encounter?.order).toEqual(fight.order);
    const moved = planReorder(campaign, { uid: "dm", id: ogre, beforeId });
    expect(moved?.patch.encounter?.order).toEqual([...raiders, ogre, "pc-ana"]);
  });
});
