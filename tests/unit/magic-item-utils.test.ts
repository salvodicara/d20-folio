/**
 * Unit tests for parseMagicItemAcBonus — the helper that lets the magic-item
 * add modal infer the +N AC bonus of items like Ring of Protection / Bracers
 * of Defense from their `properties` array.
 */

import { describe, it, expect } from "vitest";
import { parseMagicItemAcBonus, parseMagicItemCharges } from "@/lib/magic-item-utils";

describe("parseMagicItemAcBonus", () => {
  it("returns the bonus from '+N AC' style properties", () => {
    expect(parseMagicItemAcBonus({ properties: ["+1 AC"] })).toBe(1);
    expect(parseMagicItemAcBonus({ properties: ["+2 ac"] })).toBe(2);
  });

  it("returns the bonus from 'AC +N' style properties", () => {
    expect(parseMagicItemAcBonus({ properties: ["AC +1"] })).toBe(1);
    expect(parseMagicItemAcBonus({ properties: ["AC +3 (Cloak of Protection)"] })).toBe(
      3
    );
  });

  it("returns undefined when no AC hint is present", () => {
    expect(parseMagicItemAcBonus({ properties: [] })).toBeUndefined();
    expect(parseMagicItemAcBonus({})).toBeUndefined();
    expect(
      parseMagicItemAcBonus({ properties: ["charges: 7", "wondrous"] })
    ).toBeUndefined();
  });

  it("handles negative AC modifiers (cursed items)", () => {
    expect(parseMagicItemAcBonus({ properties: ["-1 AC"] })).toBe(-1);
  });

  it("ignores numbers without AC keyword", () => {
    expect(
      parseMagicItemAcBonus({ properties: ["+1 attack", "1d6 damage"] })
    ).toBeUndefined();
  });

  it("returns the first hit when multiple AC properties are present", () => {
    expect(parseMagicItemAcBonus({ properties: ["+1 AC", "+2 ac (limited)"] })).toBe(1);
  });
});

describe("parseMagicItemCharges", () => {
  it("parses 'charges: N' form (Wand of Magic Missiles)", () => {
    expect(parseMagicItemCharges({ properties: ["charges: 7"] })).toBe(7);
  });

  it("parses 'N charges' form (Staff of Healing)", () => {
    expect(parseMagicItemCharges({ properties: ["10 charges"] })).toBe(10);
  });

  it("parses 'charges (N)' form", () => {
    expect(parseMagicItemCharges({ properties: ["charges (5)"] })).toBe(5);
  });

  it("returns undefined when no charges hint is present", () => {
    expect(parseMagicItemCharges({})).toBeUndefined();
    expect(parseMagicItemCharges({ properties: [] })).toBeUndefined();
    expect(parseMagicItemCharges({ properties: ["+1 AC"] })).toBeUndefined();
  });

  it("rejects zero or negative charges", () => {
    expect(parseMagicItemCharges({ properties: ["charges: 0"] })).toBeUndefined();
  });

  it("handles case-insensitive matching", () => {
    expect(parseMagicItemCharges({ properties: ["CHARGES: 3"] })).toBe(3);
    expect(parseMagicItemCharges({ properties: ["Charge: 2"] })).toBe(2);
  });
});
