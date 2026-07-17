/**
 * `roll-floor` grant primitive — Rogue Reliable Talent (L7): treat a d20 roll of
 * 9 or lower as a 10 on ability checks that add your Proficiency Bonus. Verified
 * against http://dnd2024.wikidot.com/rogue:main. The engine rolls no dice — the
 * rail's Passives section surfaces it as a note.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { litText } from "@/lib/loc-text";
import { classFeatureIndex } from "@/data/classes";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { buildScenario } from "@/lib/dev-scenarios";

describe("evaluateGrants — roll-floor aggregation", () => {
  it("records a Reliable-Talent-shaped roll floor", () => {
    const src: GrantSource = {
      id: "x",
      name: { en: "Reliable Talent", it: "Dote Affidabile" },
      grants: [
        {
          type: "roll-floor",
          rollType: "check",
          floor: 10,
          appliesTo: "proficient",
          description: { en: "Treat ≤9 as 10", it: "Tratta ≤9 come 10" },
        },
      ],
    };
    expect(evaluateGrants([src]).rollFloors).toEqual([
      {
        sourceId: "x",
        rollType: "check",
        floor: 10,
        appliesTo: "proficient",
        // Synthetic source (no catalogue `ref`) → the engine literal fallback.
        description: litText({ en: "Treat ≤9 as 10", it: "Tratta ≤9 come 10" }),
      },
    ]);
  });

  it("is empty by default", () => {
    expect(evaluateGrants([]).rollFloors).toEqual([]);
  });
});

describe("Rogue Reliable Talent declares the roll-floor", () => {
  it("carries a check floor of 10 on proficient checks", () => {
    const grants = classFeatureIndex.get("rogue-reliable-talent")?.grants ?? [];
    const floor = grants.find((g) => g.type === "roll-floor");
    expect(floor).toMatchObject({
      type: "roll-floor",
      rollType: "check",
      floor: 10,
      appliesTo: "proficient",
    });
  });
});

describe("a built Rogue 7 surfaces the roll-floor in its aggregate", () => {
  it("aggregate.rollFloors has the proficient-check floor", () => {
    // Reliable Talent is a BASE-class Rogue L7 feature, so any Rogue 7 build
    // (Thief here — a public subclass) carries it.
    const doc = buildScenario({
      name: "Pip, Thief",
      raceId: "halfling",
      classId: "rogue",
      subclassId: "thief",
      level: 7,
      background: "criminal",
      abilityScores: { STR: 10, DEX: 17, CON: 14, INT: 12, WIS: 12, CHA: 10 },
    });
    const aggregate = aggregateCharacterGrants(doc.character, doc.session);
    expect(
      aggregate.rollFloors.some((f) => f.rollType === "check" && f.floor === 10)
    ).toBe(true);
  });
});
