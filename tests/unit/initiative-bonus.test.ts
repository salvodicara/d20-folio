/**
 * `computedInitiativeBonus`: the ONE Initiative assembly the sheet's header, the turn
 * band, the party view and the PDF share (effective DEX, Alert, grants, exhaustion).
 */
import { describe, expect, it } from "vitest";
import {
  aggregateCharacterGrants,
  computedInitiativeBonus,
} from "@/lib/aggregate-character";
import { deriveCharacter } from "@/lib/views/derive-character";
import { makeCharacterDoc } from "./_helpers";

const doc = (over: Parameters<typeof makeCharacterDoc>[0] = {}, exhaustion = 0) =>
  makeCharacterDoc(
    {
      classId: "fighter",
      level: 5,
      abilityScores: { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 16, CHA: 10 },
      ...over,
    },
    { exhaustion }
  );

const bonus = (d: ReturnType<typeof doc>) =>
  computedInitiativeBonus(
    d.character,
    aggregateCharacterGrants(d.character, d.session),
    d.session.exhaustion
  );

describe("computedInitiativeBonus", () => {
  it("is the DEX modifier", () => {
    expect(bonus(doc())).toBe(2);
  });

  it("Alert adds the Proficiency Bonus, from any of its origins", () => {
    expect(bonus(doc({ bgFeat: "alert" }))).toBe(5);
    expect(bonus(doc({ humanOriginFeat: "alert" }))).toBe(5);
    expect(bonus(doc({ bgFeat: "alert", proficiencyBonusOverride: 4 }))).toBe(6);
  });

  it("exhaustion takes 2 per level", () => {
    expect(bonus(doc({}, 2))).toBe(-2);
  });

  it("the party view and the PDF read the same number, and a hand-set override wins", () => {
    const alert = doc({ bgFeat: "alert" }, 1);
    expect(deriveCharacter(alert).initiativeBonus).toBe(bonus(alert));
    expect(deriveCharacter(doc({ initiativeBonusOverride: 9 })).initiativeBonus).toBe(9);
  });
});
