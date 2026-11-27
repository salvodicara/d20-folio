/**
 * The DM's monster limited uses on the new fight screen (SRD 5.2.1): spend a Recharge,
 * N/Day or per-day spell use, roll the d6 for a spent Recharge (back at or above its
 * number), spend and regain legendary actions. Only the DM, only a monster; each move
 * has an undo that puts the count back (the dev replica stands in for Firestore).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: true }));
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { planMonsterUse, planRoll } from "@/features/campaigns/combat-lifecycle";
import { monsterUseMove } from "@/features/campaigns/combat-lifecycle-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { addMonster, type MonsterLimitedUse } from "@/lib/play/encounter";
import type { CampaignDoc, EncounterMonster, EncounterState } from "@/types/campaign";

const breath: MonsterLimitedUse = {
  key: "actions:fire-breath",
  max: 1,
  kind: "recharge",
  recharge: 5,
};
const legendary: MonsterLimitedUse = { key: "legendary", max: 3, kind: "legendary" };

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
    name: "Drake",
    ac: 17,
    maxHp: 90,
    count: 1,
    initiative: 12,
  });
  return { ...campaign, encounter };
}
const drakeOf = (c: CampaignDoc | null | undefined): EncounterMonster => {
  const m = c?.encounter?.combatants.find(
    (x): x is EncounterMonster => x.kind === "monster"
  );
  if (!m) throw new Error("no drake");
  return m;
};

describe("planMonsterUse", () => {
  it("spends a Recharge use; the d6 brings it back at 5 or more, not at 4", () => {
    let campaign = table();
    const id = drakeOf(campaign).id;
    const spent = planMonsterUse(campaign, {
      uid: "dm",
      monsterId: id,
      use: breath,
      change: { kind: "spend" },
    });
    campaign = { ...campaign, ...spent?.patch };
    expect(drakeOf(campaign).spent?.[breath.key]).toBe(1);
    const miss = planMonsterUse(campaign, {
      uid: "dm",
      monsterId: id,
      use: breath,
      change: { kind: "recharge", d6: 4 },
    });
    expect(miss?.back).toBe(false);
    const hit = planMonsterUse(campaign, {
      uid: "dm",
      monsterId: id,
      use: breath,
      change: { kind: "recharge", d6: 5 },
    });
    expect(hit?.back).toBe(true);
    expect(drakeOf({ ...campaign, ...hit?.patch }).spent?.[breath.key]).toBeUndefined();
  });

  it("legendary actions: spend to none left, then regain them all", () => {
    let campaign = table();
    const id = drakeOf(campaign).id;
    for (let i = 0; i < 4; i++) {
      const p = planMonsterUse(campaign, {
        uid: "dm",
        monsterId: id,
        use: legendary,
        change: { kind: "spend" },
      });
      if (p) campaign = { ...campaign, ...p.patch };
    }
    expect(drakeOf(campaign).spent?.legendary).toBe(3);
    const back = planMonsterUse(campaign, {
      uid: "dm",
      monsterId: id,
      use: legendary,
      change: { kind: "regain" },
    });
    expect(drakeOf({ ...campaign, ...back?.patch }).spent?.legendary).toBeUndefined();
  });

  it("only the DM, only a monster", () => {
    const campaign = table();
    const id = drakeOf(campaign).id;
    expect(
      planMonsterUse(campaign, {
        uid: "ana",
        monsterId: id,
        use: breath,
        change: { kind: "spend" },
      })
    ).toBeNull();
    expect(
      planMonsterUse(campaign, {
        uid: "dm",
        monsterId: "pc-ana",
        use: breath,
        change: { kind: "spend" },
      })
    ).toBeNull();
  });
});

describe("monsterUseMove", () => {
  beforeEach(() => useCampaignStore.setState({ campaign: table() }));

  it("spends, and the undo puts the count back", async () => {
    const id = drakeOf(useCampaignStore.getState().campaign).id;
    const done = await monsterUseMove("camp", {
      uid: "dm",
      monsterId: id,
      use: legendary,
      change: { kind: "spend" },
    });
    expect(drakeOf(useCampaignStore.getState().campaign).spent?.legendary).toBe(1);
    expect(await done?.undo()).toBe(true);
    expect(drakeOf(useCampaignStore.getState().campaign).spent).toBeUndefined();
  });

  it("a recharge roll says whether the use came back", async () => {
    const id = drakeOf(useCampaignStore.getState().campaign).id;
    await monsterUseMove("camp", {
      uid: "dm",
      monsterId: id,
      use: breath,
      change: { kind: "spend" },
    });
    const miss = await monsterUseMove("camp", {
      uid: "dm",
      monsterId: id,
      use: breath,
      change: { kind: "recharge", d6: 2 },
    });
    expect(miss?.back).toBe(false);
    const hit = await monsterUseMove("camp", {
      uid: "dm",
      monsterId: id,
      use: breath,
      change: { kind: "recharge", d6: 6 },
    });
    expect(hit?.back).toBe(true);
    expect(drakeOf(useCampaignStore.getState().campaign).spent).toBeUndefined();
  });
});
