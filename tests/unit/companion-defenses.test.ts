/** A companion stat block's damage resistances reach the resolved block, beside its immunities. */
import { describe, expect, it } from "vitest";
import { resolveCompanion } from "@/lib/compute";
import type { CompanionStatBlock } from "@/data/types";

const SCORES = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };

describe("companion defenses", () => {
  it("exposes the printed resistances and immunities as sets", () => {
    // The Construct Spirit (Summon Construct): Resistances Poison; Immunities Charmed.
    const block: CompanionStatBlock = {
      ac: { base: 17 },
      hp: { base: 40, perLevel: 0 },
      damageResistances: ["poison"],
      conditionImmunities: ["charmed"],
    };
    const resolved = resolveCompanion(block, 7, SCORES);
    expect([...resolved.damageResistances]).toEqual(["poison"]);
    expect([...resolved.damageImmunities]).toEqual([]);
  });

  it("is empty when the block prints none", () => {
    const resolved = resolveCompanion(
      { ac: { base: 12 }, hp: { base: 5, perLevel: 5 } },
      3,
      SCORES
    );
    expect(resolved.damageResistances.size).toBe(0);
    expect(resolved.damageVulnerabilities.size).toBe(0);
  });

  it("exposes the printed vulnerabilities", () => {
    const block: CompanionStatBlock = {
      ac: { base: 12 },
      hp: { base: 30, perLevel: 0 },
      damageVulnerabilities: ["fire"],
    };
    expect([...resolveCompanion(block, 5, SCORES).damageVulnerabilities]).toEqual([
      "fire",
    ]);
  });
});
