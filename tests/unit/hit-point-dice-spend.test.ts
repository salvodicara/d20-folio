import { describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import {
  hitPointDiceAmount,
  hitPointDiceContext,
  hitPointDiceGain,
  hitPointDiceSpend,
} from "@/lib/play/hit-point-dice";

// The cases come from the texts the rules authored (rules sweep, 2026-11-04).
const CTX = {
  available: 5,
  slotLevel: 3,
  spellLevel: 2,
  spellcastingMod: 4,
  conMod: 2,
  proficiency: 3,
};

describe("hitPointDiceSpend", () => {
  it("A school trigger: up to two dice, healing the total plus the slot's level", () => {
    const offer = hitPointDiceSpend({ max: 2, bonus: "slot-level" }, CTX);
    expect(offer).toEqual({ min: 0, max: 2, bonus: 3, into: "healing", evenOnly: false });
    expect(offer && hitPointDiceAmount(offer, 2, 9)).toBe(12);
  });

  it("A spell: one more die per slot above the spell's level, plus the spellcasting modifier", () => {
    const offer = hitPointDiceSpend(
      { max: 2, perUpcast: 1, bonus: "spellcasting-mod" },
      CTX
    );
    expect(offer?.max).toBe(3);
    expect(offer?.bonus).toBe(4);
  });

  it("never more dice than the creature has left", () => {
    expect(hitPointDiceSpend({ max: 2 }, { ...CTX, available: 1 })?.max).toBe(1);
    expect(hitPointDiceSpend({ max: 2 }, { ...CTX, available: 0 })).toBeNull();
  });

  it("A spell that spends exactly as many dice as the slot's level", () => {
    const offer = hitPointDiceSpend({ max: "slot-level", exactly: true }, CTX);
    expect(offer).toMatchObject({ min: 3, max: 3 });
  });

  it("The total can go to the damage, or to temporary HP plus CON", () => {
    expect(hitPointDiceSpend({ max: 2, into: "damage" }, CTX)?.into).toBe("damage");
    const mark = hitPointDiceSpend({ max: 2, into: "temp-hp", bonus: "con-mod" }, CTX);
    expect(mark).toMatchObject({ into: "temp-hp", bonus: 2 });
  });

  it("A healer's spend adds the healer's proficiency bonus", () => {
    expect(
      hitPointDiceSpend({ max: 1, bonus: "proficiency", spender: "target" }, CTX)?.bonus
    ).toBe(3);
  });

  it("An even-only spend: only an even roll gives anything", () => {
    const offer = hitPointDiceSpend({ max: 1, into: "temp-hp", evenOnly: true }, CTX);
    expect(offer && hitPointDiceAmount(offer, 1, 4)).toBe(4);
    expect(offer && hitPointDiceAmount(offer, 1, 5)).toBe(0);
  });

  it("no dice spent, nothing gained (the bonus rides on the dice)", () => {
    const offer = hitPointDiceSpend({ max: 2, bonus: "slot-level" }, CTX);
    expect(offer && hitPointDiceAmount(offer, 0, 0)).toBe(0);
  });
});

describe("hitPointDiceContext", () => {
  it("reads the dice left and the modifiers off the sheet (Bard 9, 2 dice spent)", () => {
    expect(hitPointDiceContext(MOCK_CHARACTER, { slotLevel: 3, spellLevel: 2 })).toEqual({
      available: 7,
      slotLevel: 3,
      spellLevel: 2,
      spellcastingMod: 5,
      conMod: 2,
      proficiency: 4,
    });
  });
});

describe("hitPointDiceGain", () => {
  it("an even roll goes into the rule's gain, an odd one into oddInto", () => {
    const offer = hitPointDiceSpend(
      { max: 1, into: "temp-hp", oddInto: "damage", bonus: "con-mod" },
      CTX
    );
    expect(offer && hitPointDiceGain(offer, 1, 4)).toEqual({
      amount: 6,
      into: "temp-hp",
    });
    expect(offer && hitPointDiceGain(offer, 1, 5)).toEqual({ amount: 7, into: "damage" });
  });
});
