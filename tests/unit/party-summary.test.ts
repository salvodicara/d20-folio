/**
 * partySummary — the DM's whole-party table (I-152): one row per attached hero,
 * sorted by name, with the best value of each comparable column marked so the DM
 * sees at a glance who notices most, who is hardest to hit, who acts first.
 */
import { describe, it, expect } from "vitest";
import { partySummary } from "@/features/campaigns/party-summary";
import type { PartyMemberStats } from "@/features/campaigns/party-stats";

function stats(over: Partial<PartyMemberStats>): PartyMemberStats {
  return {
    level: 5,
    ac: 15,
    currentHp: 30,
    maxHp: 40,
    tempHp: 0,
    passivePerception: 12,
    passiveInsight: 11,
    passiveInvestigation: 10,
    saves: [],
    senses: [],
    speeds: [],
    walkingSpeedFt: 30,
    initiativeBonus: 2,
    conditions: [],
    defenses: {} as PartyMemberStats["defenses"],
    conditionImmunities: new Set(),
    sourceConditionImmunities: [],
    ...over,
  };
}

describe("partySummary", () => {
  it("sorts heroes by name and marks the best of each column", () => {
    const { rows, best } = partySummary([
      { uid: "u2", name: "Lyra", stats: stats({ passivePerception: 16, ac: 13 }) },
      { uid: "u1", name: "Bren", stats: stats({ ac: 18, initiativeBonus: 4 }) },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Bren", "Lyra"]);
    expect([...best.passivePerception]).toEqual(["u2"]);
    expect([...best.ac]).toEqual(["u1"]);
    expect([...best.initiativeBonus]).toEqual(["u1"]);
  });

  it("marks every hero tied for the best, and nobody when all are equal", () => {
    const { best } = partySummary([
      { uid: "a", name: "A", stats: stats({ passiveInsight: 14 }) },
      { uid: "b", name: "B", stats: stats({ passiveInsight: 14 }) },
      { uid: "c", name: "C", stats: stats({ passiveInsight: 9 }) },
    ]);
    expect([...best.passiveInsight].sort()).toEqual(["a", "b"]);
    expect(best.walkingSpeedFt.size).toBe(0);
  });

  it("marks nothing for a party of one", () => {
    const { best } = partySummary([{ uid: "a", name: "A", stats: stats({}) }]);
    expect(best.ac.size).toBe(0);
  });
});
