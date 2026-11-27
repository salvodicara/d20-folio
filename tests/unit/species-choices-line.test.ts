/**
 * The «Scelte da completare» sentence says what an unmade pick costs today, in plain
 * words: the species spells' ability the sheet uses meanwhile (the character's own,
 * not always Charisma), and a feat's +1 that waits for its ability.
 */
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { MOCK_CHARACTER } from "@/lib/mock";
import { speciesChoicesLine } from "@/lib/views/species-choices-view";
import { owedClassPickLabel } from "@/lib/views/owed-class-picks-view";

const character = MOCK_CHARACTER.character;

describe("the owed-choices sentence", () => {
  it.each([
    ["it", "Intelligenza", /oggi usa Intelligenza/],
    ["en", "Intelligence", /uses Intelligence today/],
  ] as const)(
    "%s: names the ability the species spells use meanwhile",
    async (locale, ability, says) => {
      await i18n.loadLanguages(locale);
      const t = i18n.getFixedT(locale);
      const line = speciesChoicesLine(
        [{ kind: "ability" }],
        t,
        locale,
        character,
        ability
      );
      expect(line).toMatch(says);
      expect(line).not.toMatch(/Carisma|Charisma/);
    }
  );

  // The class picks read like D&D Beyond's required-choice badge: short, one label.
  it.each([
    ["it", "Manca: Sottoclasse del Ladro · 2 Padronanze d'Armi (Paladino)."],
    ["en", "Missing: Rogue subclass · 2 Weapon Masteries (Paladin)."],
  ] as const)("%s: names the missing class picks short", async (locale, says) => {
    await i18n.loadLanguages(locale);
    const t = i18n.getFixedT(locale);
    const line = speciesChoicesLine(
      [
        {
          kind: "class-pick",
          classId: "rogue",
          pick: "subclass",
          owed: 1,
          label: owedClassPickLabel("subclass", 1, "rogue", locale),
        },
        {
          kind: "class-pick",
          classId: "paladin",
          pick: "weaponMasteries",
          owed: 2,
          label: owedClassPickLabel("weaponMasteries", 2, "paladin", locale),
        },
      ],
      t,
      locale,
      character
    );
    expect(line).toBe(says);
  });

  it.each([
    ["sorcerer", "Sottoclasse dello Stregone"],
    ["cleric", "Sottoclasse del Chierico"],
    ["warlock", "Sottoclasse del Warlock"],
  ] as const)("it: the %s subclass agrees with its class", async (classId, says) => {
    await i18n.loadLanguages("it");
    expect(owedClassPickLabel("subclass", 1, classId, "it")).toBe(says);
  });

  it.each([
    ["it", /Il Talento: scegli la caratteristica \(\+1 non ancora applicato\)/],
    ["en", /The Feat: choose the ability \(\+1 not applied yet\)/],
  ] as const)("%s: says the feat's +1 is not applied yet", async (locale, says) => {
    await i18n.loadLanguages(locale);
    const t = i18n.getFixedT(locale);
    const label = locale === "it" ? "Il Talento" : "The Feat";
    const line = speciesChoicesLine(
      [{ kind: "feat-ability", featId: "x", label, abilities: ["INT", "WIS", "CHA"] }],
      t,
      locale,
      character
    );
    expect(line).toMatch(says);
  });
});
