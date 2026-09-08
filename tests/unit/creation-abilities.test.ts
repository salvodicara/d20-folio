import { describe, expect, it } from "vitest";
import { checkCreationAbilities } from "@/lib/character-creation/abilities";
const standard = {
  strength: 15,
  dexterity: 14,
  constitution: 13,
  intelligence: 12,
  wisdom: 10,
  charisma: 8,
};
describe("creation ability methods", () => {
  it("accepts every standard value once and rejects a repeated value", () => {
    expect(checkCreationAbilities("standard", standard, [], "owner").valid).toBe(true);
    expect(
      checkCreationAbilities("standard", { ...standard, charisma: 10 }, [], "owner")
        .issues
    ).toContainEqual({ path: "abilities", code: "standard-array", invalid: false });
  });
  it("uses the 27-point nonlinear budget and exposes unspent points", () => {
    const exact = {
      strength: 15,
      dexterity: 15,
      constitution: 15,
      intelligence: 8,
      wisdom: 8,
      charisma: 8,
    };
    expect(checkCreationAbilities("points", exact, [], "owner")).toMatchObject({
      valid: true,
      spent: 27,
      remaining: 0,
    });
    expect(
      checkCreationAbilities("points", { ...exact, intelligence: 9 }, [], "owner")
    ).toMatchObject({ valid: false, spent: 28, remaining: -1 });
    expect(checkCreationAbilities("points", standard, [], "owner")).toMatchObject({
      valid: true,
      spent: 27,
    });
    expect(
      checkCreationAbilities("points", { ...exact, strength: 14 }, [], "owner")
    ).toMatchObject({ valid: true, remaining: 2 });
  });
  it("requires an attributed exception for table-entered values outside ordinary rolled bounds", () => {
    const values = { ...standard, strength: 20 };
    const exception = {
      path: "abilities/strength",
      code: "manual-range",
      reason: "Agreed starting boon",
      authorUid: "owner",
    };
    expect(checkCreationAbilities("manual", values, [], "owner").valid).toBe(false);
    expect(checkCreationAbilities("manual", values, [exception], "owner")).toMatchObject({
      valid: true,
      applied: [exception],
    });
    expect(
      checkCreationAbilities(
        "manual",
        values,
        [{ ...exception, authorUid: "other" }],
        "owner"
      ).valid
    ).toBe(false);
    expect(
      checkCreationAbilities("manual", values, [{ ...exception, reason: " " }], "owner")
        .valid
    ).toBe(false);
  });
  it("never turns missing, fractional or out-of-model values into valid scores through exceptions", () => {
    for (const strength of [null, 0, 31, 12.5, NaN]) {
      const result = checkCreationAbilities(
        "manual",
        { ...standard, strength },
        [
          {
            path: "abilities/strength",
            code: "invalid-score",
            reason: "Cannot repair malformed values",
            authorUid: "owner",
          },
        ],
        "owner"
      );
      expect(result.valid).toBe(false);
      expect(result.issues.some((issue) => issue.invalid)).toBe(true);
    }
  });
});
