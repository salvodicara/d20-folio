/**
 * The DM's turn-order and creature tools on the new fight screen (the classic hub's
 * InitVital, MonsterCard «Remove» and temp HP): type a hero's d20 for a player without
 * the app, take a creature out of the fight and put it back, give a monster temp HP.
 * Each is a plan only the DM may make, and a move whose undo puts things back (the dev
 * replica stands in for Firestore).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: true }));
vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  planDmHeroRoll,
  planMonsterTempHp,
  planRemoveCombatant,
  planRestoreCombatant,
  planRoll,
} from "@/features/campaigns/combat-lifecycle";
import {
  removeCombatantMove,
  setMonsterTempHpMove,
  typeHeroRollMove,
} from "@/features/campaigns/combat-lifecycle-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { addMonster } from "@/lib/play/encounter";
import { passTurn } from "@/lib/play/encounter-lifecycle";
import type { CampaignDoc, EncounterMonster, EncounterState } from "@/types/campaign";

const member = (name: string) => ({
  displayName: name,
  role: "player",
  characterId: `c-${name}`,
  character: { name },
});

/** A DM and two heroes: Ana rolled 15, Bo has not; two raiders on 17. */
function table(begun = false): CampaignDoc {
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
  let encounter = addMonster(campaign.encounter as EncounterState, {
    name: "Raider",
    ac: 13,
    maxHp: 11,
    count: 2,
    initiative: 17,
  });
  if (begun) encounter = passTurn(encounter, 2);
  return { ...campaign, encounter };
}

const fight = () => useCampaignStore.getState().campaign?.encounter as EncounterState;
const raiders = (f: EncounterState | null | undefined) =>
  (f?.combatants ?? []).filter((c): c is EncounterMonster => c.kind === "monster");

describe("the DM types a hero's d20", () => {
  it("records it as the hero's roll; a player cannot type another's", () => {
    const campaign = table();
    const plan = planDmHeroRoll(campaign, {
      uid: "dm",
      heroUid: "bo",
      roll: 12,
      bonuses: { "pc-bo": 2 },
      now: 2,
    });
    expect(plan?.patch.encounterInit?.bo).toBe(12);
    expect(plan?.patch.encounter?.order).toContain("pc-bo");
    expect(
      planDmHeroRoll(campaign, {
        uid: "ana",
        heroUid: "bo",
        roll: 12,
        bonuses: {},
        now: 2,
      })
    ).toBeNull();
  });

  it("only for a hero of this campaign", () => {
    expect(
      planDmHeroRoll(table(), { uid: "dm", heroUid: "zed", roll: 9, bonuses: {}, now: 2 })
    ).toBeNull();
  });

  it("the move, and its undo gives the hero back their own roll (none)", async () => {
    useCampaignStore.setState({ campaign: table() });
    const recorder = {
      record: vi.fn(() => Promise.resolve("line-1")),
      retract: vi.fn(() => Promise.resolve("x")),
    };
    const undo = await typeHeroRollMove(
      "camp",
      { uid: "dm", heroUid: "bo", roll: 12, bonuses: { "pc-bo": 2 } },
      recorder
    );
    expect(useCampaignStore.getState().campaign?.encounterInit?.bo).toBe(12);
    expect(recorder.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "initiative",
        actor: "pc-bo",
        roll: 12,
        total: 14,
        rolledBy: "dm",
      }),
      expect.anything()
    );
    expect(await undo?.()).toBe(true);
    expect(useCampaignStore.getState().campaign?.encounterInit?.bo).toBeUndefined();
    expect(recorder.retract).toHaveBeenCalledWith("line-1");
  });
});

describe("take a creature out of the fight", () => {
  it("the DM removes a raider; the plan keeps what the undo needs", () => {
    const campaign = table(true);
    const [first, second] = raiders(campaign.encounter);
    if (!first || !second) throw new Error("no raiders");
    const plan = planRemoveCombatant(campaign, { uid: "dm", id: first.id });
    expect(plan?.patch.encounter?.combatants.some((c) => c.id === first.id)).toBe(false);
    expect(plan?.removed.combatant.id).toBe(first.id);
    expect(plan?.removed.beforeId).toBe(second.id);
    expect(planRemoveCombatant(campaign, { uid: "ana", id: first.id })).toBeNull();
    expect(planRemoveCombatant(campaign, { uid: "dm", id: "pc-ana" })).toBeNull();
  });

  it("putting it back restores its place, and whose turn it was", () => {
    const campaign = table(true);
    const before = campaign.encounter as EncounterState;
    const current = before.currentCombatantId;
    if (!current) throw new Error("no turn");
    const plan = planRemoveCombatant(campaign, { uid: "dm", id: current });
    if (!plan) throw new Error("no plan");
    const removed = { ...campaign, ...plan.patch };
    const back = planRestoreCombatant(removed, { uid: "dm", removed: plan.removed });
    expect(back?.encounter?.order).toEqual(before.order);
    expect(back?.encounter?.currentCombatantId).toBe(current);
    expect(back?.encounter?.round).toBe(before.round);
    // Twice is nothing: it is already back.
    expect(
      planRestoreCombatant({ ...removed, ...back }, { uid: "dm", removed: plan.removed })
    ).toBeNull();
  });

  it("the move and its undo", async () => {
    useCampaignStore.setState({ campaign: table(true) });
    const before = fight();
    const [first] = raiders(before);
    if (!first) throw new Error("no raider");
    const undo = await removeCombatantMove("camp", { uid: "dm", id: first.id });
    expect(raiders(fight())).toHaveLength(1);
    expect(await undo?.()).toBe(true);
    expect(fight().order).toEqual(before.order);
    expect(raiders(fight()).map((m) => m.id)).toContain(first.id);
  });
});

describe("temp HP on a monster", () => {
  it("the DM sets it; the plan keeps the old value; a hero is not the DM's to set", () => {
    const campaign = table();
    const [raider] = raiders(campaign.encounter);
    if (!raider) throw new Error("no raider");
    const plan = planMonsterTempHp(campaign, {
      uid: "dm",
      monsterId: raider.id,
      temp: 5,
    });
    expect(raiders(plan?.patch.encounter)[0]?.hp.temp).toBe(5);
    expect(plan?.previous).toBe(0);
    expect(
      planMonsterTempHp(campaign, { uid: "dm", monsterId: "pc-ana", temp: 5 })
    ).toBeNull();
    expect(
      planMonsterTempHp(campaign, { uid: "ana", monsterId: raider.id, temp: 5 })
    ).toBeNull();
  });

  it("the move and its undo", async () => {
    useCampaignStore.setState({ campaign: table() });
    const [raider] = raiders(fight());
    if (!raider) throw new Error("no raider");
    const undo = await setMonsterTempHpMove("camp", {
      uid: "dm",
      monsterId: raider.id,
      temp: 6,
    });
    expect(raiders(fight())[0]?.hp.temp).toBe(6);
    expect(await undo?.()).toBe(true);
    expect(raiders(fight())[0]?.hp.temp).toBe(0);
  });
});

beforeEach(() => useCampaignStore.setState({ campaign: null }));
