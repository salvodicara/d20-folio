/**
 * The Long Rest's «Cambia incantesimi preparati» step (owner, «Guida», 2026-11-05):
 * the RAW limit per class (`longRestSpellChange`): one spell for a Paladin or a Ranger,
 * any for a Cleric, a Druid or a Wizard; no step for a class that does not prepare.
 * Inside the step a «one» class may swap a single spell; the sheet stays free.
 */
import { describe, expect, it } from "vitest";
import { longRestChange, canFlipInStep } from "@/domains/play/long-rest-change";
import { makeCharacterDoc } from "./_helpers";

describe("longRestChange", () => {
  it("reads each class's rule", () => {
    expect(longRestChange(makeCharacterDoc({ class: "Paladin", level: 5 }))).toBe("one");
    expect(longRestChange(makeCharacterDoc({ class: "Ranger", level: 5 }))).toBe("one");
    expect(longRestChange(makeCharacterDoc({ class: "Wizard", level: 5 }))).toBe("any");
    expect(longRestChange(makeCharacterDoc({ class: "Cleric", level: 5 }))).toBe("any");
    expect(longRestChange(makeCharacterDoc({ class: "Fighter", level: 5 }))).toBeNull();
    expect(longRestChange(makeCharacterDoc({ class: "Bard", level: 5 }))).toBeNull();
  });
});

describe("canFlipInStep", () => {
  const start = new Set([1, 2, 3]);
  it("«any» flips freely", () => {
    expect(canFlipInStep("any", start, new Set([4, 5]), 6)).toBe(true);
  });
  it("«one» allows a single swap: one out, one in, and undoing either", () => {
    expect(canFlipInStep("one", start, new Set([1, 2, 3]), 1)).toBe(true); // take one out
    expect(canFlipInStep("one", start, new Set([2, 3]), 2)).toBe(false); // a second out
    expect(canFlipInStep("one", start, new Set([2, 3]), 4)).toBe(true); // one in
    expect(canFlipInStep("one", start, new Set([2, 3, 4]), 5)).toBe(false); // a second in
    expect(canFlipInStep("one", start, new Set([2, 3, 4]), 4)).toBe(true); // undo the in
    expect(canFlipInStep("one", start, new Set([2, 3, 4]), 1)).toBe(true); // undo the out
  });
});
