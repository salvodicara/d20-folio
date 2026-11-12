/**
 * The Play screen's character header (approved prototype x-play, the identity band):
 * name, the identity line (each class with its level, subclass, species, background),
 * the six abilities in order with modifier, score and save proficiency, the four header
 * numbers exactly as the sheet derives them (`sheetNumbers`), HP with its temporary
 * points, and what is going on (Concentration, effects, conditions).
 */
import { describe, expect, it } from "vitest";

import { playHeaderView } from "@/domains/play/play-header-view";
import { concentrationValue } from "@/lib/concentration";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import { makeCharacterDoc } from "./_helpers";

const selene = makeCharacterDoc(
  {
    classId: "cleric",
    subclassId: "life-domain",
    level: 5,
    name: "Selene" as never,
    race: "human" as never,
    background: "acolyte",
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 17, CHA: 13 },
    savingThrows: ["WIS", "CHA"],
  },
  {
    hp: { current: 31, temp: 5 },
    concentration: concentrationValue("bless"),
    conditions: ["prone"],
  }
);

describe("playHeaderView", () => {
  const view = playHeaderView(selene, "it");

  it("names the character and lists class with level, subclass, species and background", () => {
    expect(view.name).toBe("Selene");
    expect(view.identity).toEqual([
      "Chierico 5",
      "Dominio della Vita",
      "Umano",
      "Accolito",
    ]);
  });

  it("the phone's short identity: each class with its level, then the species (x-play-m)", () => {
    expect(view.identityShort).toEqual(["Chierico 5", "Umano"]);
  });

  it("the six abilities in order, with modifier, score and save proficiency", () => {
    expect(view.abilities.map((a) => [a.id, a.mod, a.score, a.save])).toEqual([
      ["STR", 3, 16, false],
      ["DEX", 1, 12, false],
      ["CON", 2, 14, false],
      ["INT", 0, 10, false],
      ["WIS", 3, 17, true],
      ["CHA", 1, 13, true],
    ]);
  });

  it("the header numbers are the sheet's own", () => {
    const n = sheetNumbers(selene);
    expect(view.numbers).toEqual({
      ac: n.ac.total,
      initiative: n.initiative.total,
      speedFt: n.speed.total,
      proficiency: n.proficiencyBonus.total,
    });
  });

  it("HP: current and temporary from the session, max as the sheet derives it", () => {
    expect(view.hp).toEqual({
      current: 31,
      max: sheetNumbers(selene).maxHp.total,
      temp: 5,
    });
  });

  it("what is going on: Concentration, and how many conditions", () => {
    expect(view.concentration).toBe("Benedizione");
    expect(view.conditions).toBe(1);
  });
});

// In a form (Polymorph into a Brown Bear), the sheet becomes the beast: the header
// says so, and its numbers are the beast's (the engine's form layer, `sheetNumbers`).
describe("playHeaderView — in a form", () => {
  const bear = makeCharacterDoc(
    {
      classId: "wizard",
      level: 9,
      abilityScores: { STR: 8, DEX: 14, CON: 13, INT: 18, WIS: 12, CHA: 10 },
    },
    {
      concentration: concentrationValue("polymorph"),
      activeForm: { sourceId: "polymorph", beastId: "brown-bear", tempHpBefore: 0 },
    }
  );

  it("names the form: the spell, then the beast", () => {
    expect(playHeaderView(bear, "en").form).toEqual({
      source: "Polymorph",
      beast: "Brown Bear",
    });
    expect(playHeaderView(bear, "it").form).toEqual({
      source: "Metamorfosi",
      beast: "Orso bruno",
    });
  });

  it("shows the beast's numbers, as the sheet derives them", () => {
    const view = playHeaderView(bear, "en");
    const n = sheetNumbers(bear);
    expect(view.numbers.ac).toBe(n.ac.total);
    expect(view.abilities.find((a) => a.id === "STR")?.score).toBe(n.abilities.STR.total);
    expect(view.abilities.find((a) => a.id === "STR")?.score).not.toBe(8);
  });

  it("names Wild Shape, a class feature, the same way", () => {
    const wolf = makeCharacterDoc(
      { classId: "druid", level: 4 },
      {
        activeForm: { sourceId: "druid-wild-shape", beastId: "wolf", tempHpBefore: 0 },
      }
    );
    expect(playHeaderView(wolf, "en").form).toEqual({
      source: "Wild Shape",
      beast: "Wolf",
    });
    expect(playHeaderView(wolf, "it").form?.source).toBe("Forma Selvatica");
  });

  it("no form, no band", () => {
    expect(playHeaderView(selene, "en").form).toBeNull();
  });
});

describe("playHeaderView: the saving throws on the ability tiles", () => {
  const save = (doc: Parameters<typeof playHeaderView>[0], id: string) =>
    playHeaderView(doc, "it").abilities.find((a) => a.id === id);

  it("a proficient save shows its total (WIS 17, +3 proficiency at level 5: +6)", () => {
    expect(save(selene, "WIS")).toMatchObject({ save: true, saveTotal: 6, showSave: true });
  });

  it("a plain save (not proficient, nothing else) shows no total: it is the modifier", () => {
    expect(save(selene, "STR")).toMatchObject({ save: false, saveTotal: 3, showSave: false });
  });

  it("a paladin's aura lifts a non-proficient save: the total shows, the aura is its own part", () => {
    const aura = makeCharacterDoc(
      {
        classId: "cleric",
        level: 5,
        abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 17, CHA: 13 },
        savingThrows: ["WIS", "CHA"],
      },
      { partyAura: { from: "pal", name: "Bren", bonus: 3 } }
    );
    const str = save(aura, "STR");
    expect(str).toMatchObject({ save: false, saveTotal: 6, showSave: true });
    expect(str?.saveParts.map((p) => p.value)).toEqual(["+3", "+3"]);
    expect(str?.saveParts[1]).toMatchObject({ kind: "loc", label: "Aura di Bren" });
  });
});
