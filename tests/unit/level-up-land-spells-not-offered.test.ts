/**
 * A Circle of the Land Druid reaching 7 on Arid land gets Blight always prepared
 * (SRD 5.2.1 Circle of the Land Spells, Arid: "7 — Blight"). The level-up must not
 * also offer Blight as one of its new prepared spells: the pick would add nothing
 * and leave the prepared list one short.
 */
import { describe, expect, it } from "vitest";

import { levelUpAsks, NO_ANSWERS } from "@/domains/leveling/level-up-asks";
import { buildScenario } from "@/lib/dev-scenarios";

const landDruid = (level: number, land: string) =>
  buildScenario({
    name: "Land Druid",
    raceId: "halfling",
    background: "",
    classId: "druid",
    subclassId: "circle-of-the-land",
    level,
    abilityScores: { STR: 10, DEX: 14, CON: 14, INT: 12, WIS: 16, CHA: 10 },
    grantBundleChoices: { "druid-land-terrain": land },
  });

const offered = (level: number, land: string) =>
  levelUpAsks(landDruid(level, land), "druid", NO_ANSWERS, "en")
    .rows.find((r) => r.key === "newSpells")
    ?.options.map((o) => o.id) ?? [];

describe("Circle of the Land spells a level reaches are not offered as picks", () => {
  it("Arid, 6 → 7: Blight is not a new prepared spell", () => {
    expect(offered(6, "arid")).not.toContain("blight");
  });

  it("Polar, 6 → 7: Ice Storm is not a new prepared spell", () => {
    expect(offered(6, "polar")).not.toContain("ice-storm");
  });

  it("another land's level-7 spell stays a pick (Arid does not hide Ice Storm)", () => {
    expect(offered(6, "arid")).toContain("ice-storm");
  });
});
