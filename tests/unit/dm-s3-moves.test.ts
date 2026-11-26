/**
 * The S3 moves the fight screen calls (the dev replica stands in for Firestore): the DM
 * types a hero's d20; takes the chosen creatures out of the fight; gives them temporary
 * HP. Each is one move with one undo over every chosen creature.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: true }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/session-log-source", async () => {
  const { createMemorySessionLogStore } = await import("@/lib/session-log");
  const store = createMemorySessionLogStore();
  return { sessionLogStoreFor: () => store };
});

import { dmMoves } from "@/domains/combat/ui/fight-moves";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { planRoll } from "@/features/campaigns/combat-lifecycle";
import { addMonster } from "@/lib/play/encounter";
import { passTurn } from "@/lib/play/encounter-lifecycle";
import type { CampaignDoc, EncounterMonster, EncounterState } from "@/types/campaign";

const member = (name: string) => ({
  displayName: name,
  role: "player",
  characterId: `c-${name}`,
  character: { name },
});

beforeEach(() => {
  let campaign = {
    id: "camp",
    dmUid: "dm",
    members: ["dm", "ana", "bo"],
    memberDetails: {
      dm: { displayName: "dm", role: "dm", characterId: null },
      ana: member("ana"),
      bo: member("bo"),
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
    name: "Raider",
    ac: 13,
    maxHp: 11,
    count: 2,
    initiative: 17,
  });
  useCampaignStore.setState({
    campaign: { ...campaign, encounter: passTurn(encounter, 2) },
  });
});

const fight = () => useCampaignStore.getState().campaign?.encounter as EncounterState;
const raiders = () =>
  fight().combatants.filter((c): c is EncounterMonster => c.kind === "monster");

describe("the S3 moves", () => {
  it("the DM types Bo's d20; the undo takes it back", async () => {
    const undo = await dmMoves.heroRoll("camp", "dm", "bo", 12, { "pc-bo": 2 })();
    expect(useCampaignStore.getState().campaign?.encounterInit?.bo).toBe(12);
    expect(await undo?.()).toBe(true);
    expect(useCampaignStore.getState().campaign?.encounterInit?.bo).toBeUndefined();
  });

  it("both raiders out of the fight; one undo brings both back in place", async () => {
    const before = [...(fight().order ?? [])];
    const undo = await dmMoves.remove(
      "camp",
      "dm",
      raiders().map((m) => m.id)
    )();
    expect(raiders()).toHaveLength(0);
    expect(await undo?.()).toBe(true);
    expect(fight().order).toEqual(before);
  });

  it("temp HP on both raiders; one undo takes it back", async () => {
    const undo = await dmMoves.tempHp(
      "camp",
      "dm",
      raiders().map((m) => m.id),
      5
    )();
    expect(raiders().map((m) => m.hp.temp)).toEqual([5, 5]);
    expect(await undo?.()).toBe(true);
    expect(raiders().map((m) => m.hp.temp)).toEqual([0, 0]);
  });
});
