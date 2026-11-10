/**
 * The DM's limited uses on a monster card (headless): each counter the stat block
 * prints, with what is left, and the spent Recharge entries the DM rolls for at
 * the start of the monster's turn (SRD 5.2.1: "Recharge X–Y … at the start of each
 * of its turns"). Cases come from the bestiary.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { MonsterStatBlock } from "@/data/types";
import { monsterUsesView, rechargesDue } from "@/domains/combat/monster-uses-view";
import type { EncounterMonster } from "@/types/campaign";

let dragon: MonsterStatBlock;
beforeAll(async () => {
  const { MONSTERS } = await import("@/data/monsters");
  const found = MONSTERS.find((m) => m.id === "adult-red-dragon");
  if (!found) throw new Error("adult-red-dragon missing from the bestiary");
  dragon = found;
});

const monster = (spent?: Record<string, number>) =>
  ({
    id: "m1",
    kind: "monster",
    ...(spent ? { spent } : {}),
  }) as unknown as EncounterMonster;

describe("monsterUsesView", () => {
  it("lists each counter with what is left", () => {
    const rows = monsterUsesView(monster({ "actions:fire-breath": 1 }), dragon);
    const breath = rows.find((r) => r.key === "actions:fire-breath");
    expect(breath).toMatchObject({
      kind: "recharge",
      left: 0,
      max: 1,
      recharge: 5,
      entryId: "fire-breath",
    });
    const legendary = rows.find((r) => r.kind === "legendary");
    expect(legendary?.left).toBe(legendary?.max);
  });
});

describe("rechargesDue", () => {
  it("only the spent Recharge entries are rolled for", () => {
    expect(rechargesDue(monster(), dragon)).toEqual([]);
    expect(
      rechargesDue(monster({ "actions:fire-breath": 1 }), dragon).map((u) => u.key)
    ).toEqual(["actions:fire-breath"]);
  });
});
