/**
 * The DM damages a PC from the new campaign page (Direction's blocker 2). The hit lands
 * on the PC through the peer-hit path (their own damage rule); the fight records the
 * beat, and what the hit sends back (Armor of Agathys) lands on the attacker in the same
 * write. Its undo takes back exactly the lines it added, the attacker's HP included.
 * Only the DM moves, and only in a running fight.
 */
import { describe, expect, it } from "vitest";

import {
  planAddMonsters,
  planMonsterCondition,
  planMonsterHp,
  planMonsterInitiative,
  planPcDamageBeat,
  planRemoveUntouched,
  planUndoBeats,
} from "@/features/campaigns/combat-lifecycle";
import {
  addMonster,
  beginEncounterTurns,
  startEncounter,
} from "@/features/campaigns/encounter";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const fight = (): EncounterState => {
  let state = startEncounter({}, [], 1_000);
  state = addMonster(state, {
    ac: 13,
    count: 1,
    initiative: 12,
    maxHp: 10,
    name: "Goblin",
  });
  return beginEncounterTurns(state, ["monster-1"]);
};

const table = (encounter: EncounterState | null = fight()) =>
  ({
    id: "camp",
    dmUid: "dm",
    memberDetails: {},
    encounterInit: {},
    encounter,
  }) as unknown as CampaignDoc;

const hit = {
  uid: "dm",
  campaignId: "camp",
  targetId: "pc-ana",
  amount: 7,
  preCurrent: 12,
  postCurrent: 5,
  max: 20,
  attackerId: "monster-1",
  retaliations: [],
};

const monsterHp = (state: EncounterState | null | undefined) =>
  state?.combatants.find((c) => c.id === "monster-1" && c.kind === "monster");

describe("the DM's hit on a PC", () => {
  it("records the beat, with the attacker", () => {
    const plan = planPcDamageBeat(table(), hit);
    expect(plan?.patch.encounter?.events?.at(-1)).toMatchObject({
      kind: "hp-damage",
      targetId: "pc-ana",
      amount: 7,
      current: 5,
      attackerId: "monster-1",
    });
    expect(plan?.eventIds).toHaveLength(1);
  });

  it("a hit that drops the PC also records the fall", () => {
    const plan = planPcDamageBeat(table(), { ...hit, postCurrent: 0 });
    expect(plan?.patch.encounter?.events?.map((e) => e.kind)).toEqual([
      "hp-damage",
      "down",
    ]);
  });

  it("is the DM's alone, and needs a running fight", () => {
    expect(planPcDamageBeat(table(), { ...hit, uid: "ana" })).toBeNull();
    expect(planPcDamageBeat(table(null), hit)).toBeNull();
  });

  it("Armor of Agathys' cold lands on the attacker in the same write, and the undo takes all back", () => {
    const plan = planPcDamageBeat(table(), {
      ...hit,
      retaliations: [
        {
          actor: {
            kind: "pc",
            combatantId: "pc-ana",
            memberUid: "ana",
            characterId: "c-ana",
          },
          target: { kind: "monster", combatantId: "monster-1" },
          amount: 5,
          damageType: "cold",
          effectId: "aoa-1",
          sourceId: "armor-of-agathys",
        },
      ],
    });
    expect(monsterHp(plan?.patch.encounter)).toMatchObject({ hp: { current: 5 } });
    const after = table(plan?.patch.encounter ?? null);
    const undo = planUndoBeats(after, {
      uid: "dm",
      campaignId: "camp",
      eventIds: plan?.eventIds ?? [],
    });
    expect(monsterHp(undo?.encounter)).toMatchObject({ hp: { current: 10 } });
    expect(undo?.encounter?.events ?? []).toEqual([]);
  });
});

