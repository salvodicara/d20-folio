/**
 * The DM's initiative edit as a move (the dev replica stands in for Firestore): before
 * turns begin the engine re-sorts; once they have begun the line moves to its number's
 * place, a group together, and one undo puts back both the numbers and the order.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: true }));
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { initiativePlace } from "@/domains/combat/initiative-edit";
import { dmMoves } from "@/domains/combat/ui/fight-moves";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { planRoll } from "@/features/campaigns/combat-lifecycle";
import { addMonster } from "@/lib/play/encounter";
import { passTurn } from "@/lib/play/encounter-lifecycle";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const fight = () => useCampaignStore.getState().campaign?.encounter as EncounterState;
const idsOf = (name: string) =>
  fight()
    .combatants.filter((c) => c.kind === "monster" && c.name.startsWith(name))
    .map((c) => c.id);
/** Each combatant's initiative as the list reads it (the hero rolled 15). */
const fighters = () =>
  fight().combatants.map((c) => ({
    id: c.id,
    initiative: c.kind === "monster" ? c.initiative : 15,
  }));

/** A DM and one hero (15); two raiders on 17, an ogre on 10. */
function seed(begun: boolean) {
  let campaign = {
    id: "camp",
    dmUid: "dm",
    members: ["dm", "ana"],
    memberDetails: {
      dm: { displayName: "dm", role: "dm", characterId: null },
      ana: {
        displayName: "ana",
        role: "player",
        characterId: "c-ana",
        character: { name: "Ana" },
      },
    },
    encounter: null,
    encounterInit: {},
    treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    treasuryLog: [],
  } as unknown as CampaignDoc;
  campaign = {
    ...campaign,
    ...planRoll(campaign, { uid: "ana", roll: 15, bonuses: {}, now: 1 })?.patch,
  };
  let encounter = addMonster(campaign.encounter as EncounterState, {
    name: "Raider",
    ac: 13,
    maxHp: 11,
    count: 2,
    initiative: 17,
  });
  encounter = addMonster(encounter, {
    name: "Ogre",
    ac: 11,
    maxHp: 59,
    count: 1,
    initiative: 10,
  });
  if (begun) encounter = passTurn(encounter, 2);
  useCampaignStore.setState({ campaign: { ...campaign, encounter } });
}

describe("dmMoves.initiative", () => {
  beforeEach(() => seed(true));

  it("a begun fight: the raiders set to 12 move after the hero, together; undo puts all back", async () => {
    const raiders = idsOf("Raider");
    const [ogre] = idsOf("Ogre");
    const before = [...(fight().order ?? [])];
    expect(before).toEqual([...raiders, "pc-ana", ogre]);
    const place = initiativePlace(fight(), fighters(), raiders, 12);
    expect(place).toEqual({ beforeId: ogre });
    const undo = await dmMoves.initiative("camp", "dm", raiders, 12, place)();
    expect(fight().order).toEqual(["pc-ana", ...raiders, ogre]);
    expect(
      fight()
        .combatants.filter((c) => raiders.includes(c.id))
        .map((c) => (c.kind === "monster" ? c.initiative : null))
    ).toEqual([12, 12]);
    expect(await undo?.()).toBe(true);
    expect(fight().order).toEqual(before);
    expect(
      fight()
        .combatants.filter((c) => raiders.includes(c.id))
        .map((c) => (c.kind === "monster" ? c.initiative : null))
    ).toEqual([17, 17]);
  });
});

describe("before turns begin", () => {
  beforeEach(() => seed(false));

  it("no reorder is asked: the engine re-sorts by the new number", async () => {
    const [ogre] = idsOf("Ogre");
    if (!ogre) throw new Error("no ogre");
    const place = initiativePlace(fight(), fighters(), [ogre], 20);
    expect(place).toBeNull();
    await dmMoves.initiative("camp", "dm", [ogre], 20, place)();
    expect(fight().order?.[0]).toBe(ogre);
  });
});
