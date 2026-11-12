/**
 * A paid Advantage (a Luck Point) on the skill check the sheet takes in: the check's
 * sources are read for "check", and with the Advantage paid the higher of the two
 * entered faces stands (2024 D20 Tests: roll two d20s, use the higher).
 */
import { describe, expect, it } from "vitest";
import { postRollSources } from "@/lib/character-d20-tests";
import { keptFace } from "@/domains/play/paid-advantage";
import { makeCharacterDoc } from "./_helpers";

const luck = {
  id: "luck-advantage",
  summary: { rollEffect: { kind: "advantage" as const, rolls: ["check" as const] } },
};

describe("a paid Advantage on an entered check", () => {
  it("is read for checks", () => {
    expect(
      postRollSources(makeCharacterDoc({}), [luck], "check").advantageOptIns
    ).toEqual(["luck-advantage"]);
  });

  it("keeps the higher face only when paid", () => {
    expect(keptFace(4, 17, true)).toBe(17);
    expect(keptFace(15, 3, true)).toBe(15);
    expect(keptFace(4, 17, false)).toBe(4);
  });
});
