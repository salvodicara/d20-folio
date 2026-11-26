/** The read-only survey for #1324 (the first class takes the hit-die maximum). Counts only. */
import { describe, expect, it } from "vitest";
import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import type { CharacterDoc, ClassEntry } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyFirstClass } from "../../scripts/survey-max-hp-first-class";
import { makeCharacterDoc } from "./_helpers";

function parent(doc: CharacterDoc, path: string, shared = false) {
  const envelope = serializeCharacterEnvelope(doc);
  return {
    path,
    data: { schema: 3, build: envelope.build, state: {}, revision: 1, shared } as RawMap,
  };
}

const scores = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
const doc = (name: string, classes: ClassEntry[], hpBonus?: number) =>
  makeCharacterDoc({
    name: assertNonEmptyString(name),
    classes,
    abilityScores: scores,
    features: [],
    humanOriginFeat: "",
    bgFeat: "",
    ...(hpBonus === undefined ? {} : { hpBonus }),
  });

describe("survey — max HP with the first class taking the die maximum", () => {
  it("counts Fighter 1 / Wizard 3 (+2) and a hand-corrected Wizard 1 / Fighter 3 (−2), not a tie or a single class", async () => {
    const survey = await surveyFirstClass([
      parent(
        doc("Secret Blade", [
          { classId: "fighter", level: 1 },
          { classId: "wizard", level: 3 },
        ]),
        "users/u1/characters/c1",
        true
      ),
      // The player already lowered the old 26 to the rule's 24 by hand (bonus −2).
      parent(
        doc(
          "Quiet Sage",
          [
            { classId: "wizard", level: 1 },
            { classId: "fighter", level: 3 },
          ],
          -2
        ),
        "users/u1/characters/c2"
      ),
      parent(
        doc("Even Split", [
          { classId: "fighter", level: 2 },
          { classId: "wizard", level: 2 },
        ]),
        "users/u2/characters/c3"
      ),
      parent(
        doc("Plain Fighter", [{ classId: "fighter", level: 4 }]),
        "users/u2/characters/c4"
      ),
    ]);
    expect(survey).toMatchObject({
      characters: 4,
      multiclass: 3,
      firstNotHighest: 2,
      changed: 2,
      changedUp: 1,
      changedDown: 1,
      changedShared: 1,
      changedWithBonus: 1,
      changedBonusEqualsFix: 1,
      byChange: { "+2": 1, "-2": 1 },
      unreadable: {},
    });
    expect(JSON.stringify(survey)).not.toMatch(/Secret|Quiet|Even|Plain|u1|u2|c1|c4/);
  });
});
