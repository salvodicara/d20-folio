/**
 * The 2024 Monk's Focus rows (SRD 5.2.1 Monk): Patient Defense with 1 Focus Point
 * takes Disengage AND Dodge; Step of the Wind takes Dash (its movement counts),
 * free or with Focus; Stunning Strike is once per turn.
 */
import { describe, expect, it } from "vitest";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { resolveActions } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";

const monk = makeCharacterDoc({
  classId: "monk",
  level: 5,
  features: [
    { srdId: "monk-patient-defense" },
    { srdId: "monk-step-of-the-wind" },
    { srdId: "monk-stunning-strike" },
  ],
});
const rows = (feature: string) =>
  resolveActions(monk, "combat").filter((a) => a.id.includes(feature));

describe("Monk Focus rows", () => {
  it("Patient Defense with Focus lights a Dodge: attacks against you at Disadvantage", () => {
    const focused = rows("monk-patient-defense").find((a) => a.id.endsWith("focused"));
    expect(focused).toBeDefined();
    const lit = structuredClone(monk);
    lit.session.activeFeatures = ["monk-patient-defense"];
    const aggregate = aggregateCharacterGrants(lit.character, lit.session);
    expect(aggregate.incomingAttackDisadvantages.length).toBeGreaterThan(0);
  });

  it("Step of the Wind's Dash adds movement, free or with Focus", () => {
    expect(rows("monk-step-of-the-wind").map((a) => a.economyCategory)).toEqual([
      "dash",
      "dash",
    ]);
  });

  it("Stunning Strike is once per turn", () => {
    expect(rows("monk-stunning-strike")[0]?.maxUsesPerTurn).toBe(1);
  });
});
