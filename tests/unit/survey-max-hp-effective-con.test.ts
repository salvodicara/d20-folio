/** The read-only survey for #1318 (max HP follows the effective CON). Counts only. */
import { describe, expect, it } from "vitest";
import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyEffectiveCon } from "../../scripts/survey-max-hp-effective-con";
import { makeCharacterDoc } from "./_helpers";

function parent(doc: CharacterDoc, path: string, shared = false) {
  const envelope = serializeCharacterEnvelope(doc);
  return {
    path,
    data: { schema: 3, build: envelope.build, state: {}, revision: 1, shared } as RawMap,
  };
}

const scores = { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 };

describe("survey — max HP with the effective CON", () => {
  it("counts a Fighter 3 with a CON 18 pin (+2 per level, +6) and not a plain one", async () => {
    const pinned = makeCharacterDoc({
      name: assertNonEmptyString("Secret Tank"),
      classes: [{ classId: "fighter", level: 3 }],
      abilityScores: scores,
      abilityScoreOverrides: { CON: 18 },
    });
    const plain = makeCharacterDoc({
      name: assertNonEmptyString("Plain Fighter"),
      classes: [{ classId: "fighter", level: 3 }],
      abilityScores: scores,
    });
    const survey = await surveyEffectiveCon([
      parent(pinned, "users/u1/characters/c1", true),
      parent(plain, "users/u1/characters/c2"),
    ]);
    expect(survey).toMatchObject({
      characters: 2,
      shared: 1,
      changed: 1,
      changedShared: 1,
      byChange: { "+6": 1 },
      unreadable: {},
    });
    expect(JSON.stringify(survey)).not.toMatch(/Secret|Plain|u1|c1|c2/);
  });
});
