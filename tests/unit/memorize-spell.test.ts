/**
 * Memorize Spell: the Wizard changes one prepared spell after a Short Rest, as
 * its text says, on top of the class's Long Rest change.
 */
import { describe, expect, it } from "vitest";
import { classFeatureIndex, getClassTable } from "@/data/classes";
import { srd } from "../_harness/loc";

describe("Memorize Spell", () => {
  const id = "wizard-memorize-spell";
  const text = srd("class-feature", id, "description", "en");

  it("changes one prepared spell after a Short Rest", () => {
    expect(text).toMatch(/Whenever you finish a Short Rest/);
    expect(text).toMatch(/replace one of the level 1\+ Wizard spells you have prepared/);
    expect(classFeatureIndex.get(id)?.restSpellChange).toEqual({
      rest: "short",
      count: "one",
    });
  });

  it("adds to the Wizard's Long Rest change", () => {
    expect(getClassTable("wizard")?.longRestSpellChange).toBe("any");
  });
});
