import { describe, expect, it } from "vitest";

import {
  planCancel,
  planEnd,
  planReopen,
  planRoll,
  planRollForMissing,
  planUnrollMissing,
  type CombatPatch,
} from "@/features/campaigns/combat-lifecycle";
import { addMonster, setInitiative } from "@/features/campaigns/encounter";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const member = (characterId: string | null) => ({
  displayName: "x",
  role: "player",
  characterId,
  character: characterId ? { name: characterId } : null,
});

/** A table: the DM (no character) and two players with attached characters. */
function table(extra: Partial<CampaignDoc> = {}): CampaignDoc {
  return {
    id: "camp",
    memberDetails: { dm: member(null), ana: member("char-ana"), ben: member("char-ben") },
    encounterInit: {},
    ...extra,
  } as unknown as CampaignDoc;
}

const apply = (
  campaign: CampaignDoc,
  patch: CombatPatch | null | undefined
): CampaignDoc => {
  if (!patch) throw new Error("expected a move");
  return { ...campaign, ...patch };
};
const roll = (campaign: CampaignDoc, uid: string, value: number | null, now = 1000) =>
  planRoll(campaign, { uid, roll: value, bonuses: { "pc-ana": 2, "pc-ben": 1 }, now });

describe("a roll", () => {
  it("starts the fight with every attached member in it, the roller first", () => {
    const plan = roll(table(), "ana", 13);
    expect(plan?.started).toBe(true);
    const fight = plan?.patch.encounter;
    expect(fight?.combatants.map((c) => c.id)).toEqual(["pc-ana", "pc-ben"]);
    expect(fight?.order).toEqual(["pc-ana"]);
    expect(fight?.currentCombatantId).toBe("pc-ana");
    expect(fight?.clock).toMatchObject({ startedAt: 1000, turnsBegun: false });
    expect(plan?.patch.encounterInit).toEqual({ ana: 13 });
    expect(plan?.patch.encounterSkipped).toEqual({});
  });

  it("from a player with no character starts nothing", () => {
    expect(roll(table(), "dm", 13)).toBeNull();
  });

  it("re-sorts the order until the first turn is passed: a higher roll takes the top", () => {
    const started = apply(table(), roll(table(), "ana", 13)?.patch);
    const plan = roll(started, "ben", 15);
    expect(plan?.started).toBe(false);
    expect(plan?.patch.encounter?.order).toEqual(["pc-ben", "pc-ana"]);
    expect(plan?.patch.encounter?.currentCombatantId).toBe("pc-ben");
    expect(plan?.patch.encounterInit).toEqual({ ana: 13, ben: 15 });
  });

  it("after a turn was passed slots the late roller in without moving the turn", () => {
    const started = apply(table(), roll(table(), "ana", 13)?.patch);
    const fight = started.encounter;
    if (!fight?.clock) throw new Error("expected a lifecycle fight");
    const begun = {
      ...started,
      encounter: { ...fight, clock: { ...fight.clock, turnsBegun: true } },
    };
    const plan = roll(begun, "ben", 18);
    expect(plan?.patch.encounter?.order).toEqual(["pc-ben", "pc-ana"]);
    expect(plan?.patch.encounter?.currentCombatantId).toBe("pc-ana");
  });

  it("in a fight the DM runs by hand only records the roll", () => {
    const handRun = table({
      encounter: {
        combatants: [
          { kind: "pc", id: "pc-ana", memberUid: "ana", characterId: "char-ana" },
        ],
        nextMonsterOrdinal: 1,
        round: 2,
        currentCombatantId: "pc-ana",
        order: ["pc-ana"],
        epoch: 5,
        status: "active",
      },
    });
    expect(roll(handRun, "ben", 18)?.patch).toEqual({ encounterInit: { ben: 18 } });
  });

  it("taken back with no fight running does nothing", () => {
    expect(roll(table(), "ana", null)).toBeNull();
  });
});

