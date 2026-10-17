/**
 * The one-tap states, the condition gates and the unproficient-armor clauses
 * read their words from the `rule` catalogue. Cases come from the real
 * resolvers (the aggregate a lit state feeds, the gates of an active condition,
 * a wizard in chain mail); the pinned strings are the ones the rail showed
 * before the words moved.
 */
import { describe, expect, it } from "vitest";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { armorDisadvantageClauses } from "@/lib/smart-tracker";
import { lightStateKey } from "@/lib/light-states";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { localizeText } from "@/lib/views/srd-i18n";
import { asRaceId } from "@/data/srd-names";
import type { AdvantageClause } from "@/lib/grants";
import type { Locale } from "@/lib/locale";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const lines = (clauses: ReadonlyArray<AdvantageClause>, locale: Locale) =>
  clauses.map((clause) => localizeText(clause.description, locale));

function lit(doc: CharacterDoc, activeFeatures: string[]): CharacterDoc {
  return { ...doc, session: { ...doc.session, activeFeatures } };
}

const disadvantagesFrom = (doc: CharacterDoc, sourceId: string) =>
  aggregateCharacterGrants(doc.character, doc.session).disadvantages.filter(
    (clause) => clause.sourceId === sourceId
  );

describe("one-tap states", () => {
  const human = makeCharacterDoc({ race: asRaceId("human") });
  const dwarf = makeCharacterDoc({ race: asRaceId("dwarf") });

  it("Surprised names itself and its Initiative clause", () => {
    const doc = lit(human, ["surprised"]);
    expect(grantSourceLabel("surprised", "en")).toBe("Surprised");
    expect(grantSourceLabel("surprised", "it")).toBe("Sorpreso");
    expect(lines(disadvantagesFrom(doc, "surprised"), "en")).toEqual([
      "Initiative roll (Surprised)",
    ]);
    expect(lines(disadvantagesFrom(doc, "surprised"), "it")).toEqual([
      "Tiro d'Iniziativa (Sorpreso)",
    ]);
  });

  it("Wish Stress names itself", () => {
    expect(grantSourceLabel("wish-stress", "en")).toBe("Wish Stress");
    expect(grantSourceLabel("wish-stress", "it")).toBe("Stress di Desiderio");
  });

  it.each([
    [
      "dim",
      human,
      "Wisdom (Perception) checks to see (Lightly Obscured)",
      "Prove di Saggezza (Percezione) per vedere (Leggermente Oscurato)",
    ],
    [
      "darkness",
      human,
      "Attack rolls (Blinded for sight: Darkness)",
      "Tiri per colpire (Accecato per la vista: Oscurità)",
    ],
    [
      "darkness",
      dwarf,
      "Wisdom (Perception) checks to see (Lightly Obscured)",
      "Prove di Saggezza (Percezione) per vedere (Leggermente Oscurato)",
    ],
  ] as const)(
    "%s light reads its sight clause in both languages",
    (level, who, en, it) => {
      const key = lightStateKey(level);
      const doc = lit(who, [key]);
      expect(lines(disadvantagesFrom(doc, key), "en")).toEqual([en]);
      expect(lines(disadvantagesFrom(doc, key), "it")).toEqual([it]);
    }
  );
});

describe("condition gates", () => {
  it("Poisoned names its attack and check clauses", () => {
    const { disadvantages } = resolveConditionEffects(["poisoned"]);
    expect(lines(disadvantages, "en")).toEqual(["Attack rolls", "Ability checks"]);
    expect(lines(disadvantages, "it")).toEqual([
      "Tiri per colpire",
      "Prove di caratteristica",
    ]);
  });

  it("Restrained names its Dexterity save clause", () => {
    const { disadvantages } = resolveConditionEffects(["restrained"]);
    expect(lines(disadvantages, "en")).toContain("Dexterity saving throws");
    expect(lines(disadvantages, "it")).toContain("Tiri salvezza su Destrezza");
  });
});

describe("unproficient armor", () => {
  it("a wizard in chain mail reads each clause in both languages", () => {
    const wizard = makeCharacterDoc({
      classes: [{ classId: "wizard", level: 3 }],
      equipment: [{ srdId: "chain-mail", equipped: true }],
    });
    const clauses = armorDisadvantageClauses(wizard);
    expect(lines(clauses, "en").sort()).toEqual([
      "Attack rolls (wearing armor you lack proficiency with)",
      "Strength + Dexterity ability checks",
      "Strength + Dexterity saving throws",
    ]);
    expect(lines(clauses, "it").sort()).toEqual([
      "Prove di Forza e Destrezza",
      "Tiri per colpire (indossando armatura senza competenza)",
      "Tiri salvezza su Forza e Destrezza",
    ]);
  });
});
