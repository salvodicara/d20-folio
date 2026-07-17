/**
 * Wave-2 §4.1 — 2024 subclass feature-level corrections.
 *
 * Verified against the server-rendered per-subclass wikidot pages:
 *   - http://dnd2024.wikidot.com/fighter:champion
 *   - http://dnd2024.wikidot.com/barbarian:berserker
 *
 * These were 2014-era levels (and, for the Berserker, two features were
 * swapped). The feature object's `level:` field is the single source of
 * truth the engine resolves subclass features by.
 */
import { describe, expect, it } from "vitest";
import { classFeatureIndex } from "@/data/classes";

describe("Wave-2 §4.1 — Fighter Champion feature levels (2024)", () => {
  it("Remarkable Athlete is level 3 (was level 7 in 2014)", () => {
    expect(classFeatureIndex.get("fighter-champion-remarkable-athlete")?.level).toBe(3);
  });
  it("Additional Fighting Style is level 7 (was level 10 in 2014)", () => {
    expect(
      classFeatureIndex.get("fighter-champion-additional-fighting-style")?.level
    ).toBe(7);
  });
});

describe("Wave-2 §4.1 — Barbarian Path of the Berserker feature levels (2024)", () => {
  it("Retaliation is level 10 (was incorrectly level 14)", () => {
    expect(classFeatureIndex.get("barbarian-berserker-retaliation")?.level).toBe(10);
  });
  it("Intimidating Presence is level 14 (was incorrectly level 10)", () => {
    expect(
      classFeatureIndex.get("barbarian-berserker-intimidating-presence")?.level
    ).toBe(14);
  });
});