describe("the undo of a roll that started the fight", () => {
  const started = apply(table(), roll(table(), "ana", 13)?.patch);
  const epoch = started.encounter?.epoch ?? 0;

  it("removes the fight while nobody has fought in it", () => {
    expect(planCancel(started, { uid: "ana", epoch })).toEqual({
      encounter: null,
      encounterInit: {},
    });
  });

  it("refuses once someone else rolled, a creature was added or a turn was passed", () => {
    const joined = apply(started, roll(started, "ben", 9)?.patch);
    expect(planCancel(joined, { uid: "ana", epoch })).toBeNull();
    const fight = started.encounter;
    if (!fight?.clock) throw new Error("expected a lifecycle fight");
    const withCreature = { ...started, encounter: { ...fight, nextMonsterOrdinal: 2 } };
    expect(planCancel(withCreature as CampaignDoc, { uid: "ana", epoch })).toBeNull();
    const begun = {
      ...started,
      encounter: { ...fight, clock: { ...fight.clock, turnsBegun: true } },
    };
    expect(planCancel(begun as CampaignDoc, { uid: "ana", epoch })).toBeNull();
  });

  it("refuses for another fight", () => {
    expect(planCancel(started, { uid: "ana", epoch: epoch + 1 })).toBeNull();
  });
});

describe("ending and reopening", () => {
  const running = apply(table(), roll(table(), "ana", 13)?.patch);

  it("an end clears the fight and keeps it, stamped with why and when", () => {
    const patch = planEnd(running, { reason: "manual", now: 5000 });
    expect(patch?.encounter).toBeNull();
    expect(patch?.endedEncounter).toEqual({
      ...running.encounter,
      ended: { reason: "manual", at: 5000 },
    });
  });

  it("a reopen brings the fight back where it stopped and empties the keep", () => {
    const ended = apply(running, planEnd(running, { reason: "idle", now: 5000 }));
    const patch = planReopen(ended, { now: 6000 });
    expect(patch?.endedEncounter).toBeNull();
    const { clock: reopenedClock, ...reopened } = patch?.encounter ?? {};
    const { clock: originalClock, ...original } = running.encounter ?? {};
    expect(reopened).toEqual(original);
    expect(reopenedClock).toEqual({ ...originalClock, lastActivityAt: 6000 });
  });

  it("nothing reopens while another fight runs, or when nothing ended", () => {
    const ended = apply(running, planEnd(running, { reason: "manual", now: 5000 }));
    const again = apply(ended, roll(ended, "ben", 11)?.patch);
    expect(planReopen(again, { now: 7000 })).toBeNull();
    expect(planReopen(table(), { now: 7000 })).toBeNull();
  });

  it("with no fight running, an end does nothing", () => {
    expect(planEnd(table(), { reason: "manual", now: 1 })).toBeNull();
  });
});

describe("the DM rolls for whoever has not rolled", () => {
  const dmTable = () => ({ ...table(), dmUid: "dm" });
  const d20 =
    (...rolls: number[]) =>
    () =>
      rolls.shift() ?? 10;

  it("rolls a d20 for each missing PC, in a fight one player started", () => {
    const started = apply(dmTable(), roll(dmTable(), "ana", 13)?.patch);
    const plan = planRollForMissing(started, {
      uid: "dm",
      bonuses: { "pc-ana": 2, "pc-ben": 1 },
      now: 2000,
      d20: d20(17),
    });
    expect(plan?.rolled).toEqual({ ben: 17 });
    expect(plan?.patch.encounterInit).toEqual({ ana: 13, ben: 17 });
    expect(plan?.patch.encounter?.order).toEqual(["pc-ben", "pc-ana"]);
  });

  it("starts the fight when nobody has rolled yet", () => {
    const plan = planRollForMissing(dmTable(), {
      uid: "dm",
      bonuses: {},
      now: 1000,
      d20: d20(4, 19),
    });
    expect(plan?.started).toBe(true);
    expect(plan?.patch.encounterInit).toEqual({ ana: 4, ben: 19 });
    expect(plan?.patch.encounter?.order).toEqual(["pc-ben", "pc-ana"]);
  });

  it("is the DM's alone, and does nothing when nobody is missing", () => {
    const started = apply(dmTable(), roll(dmTable(), "ana", 13)?.patch);
    expect(
      planRollForMissing(started, { uid: "ana", bonuses: {}, now: 1, d20: d20(5) })
    ).toBeNull();
    const all = apply(started, roll(started, "ben", 9)?.patch);
    expect(
      planRollForMissing(all, { uid: "dm", bonuses: {}, now: 1, d20: d20(5) })
    ).toBeNull();
  });

  it("its undo empties only the rows it filled, while they still hold its rolls", () => {
    const started = apply(dmTable(), roll(dmTable(), "ana", 13)?.patch);
    const plan = planRollForMissing(started, {
      uid: "dm",
      bonuses: {},
      now: 2000,
      d20: d20(17),
    });
    const rolled = apply(started, plan?.patch);
    const undo = planUnrollMissing(rolled, {
      rolled: plan?.rolled ?? {},
      started: false,
      epoch: plan?.epoch ?? 0,
      bonuses: {},
      now: 3000,
    });
    expect(undo?.encounterInit).toEqual({ ana: 13 });
    expect(undo?.encounter?.order).toEqual(["pc-ana"]);
    // Ben re-rolled his own row meanwhile: his roll stays.
    const rerolled = apply(rolled, roll(rolled, "ben", 2)?.patch);
    expect(
      planUnrollMissing(rerolled, {
        rolled: plan?.rolled ?? {},
        started: false,
        epoch: plan?.epoch ?? 0,
        bonuses: {},
        now: 3000,
      })
    ).toBeNull();
  });

  it("the undo of a roll that started the fight takes the fight away", () => {
    const plan = planRollForMissing(dmTable(), {
      uid: "dm",
      bonuses: {},
      now: 1000,
      d20: d20(4, 19),
    });
    const rolled = apply(dmTable(), plan?.patch);
    expect(
      planUnrollMissing(rolled, {
        rolled: plan?.rolled ?? {},
        started: true,
        epoch: plan?.epoch ?? 0,
        bonuses: {},
        now: 2000,
      })
    ).toEqual({ encounter: null, encounterInit: {} });
  });
});

