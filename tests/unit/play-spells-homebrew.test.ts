/**
 * The Play screen's «Incantesimi» tab lists a homebrew spell with the catalogue ones
 * (#1230; a hole before 12-05: the tab kept catalogue spells only, so a homebrew spell
 * showed in «Gestisci incantesimi» and on the classic sheet but not here). Pattern
 * source: D&D Beyond's Spells tab, where a homebrew spell sits in its level's list
 * like any other.
 */
import { describe, expect, it } from "vitest";

import { playSpellsView } from "@/domains/play/play-spells-view";
import type { CustomSpell } from "@/types/character";
import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

function homebrew(over: Partial<CustomSpell>): CustomSpell {
  return {
    custom: true,
    name: "Ember Burst",
    level: 3,
    school: "evocation",
    castingTime: "action",
    range: "150 feet",
    components: { v: true, s: true, m: false },
    duration: "Instantaneous",
    concentration: false,
    description: "A bead of flame bursts.",
    prepared: true,
    instanceId: customInstanceId("Ember Burst"),
    ...over,
  };
}

const wizard = (spells: CustomSpell[]) => {
  const doc = makeCharacterDoc({
    classId: "wizard",
    level: 5,
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 10 },
  });
  doc.character.spells = [...doc.character.spells, ...spells];
  return doc;
};

const names = (v: ReturnType<typeof playSpellsView>, level: number) =>
  v.groups.find((g) => g.level === level)?.spells.map((s) => s.row.name) ?? [];

describe("the Spells tab and homebrew spells", () => {
  it("a prepared homebrew spell sits in its level, and casts", () => {
    const v = playSpellsView(wizard([homebrew({})]), "en");
    expect(names(v, 3)).toContain("Ember Burst");
    const row = v.groups
      .find((g) => g.level === 3)
      ?.spells.find((s) => s.row.name === "Ember Burst");
    expect(row?.prepared).toBe(true);
    // Its school, so its tile wears the school's glyph and colour (no catalogue art).
    expect(row?.row.school).toBe("evocation");
  });

  it("a homebrew cantrip sits with the cantrips", () => {
    const v = playSpellsView(
      wizard([
        homebrew({ name: "Spark", level: 0, instanceId: customInstanceId("Spark") }),
      ]),
      "en"
    );
    expect(names(v, 0)).toContain("Spark");
  });

  it("an unprepared homebrew spell is shown but not cast", () => {
    const v = playSpellsView(wizard([homebrew({ prepared: false })]), "en");
    const row = v.groups
      .find((g) => g.level === 3)
      ?.spells.find((s) => s.row.name === "Ember Burst");
    expect(row).toBeDefined();
    expect(row?.prepared).toBe(false);
  });
});
