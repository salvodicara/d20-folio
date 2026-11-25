/**
 * Blessed Warrior (Paladin) and Druidic Warrior (Ranger) are SRD 5.2.1 text: the
 * level-2 Fighting Style feature's «Instead of choosing one of those feats, you can
 * choose the option below». So the public build offers them, pack or no pack.
 */
import { describe, expect, it } from "vitest";

import { getFeat } from "@/data/feats";
import { localizeSrd } from "@/i18n/resolver";
import { listFightingStyles } from "@/lib/fighting-style";

describe("the SRD caster Fighting Style options", () => {
  it("a Paladin is offered Blessed Warrior, a Ranger Druidic Warrior", () => {
    const ids = (classId: string) => listFightingStyles(classId).map((f) => f.id);
    expect(ids("paladin")).toContain("blessed-warrior");
    expect(ids("ranger")).toContain("druidic-warrior");
    expect(ids("fighter")).not.toContain("blessed-warrior");
    expect(ids("fighter")).not.toContain("druidic-warrior");
  });

  it("each teaches two cantrips of its list, cast with the class's ability", () => {
    expect(getFeat("blessed-warrior")?.grants).toEqual([
      {
        type: "choice-cantrip",
        classSpellList: "cleric",
        amount: 2,
        spellAbility: "CHA",
      },
    ]);
    expect(getFeat("druidic-warrior")?.grants).toEqual([
      { type: "choice-cantrip", classSpellList: "druid", amount: 2, spellAbility: "WIS" },
    ]);
  });

  it("names and texts read in English and Italian", () => {
    expect(localizeSrd("feat", "blessed-warrior", "name", "en")).toBe("Blessed Warrior");
    expect(localizeSrd("feat", "blessed-warrior", "name", "it")).toBe(
      "Guerriero Benedetto"
    );
    expect(localizeSrd("feat", "druidic-warrior", "name", "en")).toBe("Druidic Warrior");
    expect(localizeSrd("feat", "druidic-warrior", "name", "it")).toBe(
      "Guerriero Druidico"
    );
    for (const locale of ["en", "it"] as const) {
      for (const id of ["blessed-warrior", "druidic-warrior"]) {
        expect(localizeSrd("feat", id, "description", locale).length).toBeGreaterThan(40);
      }
    }
  });
});
