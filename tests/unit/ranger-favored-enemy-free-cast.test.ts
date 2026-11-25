/**
 * Ranger Favored Enemy (SRD 5.2.1): «You always have the Hunter's Mark spell
 * prepared. You can cast it twice without expending a spell slot» — the Favored
 * Enemy column of the Ranger table: 2 (Ranger 1), 3 (5), 4 (9), 5 (13), 6 (17). The
 * count follows the RANGER level, so a multiclass Ranger 1 has 2 whatever its other
 * classes; each cast spends the Favored Enemy tracker.
 */
import { describe, expect, it } from "vitest";

import { freeCastSourcesForSpell } from "@/lib/views/spell-cast-sources";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const ranger = (classes: CharacterDoc["character"]["classes"], used = 0) =>
  makeCharacterDoc(
    { classes, features: [{ srdId: "ranger-favored-enemy" }] },
    used ? { trackers: { "ranger-favored-enemy": { used } } } : {}
  );

const freeMarks = (doc: CharacterDoc) =>
  freeCastSourcesForSpell(doc, "hunters-mark", "en", "");

describe("Favored Enemy: Hunter's Mark without a spell slot", () => {
  it("a Ranger 1 casts it twice for free, paying the Favored Enemy tracker", () => {
    const [source] = freeMarks(ranger([{ classId: "ranger", level: 1 }]));
    expect(source?.usesPerRest).toBe(2);
    expect(source?.payment).toEqual({
      kind: "tracker",
      trackerId: "ranger-favored-enemy",
    });
  });

  it("a Ranger 5 three times", () => {
    expect(freeMarks(ranger([{ classId: "ranger", level: 5 }]))[0]?.usesPerRest).toBe(3);
  });

  it("the count follows the Ranger level, not the character level", () => {
    const doc = ranger([
      { classId: "ranger", level: 1 },
      { classId: "fighter", level: 4 },
    ]);
    expect(freeMarks(doc)[0]?.usesPerRest).toBe(2);
  });

  it("both uses spent: no free cast left", () => {
    expect(freeMarks(ranger([{ classId: "ranger", level: 1 }], 2))).toEqual([]);
  });
});
