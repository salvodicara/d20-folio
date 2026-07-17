/**
 * Per-spell OWNING-class derivation (`spell-owning-class.ts`) — the multiclass
 * spellcasting-ability seam (2024 SRD 5.2.1, Multiclassing → Spellcasting).
 *
 * Pins which class entries count as casters (full / half / subclass-third), and
 * that a spell maps to the single caster class whose list contains it — falling
 * back to the primary on 0/1 casters or an ambiguous/no match.
 */
import { describe, expect, it } from "vitest";
import {
  casterClassAbilities,
  resolveSpellOwningAbility,
  resolveSpellOwningClassId,
} from "@/lib/spell-owning-class";
import type { CharacterData } from "@/types/character";

const chr = (classes: CharacterData["classes"]): Pick<CharacterData, "classes"> => ({
  classes,
});

describe("casterClassAbilities", () => {
  it("full caster + full caster → both abilities, in entry order", () => {
    const c = chr([
      { classId: "cleric", subclassId: "life-domain", level: 5 },
      { classId: "wizard", subclassId: "evoker", level: 5 },
    ]);
    expect(casterClassAbilities(c)).toEqual([
      { classId: "cleric", spellListId: "cleric", ability: "WIS" },
      { classId: "wizard", spellListId: "wizard", ability: "INT" },
    ]);
  });

  it("a non-caster class contributes nothing", () => {
    const c = chr([
      { classId: "barbarian", subclassId: "berserker", level: 6 },
      { classId: "cleric", subclassId: "life-domain", level: 2 },
    ]);
    expect(casterClassAbilities(c)).toEqual([
      { classId: "cleric", spellListId: "cleric", ability: "WIS" },
    ]);
  });

  // (The subclass-third-caster pin — Eldritch Knight, a pack subclass — lives
  // in `content-pack/tests/unit/spell-owning-class.pack.test.ts`; no public
  // subclass is a third-caster.)

  it("a non-casting subclass (Champion Fighter) is not a caster", () => {
    const c = chr([{ classId: "fighter", subclassId: "champion", level: 6 }]);
    expect(casterClassAbilities(c)).toEqual([]);
  });
});

describe("resolveSpellOwningAbility / resolveSpellOwningClassId", () => {
  const clericWizard = chr([
    { classId: "cleric", subclassId: "life-domain", level: 5 },
    { classId: "wizard", subclassId: "evoker", level: 5 },
  ]);

  it("a Cleric-list spell → WIS / cleric; a Wizard-list spell → INT / wizard", () => {
    expect(resolveSpellOwningAbility(["cleric"], clericWizard, "WIS")).toBe("WIS");
    expect(resolveSpellOwningClassId(["cleric"], clericWizard, "cleric")).toBe("cleric");
    expect(resolveSpellOwningAbility(["wizard", "sorcerer"], clericWizard, "WIS")).toBe(
      "INT"
    );
    expect(
      resolveSpellOwningClassId(["wizard", "sorcerer"], clericWizard, "cleric")
    ).toBe("wizard");
  });

  it("a spell on BOTH caster lists is ambiguous → fallback", () => {
    expect(resolveSpellOwningAbility(["cleric", "wizard"], clericWizard, "WIS")).toBe(
      "WIS"
    );
    expect(resolveSpellOwningClassId(["cleric", "wizard"], clericWizard, "cleric")).toBe(
      "cleric"
    );
  });

  it("no class list / no match → fallback", () => {
    expect(resolveSpellOwningAbility(undefined, clericWizard, "WIS")).toBe("WIS");
    expect(resolveSpellOwningAbility(["bard"], clericWizard, "WIS")).toBe("WIS");
  });

  it("a single caster class always returns the fallback (single-class unchanged)", () => {
    const wizard = chr([{ classId: "wizard", level: 8 }]);
    expect(resolveSpellOwningAbility(["cleric"], wizard, "INT")).toBe("INT");
    expect(resolveSpellOwningClassId(["cleric"], wizard, "wizard")).toBe("wizard");
  });
});
