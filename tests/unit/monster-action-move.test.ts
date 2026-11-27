/**
 * A monster's action applied as one move (the dev replica stands in for Firestore):
 * every monster target takes its damage and its failed-save condition, and one undo
 * puts them all back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: true }));
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { dmMoves } from "@/domains/combat/ui/fight-moves";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { planRoll } from "@/features/campaigns/combat-lifecycle";
import { addMonster } from "@/lib/play/encounter";
import type { CampaignDoc, EncounterMonster, EncounterState } from "@/types/campaign";

beforeEach(() => {
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
    name: "Drake",
    ac: 17,
    maxHp: 90,
    count: 1,
    initiative: 12,
  });
  encounter = addMonster(encounter, {
    name: "Wolf",
    ac: 13,
    maxHp: 11,
    count: 2,
    initiative: 8,
  });
  useCampaignStore.setState({ campaign: { ...campaign, encounter } });
});

const monsters = () =>
  (useCampaignStore.getState().campaign?.encounter?.combatants ?? []).filter(
    (c): c is EncounterMonster => c.kind === "monster"
  );

describe("dmMoves.monsterAction", () => {
  it("both wolves take the breath and fall prone; one undo puts them back", async () => {
    const [drake, w1, w2] = monsters();
    if (!drake || !w1 || !w2) throw new Error("no creatures");
    const wolf = (id: string) => ({
      id,
      kind: "monster" as const,
      name: "Wolf",
      hp: { current: 11, max: 11, temp: 0 },
      conditions: [],
    });
    const undo = await dmMoves.monsterAction("camp", "dm", [
      {
        kind: "monster",
        monsterId: w1.id,
        change: { kind: "damage", parts: [{ amount: 6 }], attackerId: drake.id },
      },
      { kind: "condition", target: wolf(w1.id), conditionId: "prone" },
      {
        kind: "monster",
        monsterId: w2.id,
        change: { kind: "damage", parts: [{ amount: 3 }], attackerId: drake.id },
      },
    ])();
    const [, a, b] = monsters();
    expect([a?.hp.current, b?.hp.current]).toEqual([5, 8]);
    expect(a?.conditions).toContain("prone");
    expect(await undo?.()).toBe(true);
    const [, c, d] = monsters();
    expect([c?.hp.current, d?.hp.current]).toEqual([11, 11]);
    expect(c?.conditions).not.toContain("prone");
  });

  it("a player's tap moves nothing", async () => {
    const [drake, w1] = monsters();
    if (!drake || !w1) throw new Error("no creatures");
    expect(
      await dmMoves.monsterAction("camp", "ana", [
        {
          kind: "monster",
          monsterId: w1.id,
          change: { kind: "damage", parts: [{ amount: 6 }], attackerId: drake.id },
        },
      ])()
    ).toBeNull();
  });
});
