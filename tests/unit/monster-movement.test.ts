/**
 * How far a monster's move entry takes it, in feet: the printed distance of a
 * teleport or jump, or the share of the block's own Speed a move uses (Troll's
 * Charge is half its 30 ft.). Cases are real SRD 5.2.1 stat blocks.
 */
import { describe, expect, it } from "vitest";

import { MONSTERS } from "@/data/monsters";
import type { MonsterStatBlock } from "@/data/types";
import { monsterMovementFeet, monsterMovements } from "@/lib/play/monster-movement";

function monster(id: string): MonsterStatBlock {
  const found = MONSTERS.find((block) => block.id === id);
  if (!found) throw new Error(`no monster ${id}`);
  return found;
}

describe("monsterMovementFeet", () => {
  it.each([
    ["blink-dog", "teleport", 40],
    ["balor", "teleport", 60],
    ["bulette", "leap", 30],
    ["lion", "running-leap", 25],
    ["troll", "charge", 15],
    ["adult-red-dragon", "pounce", 20],
    ["roc", "swoop", 60],
    ["xorn", "charge", 20],
    ["sahuagin-warrior", "aquatic-charge", 40],
    ["purple-worm", "tunneler", 25],
    ["vampire", "spider-climb", undefined],
    ["assassin", "cunning-action", undefined],
  ] as const)("%s %s → %s ft", (id, entryId, feet) => {
    const block = monster(id);
    const move = monsterMovements(block).find((m) => m.entryId === entryId);
    expect(move, `${id}.${entryId}`).toBeDefined();
    expect(move && monsterMovementFeet(block, move.movement)).toBe(feet);
  });

  it("lists every move entry of the block, section then print order", () => {
    expect(monsterMovements(monster("vampire")).map((m) => m.entryId)).toEqual([
      "spider-climb",
      "deathless-strike",
    ]);
    expect(monsterMovements(monster("owlbear"))).toEqual([]);
  });
});
