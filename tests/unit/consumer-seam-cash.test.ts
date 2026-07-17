/**
 * "Cash" data wiring for the consumer seams — pins the specific class
 * features that were given declarative grants in this pass, and verifies
 * they flow end-to-end through `resolveGrantSourcesForFeatures` →
 * `evaluateGrants` → the derive helpers.
 *
 * Touched features:
 *   L4  monk-disciplined-survivor        → all 6 save-proficiency grants
 *   L4  rogue-assassin-assassins-tools   → Disguise Kit + Poisoner's Kit tools
 *       (PACK subclass — content-pack/tests/unit/consumer-seam-cash.pack.test.ts)
 *   L5  paladin-aura-of-courage          → condition-immunity: frightened
 *   L5  paladin-devotion-aura-of-devotion→ condition-immunity: charmed
 *   L1  fighter-champion-remarkable-athlete → advantage-on (initiative, athletics)
 *   L1  ranger-precise-hunter            → advantage-on (Hunter's Mark target)
 */

import { describe, it, expect } from "vitest";
import { classFeatureIndex } from "@/data/classes";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { evaluateGrants } from "@/lib/grants";
import {
  mergeSaveProficiencies,
  deriveImmunities,
  deriveAdvantageChips,
} from "@/lib/views/sheet-view";
import type { Grant } from "@/lib/grants";

function grantsOf(id: string): ReadonlyArray<Grant> {
  const f = classFeatureIndex.get(id);
  expect(f, `feature ${id} must exist`).toBeTruthy();
  return f?.grants ?? [];
}

describe("L4 cash — monk-disciplined-survivor grants all 6 save proficiencies", () => {
  it("declares one save-proficiency grant per ability", () => {
    const saves = grantsOf("monk-disciplined-survivor").flatMap((g) =>
      g.type === "save-proficiency" ? [g.ability] : []
    );
    expect(new Set(saves)).toEqual(new Set(["STR", "DEX", "CON", "INT", "WIS", "CHA"]));
  });

  it("unions into the displayed saves via the aggregate", () => {
    const aggregate = evaluateGrants(
      resolveGrantSourcesForFeatures([{ srdId: "monk-disciplined-survivor" }])
    );
    const displayed = mergeSaveProficiencies(["STR", "DEX"], aggregate.saveProficiencies);
    expect(displayed).toHaveLength(6);
  });
});

// L4 cash — rogue-assassin-assassins-tools (a PACK subclass feature) is pinned
// in content-pack/tests/unit/consumer-seam-cash.pack.test.ts.

describe("L5 cash — Paladin auras grant condition immunities", () => {
  it("Aura of Courage → immune to Frightened", () => {
    const aggregate = evaluateGrants(
      resolveGrantSourcesForFeatures([{ srdId: "paladin-aura-of-courage" }])
    );
    expect(deriveImmunities(aggregate).conditionImmunities).toEqual(["frightened"]);
  });

  it("Aura of Devotion → immune to Charmed", () => {
    const aggregate = evaluateGrants(
      resolveGrantSourcesForFeatures([{ srdId: "paladin-devotion-aura-of-devotion" }])
    );
    expect(deriveImmunities(aggregate).conditionImmunities).toEqual(["charmed"]);
  });
});

describe("L1 cash — advantage chips", () => {
  it("Remarkable Athlete → advantage on Initiative + Athletics checks", () => {
    const aggregate = evaluateGrants(
      resolveGrantSourcesForFeatures([{ srdId: "fighter-champion-remarkable-athlete" }])
    );
    const chips = deriveAdvantageChips(aggregate);
    expect(chips).toHaveLength(2);
    expect(chips.every((c) => c.mode === "advantage" && c.rollType === "check")).toBe(
      true
    );
    expect(chips.map((c) => c.vs).sort()).toEqual(["athletics", "initiative"]);
  });

  it("Precise Hunter → advantage on attacks vs Hunter's Mark target", () => {
    const aggregate = evaluateGrants(
      resolveGrantSourcesForFeatures([{ srdId: "ranger-precise-hunter" }])
    );
    const chips = deriveAdvantageChips(aggregate);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ mode: "advantage", rollType: "attack" });
  });
});