describe("the DM's hit or heal on a monster", () => {
  it("a hit lands through the monster's own defenses and its undo gives the HP back", () => {
    const plan = planMonsterHp(table(), {
      uid: "dm",
      campaignId: "camp",
      monsterId: "monster-1",
      change: { kind: "damage", parts: [{ amount: 4, type: "fire" }] },
    });
    expect(monsterHp(plan?.patch.encounter)).toMatchObject({ hp: { current: 6 } });
    const undo = planUndoBeats(table(plan?.patch.encounter ?? null), {
      uid: "dm",
      campaignId: "camp",
      eventIds: plan?.eventIds ?? [],
    });
    expect(monsterHp(undo?.encounter)).toMatchObject({ hp: { current: 10 } });
  });

  it("a heal adds HP up to its maximum", () => {
    const hurt = planMonsterHp(table(), {
      uid: "dm",
      campaignId: "camp",
      monsterId: "monster-1",
      change: { kind: "damage", parts: [{ amount: 6 }] },
    });
    const healed = planMonsterHp(table(hurt?.patch.encounter ?? null), {
      uid: "dm",
      campaignId: "camp",
      monsterId: "monster-1",
      change: { kind: "heal", amount: 10 },
    });
    expect(monsterHp(healed?.patch.encounter)).toMatchObject({ hp: { current: 10 } });
  });

  it("is the DM's alone", () => {
    expect(
      planMonsterHp(table(), {
        uid: "ana",
        campaignId: "camp",
        monsterId: "monster-1",
        change: { kind: "heal", amount: 1 },
      })
    ).toBeNull();
  });
});

describe("the DM's condition and initiative edits on a monster", () => {
  const monster = (state: EncounterState | null | undefined) =>
    state?.combatants.find((c) => c.id === "monster-1");

  it("a condition goes on and records its line; the inverse takes it off", () => {
    const on = planMonsterCondition(table(), {
      uid: "dm",
      monsterId: "monster-1",
      conditionId: "prone",
      active: true,
    });
    expect(monster(on?.encounter)).toMatchObject({ conditions: ["prone"] });
    expect(on?.encounter?.events?.at(-1)).toMatchObject({
      kind: "condition-gain",
      targetId: "monster-1",
      conditionId: "prone",
    });
    const off = planMonsterCondition(table(on?.encounter ?? null), {
      uid: "dm",
      monsterId: "monster-1",
      conditionId: "prone",
      active: false,
    });
    expect(monster(off?.encounter)).toMatchObject({ conditions: [] });
  });

  it("a condition it already has (or lacks) changes nothing", () => {
    expect(
      planMonsterCondition(table(), {
        uid: "dm",
        monsterId: "monster-1",
        conditionId: "prone",
        active: false,
      })
    ).toBeNull();
  });

  it("initiative takes the new value and hands back the old one for the undo", () => {
    const plan = planMonsterInitiative(table(), {
      uid: "dm",
      monsterId: "monster-1",
      value: 19,
    });
    expect(monster(plan?.patch.encounter)).toMatchObject({ initiative: 19 });
    expect(plan?.previous).toBe(12);
  });

  it("are the DM's alone", () => {
    expect(
      planMonsterInitiative(table(), { uid: "ana", monsterId: "monster-1", value: 3 })
    ).toBeNull();
  });
});

describe("the DM adds monsters to the running fight", () => {
  const wolves = {
    name: "Wolf",
    ac: 13,
    maxHp: 11,
    count: 2,
    initiative: 14,
    srdId: "wolf",
  };

  it("they join the fight, and the move names them for its undo", () => {
    const plan = planAddMonsters(table(), { uid: "dm", monster: wolves });
    expect(plan?.added).toEqual(["monster-2", "monster-3"]);
    expect(
      plan?.patch.encounter?.combatants.filter((c) => c.kind === "monster")
    ).toHaveLength(3);
  });

  it("only in a running fight, and only by the DM (v1: no staging)", () => {
    expect(planAddMonsters(table(null), { uid: "dm", monster: wolves })).toBeNull();
    expect(planAddMonsters(table(), { uid: "ana", monster: wolves })).toBeNull();
  });

  it("the undo takes them out while nobody has touched them", () => {
    const plan = planAddMonsters(table(), { uid: "dm", monster: wolves });
    const after = table(plan?.patch.encounter ?? null);
    const undo = planRemoveUntouched(after, { uid: "dm", ids: plan?.added ?? [] });
    expect(undo?.encounter?.combatants.map((c) => c.id)).toEqual(["monster-1"]);
  });

  it("a wolf already hurt stays: the undo refuses", () => {
    const plan = planAddMonsters(table(), { uid: "dm", monster: wolves });
    const hurt = planMonsterHp(table(plan?.patch.encounter ?? null), {
      uid: "dm",
      campaignId: "camp",
      monsterId: "monster-2",
      change: { kind: "damage", parts: [{ amount: 3 }] },
    });
    expect(
      planRemoveUntouched(table(hurt?.patch.encounter ?? null), {
        uid: "dm",
        ids: plan?.added ?? [],
      })
    ).toBeNull();
  });
});
