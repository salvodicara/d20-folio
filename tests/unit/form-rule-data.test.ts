/**
 * A spell that transforms the caster carries its form rule in the catalogue
 * (edge-case family M2): the Transform flow reads it there, so a homebrew spell can
 * declare one too, and no code table names spell ids.
 */
import { describe, expect, it } from "vitest";

import { getSpellById } from "@/data/spells";
import { isSelfFormSpell, selfFormRule } from "@/lib/polymorph";

describe("form rules are catalogue data", () => {
  it("the four transforming spells declare theirs", () => {
    for (const id of ["polymorph", "true-polymorph", "shapechange", "animal-shapes"]) {
      expect(getSpellById(id)?.formRule, id).toBeDefined();
      expect(isSelfFormSpell(id)).toBe(true);
    }
  });

  it("they read as the 2024 text says", () => {
    expect(selfFormRule("polymorph")).toMatchObject({ pool: "beasts", keepsMind: false });
    expect(selfFormRule("true-polymorph")).toMatchObject({ pool: "bestiary" });
    expect(selfFormRule("shapechange")).toMatchObject({
      keepsMind: true,
      reshift: true,
      endsWithoutTempHp: false,
      selfOnly: true,
    });
    expect(selfFormRule("animal-shapes")).toMatchObject({ crCap: 4, sizeMax: "Large" });
  });

  it("a spell without one is not a form, and falls back to Polymorph's rule", () => {
    expect(isSelfFormSpell("fireball")).toBe(false);
    expect(selfFormRule("fireball")).toMatchObject({ pool: "beasts", keepsMind: false });
  });
});
