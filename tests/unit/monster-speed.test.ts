import { describe, expect, it } from "vitest";

import { getMonster } from "@/data/monsters";
import {
  MONSTER_SPEED_MAX_FT,
  isMonsterSpeedFt,
  monsterWalkingSpeedFt,
} from "@/lib/monster-speed";

describe("monster walking speed", () => {
  // SRD 2024 Goblin Warrior: "Speed 30 ft."
  const goblinWalk = getMonster("goblin-warrior")?.speeds.walk;

  it("reads the stat block's walking speed when the DM set no override", () => {
    expect(goblinWalk).toBe(30);
    expect(monsterWalkingSpeedFt(undefined, goblinWalk)).toBe(30);
  });

  it("the DM's override wins over the stat block (Slow: 30 ft. becomes 20 ft.)", () => {
    expect(monsterWalkingSpeedFt(20, goblinWalk)).toBe(20);
  });

  it("an override of 0 is a real speed, not a missing one", () => {
    expect(monsterWalkingSpeedFt(0, goblinWalk)).toBe(0);
  });

  it("a hand-typed monster with no stat block and no override has no known speed", () => {
    expect(monsterWalkingSpeedFt(undefined, undefined)).toBeNull();
    expect(monsterWalkingSpeedFt(25, undefined)).toBe(25);
  });

  it("a stored speed is a non-negative integer number of feet up to the cap", () => {
    for (const ok of [0, 5, 30, 120, MONSTER_SPEED_MAX_FT]) {
      expect(isMonsterSpeedFt(ok), String(ok)).toBe(true);
    }
    for (const bad of [
      -5,
      2.5,
      Number.NaN,
      Infinity,
      MONSTER_SPEED_MAX_FT + 1,
      "30",
      null,
    ]) {
      expect(isMonsterSpeedFt(bad), String(bad)).toBe(false);
    }
  });
});