describe("the turn order of a fight a roll started, as creatures join (Scontro report)", () => {
  // Three players roll 19, 15 and 15; the DM then adds creatures with their own initiative.
  const party = () =>
    ({
      id: "camp",
      memberDetails: {
        dm: member(null),
        ana: member("char-ana"),
        ben: member("char-ben"),
        cid: member("char-cid"),
      },
      encounterInit: {},
    }) as unknown as CampaignDoc;
  const rolled = (): CampaignDoc => {
    let campaign = party();
    for (const [uid, value] of [
      ["ana", 19],
      ["ben", 15],
      ["cid", 15],
    ] as const) {
      campaign = apply(
        campaign,
        planRoll(campaign, { uid, roll: value, bonuses: {}, now: 1 })?.patch
      );
    }
    return campaign;
  };
  const raider = { name: "Ash Raider", ac: 13, maxHp: 11, count: 2, initiative: 17 };
  const totals = (fight: EncounterState): Array<number | null> =>
    (fight.order ?? []).map((id) => {
      const c = fight.combatants.find((x) => x.id === id);
      return c?.kind === "monster" ? c.initiative : (fight.initiatives?.[id] ?? null);
    });

  it("before the first pass, every creature takes its place by initiative, groups together", () => {
    let fight = rolled().encounter as EncounterState;
    fight = addMonster(fight, raider);
    fight = addMonster(fight, { ...raider, name: "Goblin", count: 2, initiative: 11 });
    fight = addMonster(fight, {
      ...raider,
      name: "Goblin Boss",
      count: 1,
      initiative: 8,
    });
    expect(totals(fight)).toEqual([19, 17, 17, 15, 15, 11, 11, 8]);
    expect(fight.currentCombatantId).toBe("pc-ana");
  });

  it("a creature's initiative set later moves it to its place", () => {
    let fight = addMonster(rolled().encounter as EncounterState, {
      ...raider,
      initiative: null,
    });
    fight = setInitiative(fight, "monster-1", 20);
    expect(totals(fight)[0]).toBe(20);
  });

  it("after the first pass, a newcomer slots in by initiative and the turn stays", () => {
    const fight = rolled().encounter as EncounterState;
    const begun: EncounterState = {
      ...fight,
      ...(fight.clock ? { clock: { ...fight.clock, turnsBegun: true } } : {}),
      currentCombatantId: "pc-ben",
    };
    const next = addMonster(begun, { ...raider, count: 1, initiative: 16 });
    expect(totals(next)).toEqual([19, 16, 15, 15]);
    expect(next.currentCombatantId).toBe("pc-ben");
  });

  it("a fight the DM runs by hand keeps the DM's order (the creature is appended)", () => {
    const handRun: EncounterState = {
      combatants: [
        { kind: "pc", id: "pc-ana", memberUid: "ana", characterId: "char-ana" },
      ],
      nextMonsterOrdinal: 1,
      round: 1,
      currentCombatantId: "pc-ana",
      order: ["pc-ana"],
      epoch: 1,
      status: "active",
    };
    expect(addMonster(handRun, { ...raider, count: 1, initiative: 30 }).order).toEqual([
      "pc-ana",
      "monster-1",
    ]);
  });
});
