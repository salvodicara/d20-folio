/**
 * The DM's monster card on the new fight screen (the classic MonsterCard body): rename,
 * Armor Class and private notes, as one plan only the DM may make, and its move with an
 * undo that puts every field back (the dev replica stands in for Firestore).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: true }));
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { planMonsterEdit, planRoll } from "@/features/campaigns/combat-lifecycle";
import { editMonsterMove } from "@/features/campaigns/combat-lifecycle-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { addMonster } from "@/lib/play/encounter";
import type { CampaignDoc, EncounterMonster, EncounterState } from "@/types/campaign";

function table(): CampaignDoc {
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
  const encounter = addMonster(campaign.encounter as EncounterState, {
    name: "Ogre",
    ac: 11,
    maxHp: 59,
    count: 1,
    initiative: 8,
  });
  return { ...campaign, encounter };
}

const ogreOf = (campaign: CampaignDoc | null | undefined): EncounterMonster => {
  const m = campaign?.encounter?.combatants.find(
    (c): c is EncounterMonster => c.kind === "monster"
  );
  if (!m) throw new Error("no ogre");
  return m;
};

describe("planMonsterEdit", () => {
  it("the DM renames it, sets its AC and notes; the plan keeps the old values", () => {
    const campaign = table();
    const ogre = ogreOf(campaign);
    const plan = planMonsterEdit(campaign, {
      uid: "dm",
      monsterId: ogre.id,
      name: "Grull the Ogre",
      ac: 13,
      notes: "Flees below 10 HP",
    });
    const edited = ogreOf({ ...campaign, ...plan?.patch });
    expect([edited.name, edited.ac, edited.notes]).toEqual([
      "Grull the Ogre",
      13,
      "Flees below 10 HP",
    ]);
    expect(plan?.previous).toEqual({ name: ogre.name, ac: 11, notes: "" });
  });

  it("a player, a hero, or no change: no plan", () => {
    const campaign = table();
    const ogre = ogreOf(campaign);
    expect(
      planMonsterEdit(campaign, { uid: "ana", monsterId: ogre.id, ac: 13 })
    ).toBeNull();
    expect(
      planMonsterEdit(campaign, { uid: "dm", monsterId: "pc-ana", ac: 13 })
    ).toBeNull();
    expect(
      planMonsterEdit(campaign, { uid: "dm", monsterId: ogre.id, ac: 11, name: "  " })
    ).toBeNull();
  });
});

describe("editMonsterMove", () => {
  beforeEach(() => useCampaignStore.setState({ campaign: table() }));

  it("edits, and the undo puts every field back", async () => {
    const id = ogreOf(useCampaignStore.getState().campaign).id;
    const before = ogreOf(useCampaignStore.getState().campaign);
    const undo = await editMonsterMove("camp", {
      uid: "dm",
      monsterId: id,
      name: "Grull",
      ac: 14,
      notes: "Hates fire",
    });
    expect(ogreOf(useCampaignStore.getState().campaign).ac).toBe(14);
    expect(await undo?.()).toBe(true);
    const after = ogreOf(useCampaignStore.getState().campaign);
    expect([after.name, after.ac, after.notes]).toEqual([before.name, 11, undefined]);
  });
});
