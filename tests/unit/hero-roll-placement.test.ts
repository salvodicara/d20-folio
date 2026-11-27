/**
 * A hero's typed d20 (the DM's, for a player at the table, or the player's own) takes its
 * place by its total. Before turns begin every roll re-sorts the order, the same way for
 * each roll: the dev «table» fight, with the goblins on top, once took 18 below 15 while
 * 25 went to the top.
 */
import { describe, expect, it } from "vitest";

import { planDmHeroRoll, planRoll } from "@/features/campaigns/combat-lifecycle";
import { makeDevTableFight } from "@/features/campaigns/dev-fixture";
import { partyBonuses } from "@/domains/combat/party-bonuses";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const heroes = ["member-ila", "member-mara", "member-lu", "member-bren"];
// The fixture sheets' initiative bonuses, as the fight screen reads them.
const bonuses: Record<string, number> = {
  "pc-member-bren": 3,
  "pc-member-ila": 3,
  "pc-member-lu": 7,
  "pc-member-mara": 3,
};

const table = (encounter: EncounterState, init: Record<string, number> = {}) =>
  ({
    id: "camp",
    dmUid: "dm",
    memberDetails: Object.fromEntries(
      heroes.map((uid) => [uid, { characterId: `c-${uid}`, character: { name: uid } }])
    ),
    encounterInit: init,
    encounter,
  }) as unknown as CampaignDoc;

const initiativeOf = (fight: EncounterState, init: Record<string, number>) => {
  const monsters = new Map(
    fight.combatants.flatMap((c) =>
      c.kind === "monster" && c.initiative !== null ? [[c.id, c.initiative]] : []
    )
  );
  return (id: string) => {
    if (monsters.has(id)) return monsters.get(id) ?? 0;
    const uid = id.replace(/^pc-/, "");
    return (init[uid] ?? 0) + (bonuses[id] ?? 0);
  };
};

/** Type the rolls one after another, as the DM does, and give back the order. */
function typeRolls(rolls: ReadonlyArray<[string, number]>, by: "dm" | "self") {
  let fight = makeDevTableFight();
  let init: Record<string, number> = {};
  for (const [uid, roll] of rolls) {
    const campaign = table(fight, init);
    const plan =
      by === "dm"
        ? planDmHeroRoll(campaign, { uid: "dm", heroUid: uid, roll, bonuses, now: 1 })
        : planRoll(campaign, { uid, roll, bonuses, now: 1 });
    if (!plan?.patch.encounter) throw new Error(`no plan for ${uid}`);
    fight = plan.patch.encounter;
    init = plan.patch.encounterInit ?? init;
  }
  const value = initiativeOf(fight, init);
  return (fight.order ?? []).map(value);
}

const descending = (values: number[]) =>
  values.every((v, i) => i === 0 || (values[i - 1] ?? v) >= v);

describe("a typed hero roll takes its place by its total", () => {
  const rolls: Array<[string, number]> = [
    ["member-bren", 12],
    ["member-ila", 15],
    ["member-lu", 18],
    ["member-mara", 7],
  ];

  it("the DM types the heroes' d20s: the order reads from high to low", () => {
    expect(descending(typeRolls(rolls, "dm"))).toBe(true);
  });

  it("each player types their own: the same", () => {
    expect(descending(typeRolls(rolls, "self"))).toBe(true);
  });

  it("the fight screen gives the planner every hero's bonus, not only the typed one's", () => {
    const pcs = Object.fromEntries(
      Object.entries(bonuses).map(([id, initiativeBonus]) => [id, { initiativeBonus }])
    );
    expect(partyBonuses(pcs)).toEqual(bonuses);
  });

  it("why it matters: with only the typed hero's bonus, the others re-sort without theirs", () => {
    // The old DM path: `{ [hero.id]: bonus }`. Torva's 15 + 3 sorts as 15, under the goblins.
    let fight = makeDevTableFight();
    let init: Record<string, number> = {};
    for (const [uid, roll] of rolls) {
      const only = { [`pc-${uid}`]: bonuses[`pc-${uid}`] ?? 0 };
      const plan = planDmHeroRoll(table(fight, init), {
        uid: "dm",
        heroUid: uid,
        roll,
        bonuses: only,
        now: 1,
      });
      fight = plan?.patch.encounter ?? fight;
      init = plan?.patch.encounterInit ?? init;
    }
    expect(descending((fight.order ?? []).map(initiativeOf(fight, init)))).toBe(false);
  });
});
