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

import { initiativePlace } from "@/domains/combat/initiative-edit";
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

  it("a hero's typed d20 re-sorts the begun order by the new total; whose turn it is stays", async () => {
    // Begun fight: the raiders (17) before Ana (15); the turn is on the second raider.
    const [r1, r2] = raiders().map((m) => m.id);
    if (!r1 || !r2) throw new Error("no raiders");
    expect(fight().order).toEqual([r1, r2, "pc-ana"]);
    const current = fight().currentCombatantId;
    // Ana's player tells the DM she rolled 20 (bonus 0): total 20, above the raiders.
    const fighters = (fight().order ?? []).map((id) => ({
      id,
      initiative: id === "pc-ana" ? 15 : 17,
    }));
    const place = initiativePlace(fight(), fighters, ["pc-ana"], 20);
    const undo = await dmMoves.heroRoll(
      "camp",
      "dm",
      "ana",
      20,
      { "pc-ana": 0 },
      place
    )();
    expect(fight().order).toEqual(["pc-ana", r1, r2]);
    expect(fight().currentCombatantId).toBe(current);
    expect(await undo?.()).toBe(true);
    expect(fight().order).toEqual([r1, r2, "pc-ana"]);
  });

  it("the hero holding the turn keeps it after the re-sort", async () => {
    const [r1, r2] = raiders().map((m) => m.id);
    if (!r1 || !r2) throw new Error("no raiders");
    // Pass until it is Ana's turn.
    const { passTurn: pass } = await import("@/lib/play/encounter-lifecycle");
    let f = fight();
    while (f.currentCombatantId !== "pc-ana") f = pass(f, 3);
    useCampaignStore.setState({
      campaign: {
        ...(useCampaignStore.getState().campaign as CampaignDoc),
        encounter: f,
      },
    });
    const fighters = (fight().order ?? []).map((id) => ({
      id,
      initiative: id === "pc-ana" ? 15 : 17,
    }));
    const place = initiativePlace(fight(), fighters, ["pc-ana"], 20);
    await dmMoves.heroRoll("camp", "dm", "ana", 20, { "pc-ana": 0 }, place)();
    expect(fight().order?.[0]).toBe("pc-ana");
    expect(fight().currentCombatantId).toBe("pc-ana");
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
