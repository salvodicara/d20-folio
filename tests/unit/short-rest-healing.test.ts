/**
 * The HP a Short Rest's spent Hit Point Dice restore, read from the whole character
 * (SRD 5.2.1 "Short Rest": roll the dice, add the Constitution modifier to each, at
 * least 1 per die). The character's own items change it: the Periapt of Wound Closure
 * ("When you roll Hit Dice to regain HP, double the number of HP restored"). One
 * entry point for the rest screen, so it can never disagree with the rules.
 */
import { describe, expect, it } from "vitest";

import { shortRestHealing } from "@/lib/play/short-rest-healing";
import { makeCharacterDoc } from "./_helpers";

const fighter = (equipment = []) =>
  makeCharacterDoc({
    classId: "fighter",
    level: 5,
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 8 },
    equipment,
  });

describe("shortRestHealing", () => {
  it("the dice rolled plus the CON modifier per die", () => {
    // 2 dice rolled for 9, CON 14 (+2 each): 13.
    expect(shortRestHealing(fighter(), 2, 9)).toBe(13);
  });

  it("at least 1 HP per die", () => {
    const weak = makeCharacterDoc({
      classId: "fighter",
      level: 5,
      abilityScores: { STR: 10, DEX: 10, CON: 3, INT: 10, WIS: 10, CHA: 10 },
    });
    // 2 dice rolled for 2, CON 3 (−4 each): 2 − 8, but never under 1 per die.
    expect(shortRestHealing(weak, 2, 2)).toBe(2);
  });

  it("the Periapt of Wound Closure doubles it", () => {
    const worn = fighter([
      {
        srdId: "periapt-of-wound-closure",
        instanceId: "periapt-1",
        equipped: true,
        attuned: true,
        quantity: 1,
      },
    ] as never);
    expect(shortRestHealing(worn, 2, 9)).toBe(26);
  });

  it("no dice spent, nothing restored; a needed roll missing, unknown", () => {
    expect(shortRestHealing(fighter(), 0, null)).toBe(0);
    expect(shortRestHealing(fighter(), 2, null)).toBeNull();
  });
});
