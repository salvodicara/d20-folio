/**
 * Expertise chosen at each Long Rest (`rest-expertise`): the pick lives in the
 * session's option choices under the grant's key, gives Expertise in one skill the
 * character is proficient in, and is cleared by the next Long Rest so it is picked
 * again.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { buildSkillBreakdown } from "@/lib/compute";
import {
  clearRestExpertise,
  restExpertiseRows,
  restExpertiseSkills,
} from "@/lib/rest-expertise";

const source: GrantSource = {
  id: "a-feat",
  grants: [{ type: "rest-expertise", choiceKey: "merc-expertise" }],
};
const agg = evaluateGrants([source], new Set(), new Map());
const skills = {
  stealth: "proficient",
  athletics: "none",
  perception: "expertise",
} as const;

describe("rest-expertise", () => {
  it("the picked proficient skill gains Expertise", () => {
    expect(
      restExpertiseSkills(agg.restExpertise, { "merc-expertise": "stealth" }, skills)
    ).toEqual(["stealth"]);
  });

  it("a skill the character is not proficient in, or no pick, gives nothing", () => {
    expect(
      restExpertiseSkills(agg.restExpertise, { "merc-expertise": "athletics" }, skills)
    ).toEqual([]);
    expect(restExpertiseSkills(agg.restExpertise, {}, skills)).toEqual([]);
  });

  it("a Long Rest clears the pick, leaving other choices alone", () => {
    expect(
      clearRestExpertise(agg.restExpertise, { "merc-expertise": "stealth", other: "x" })
    ).toEqual({ other: "x" });
  });

  it("the stored pick reaches the sheet's Expertise set", () => {
    const picked = evaluateGrants(
      [source],
      new Set(),
      new Map([["merc-expertise", "stealth"]])
    );
    expect([...picked.expertiseSkills]).toEqual(["stealth"]);
    expect([...agg.expertiseSkills]).toEqual([]);
  });

  it("the Long Rest select lists proficient skills without Expertise, preselecting last time's pick", () => {
    expect(
      restExpertiseRows(agg.restExpertise, { "merc-expertise": "stealth" }, skills)
    ).toEqual([
      {
        sourceId: "a-feat",
        choiceKey: "merc-expertise",
        options: ["stealth"],
        current: "stealth",
      },
    ]);
    expect(restExpertiseRows(agg.restExpertise, {}, { perception: "expertise" })).toEqual(
      [{ sourceId: "a-feat", choiceKey: "merc-expertise", options: [], current: null }]
    );
  });

  it("a skill with Expertise from another rule is not offered", () => {
    const [row] = restExpertiseRows(
      agg.restExpertise,
      {},
      { stealth: "proficient", arcana: "proficient" },
      new Set(["arcana"])
    );
    expect(row?.options).toEqual(["stealth"]);
  });

  it("the skill's breakdown says the Expertise lasts until the next Long Rest", () => {
    const parts = buildSkillBreakdown({
      ability: "DEX",
      abilityScore: 14,
      level: 5,
      proficiency: "expertise",
      untilLongRest: true,
    });
    expect(
      parts.find(
        (p) => "term" in p.label && p.label.term === "character.proficiencyBonus"
      )
    ).toMatchObject({ value: 6, note: { term: "breakdown.untilLongRest" } });
  });
});
