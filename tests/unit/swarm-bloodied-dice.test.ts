/**
 * SRD 5.2.1 Swarm of Bats, Bites: "5 (2d4) Piercing damage, or 2 (1d4) Piercing damage
 * if the swarm is Bloodied". The DM's action row reads the dice for the swarm's own Hit
 * Points; with no Hit Points given (a stat block, not a creature) it reads the print.
 */
import { describe, expect, it } from "vitest";

import { getMonster } from "@/data/monsters";
import { monsterActionDice, monsterActions } from "@/lib/play/monster-action";

const bites = () => {
  const block = getMonster("swarm-of-bats");
  if (!block) throw new Error("no swarm of bats");
  const action = monsterActions(block)[0];
  if (!action) throw new Error("no action");
  return action;
};

describe("a swarm's dice follow its Hit Points", () => {
  it("full Hit Points: the printed dice", () => {
    expect(monsterActionDice(bites(), { current: 11, max: 11 })).toEqual(["2d4"]);
    expect(monsterActionDice(bites())).toEqual(["2d4"]);
  });

  it("Bloodied: the smaller dice", () => {
    expect(monsterActionDice(bites(), { current: 5, max: 11 })).toEqual(["1d4"]);
  });
});
