/**
 * The «Scelte da completare» sentence says what an unmade pick costs today, in plain
 * words: the species spells' ability the sheet uses meanwhile (the character's own,
 * not always Charisma), and a feat's +1 that waits for its ability.
 */
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { speciesChoicesLine } from "@/lib/views/species-choices-view";

describe("the owed-choices sentence", () => {
  it.each([
    ["it", "Intelligenza", /oggi usa Intelligenza/],
    ["en", "Intelligence", /uses Intelligence today/],
  ] as const)(
    "%s: names the ability the species spells use meanwhile",
    async (locale, ability, says) => {
      await i18n.loadLanguages(locale);
      const t = i18n.getFixedT(locale);
      const line = speciesChoicesLine([{ kind: "ability" }], t, locale, ability);
      expect(line).toMatch(says);
      expect(line).not.toMatch(/Carisma|Charisma/);
    }
  );

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
      locale
    );
    expect(line).toMatch(says);
  });

  it.each([
    ["it", "Abile", /Abile: hai 4 abilità, la tua build ne dà almeno 5/],
    ["en", "Skillful", /Skillful: you have 4 skills, your build gives at least 5/],
  ] as const)(
    "%s: says why it asks for an any-skill pick",
    async (locale, label, says) => {
      await i18n.loadLanguages(locale);
      const t = i18n.getFixedT(locale);
      const line = speciesChoicesLine(
        [
          {
            kind: "slot",
            slotId: "race:human:skillful::skill-slot-0",
            label,
            short: { have: 4, need: 5 },
          },
        ],
        t,
        locale
      );
      expect(line).toMatch(says);
    }
  );
});
