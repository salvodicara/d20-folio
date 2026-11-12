/**
 * Expertise chosen at each Long Rest (`rest-expertise`): the pick lives in the
 * session's option choices under the grant's key, gives Expertise in one skill the
 * character is proficient in, and is cleared by the next Long Rest so it is picked
 * again.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { clearRestExpertise, restExpertiseSkills } from "@/lib/rest-expertise";

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
});
