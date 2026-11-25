/**
 * The read-only Scholar survey (#1242) counts Wizards whose stored Expertise sits
 * outside Scholar's six skills (SRD 5.2.1), apart from those with another Expertise
 * source, counts only.
 */
import { describe, expect, it } from "vitest";

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyScholarExpertise } from "../../scripts/survey-scholar-expertise";
import { makeCharacterDoc } from "./_helpers";

const doc = (path: string, character: CharacterDoc) => ({
  path,
  data: {
    schema: 3,
    build: serializeCharacterEnvelope(character).build,
    state: {},
  } as RawMap,
});

describe("surveyScholarExpertise", () => {
  it("counts Wizards with Expertise outside the six, and only counts", () => {
    const wrong = makeCharacterDoc({
      classId: "wizard",
      level: 6,
      skills: { arcana: "proficient", athletics: "expertise" },
    });
    const right = makeCharacterDoc({
      classId: "wizard",
      level: 6,
      skills: { arcana: "expertise", history: "proficient" },
    });
    const rogueWizard = makeCharacterDoc({
      classes: [
        { classId: "wizard", level: 3 },
        { classId: "rogue", level: 1 },
      ],
      skills: { stealth: "expertise", arcana: "expertise" },
    });
    const survey = surveyScholarExpertise([
      doc("users/u1/characters/a", wrong),
      doc("users/u2/characters/b", right),
      doc("users/u3/characters/c", rogueWizard),
      { path: "users/u4/characters/d", data: { schema: 3, build: { name: 7 } } },
    ]);
    expect(survey).toEqual({
      format: "d20-folio-scholar-expertise-survey-v1",
      wizards: 3,
      outsideOnlyWizard: 1,
      outsideWithOtherSource: 1,
      skills: { athletics: 1 },
      unreadable: { "invalid-envelope": 1 },
    });
  });
});
