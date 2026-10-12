/**
 * Spell-summoned companions — the creatures SRD 5.2.1 spells summon with a stat
 * block (Find Steed's Otherworldly Steed, Summon Dragon's Draconic Spirit, Giant
 * Insect, Phantom Steed's Riding Horse, the Arcane Hand object) are declared as the
 * spell's `companion`, named in both locales, and surface on the Companions rail
 * through the shared presenter at the level they were cast with.
 */
import { describe, it, expect } from "vitest";
import enSpells from "@/i18n/en/srd/spells.json";
import itSpells from "@/i18n/it/srd/spells.json";
import { spells } from "@/data/spells";
import { MOCK_CHARACTER } from "@/lib/mock";
import { concentrationValue } from "@/lib/concentration";
import { buildCompanionCardViews } from "@/lib/views/companion-row-view";
import type { CharacterDoc } from "@/types/character";

type Catalogue = Record<string, Record<string, string> | undefined>;
const en = enSpells as Catalogue;
const catalogues: Record<string, Catalogue> = { en, it: itSpells };

/** The English text says the spell makes a creature (or object) with printed
 *  statistics: "uses the … stat block", or the Arcane Hand's "is an object that
 *  has AC". */
const PRINTS_A_STAT_BLOCK = /\bstat block\b|\bis an object that has AC\b/i;

/** Spells whose text names a stat block for something that is NOT a summoned
 *  creature the caster fields. */
const NOT_A_SUMMON: Readonly<Record<string, string>> = {
  polymorph: "the target turns into a Beast form (the beast-form corpus), no summon",
  "true-polymorph": "the target turns into another form, no summon",
};

const summonSpellIds = spells
  .filter((spell) => !(spell.id in NOT_A_SUMMON))
  .filter((spell) => PRINTS_A_STAT_BLOCK.test(en[spell.id]?.description ?? ""))
  .map((spell) => spell.id)
  .sort();

const t = (key: string) => key;

function withSpells(
  ids: string[],
  session: Partial<CharacterDoc["session"]> = {}
): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      spells: ids.map((srdId) => ({ srdId, prepared: true })),
    },
    session: { ...MOCK_CHARACTER.session, ...session },
  };
}

describe("spell companions — declared from the catalogue text", () => {
  it("finds the summon spells in the text", () => {
    expect(summonSpellIds).toEqual([
      "bigbys-hand",
      "find-steed",
      "giant-insect",
      "phantom-steed",
      "summon-dragon",
    ]);
  });

  it("declares a companion on exactly the spells whose text prints a stat block", () => {
    const declared = spells
      .filter((spell) => spell.companion)
      .map((spell) => spell.id)
      .sort();
    expect(declared).toEqual(summonSpellIds);
  });

  it("names every companion, variant and attack in English and Italian", () => {
    const missing: string[] = [];
    for (const spell of spells) {
      const block = spell.companion;
      if (!block) continue;
      for (const variant of block.variants ?? [block]) {
        const prefix =
          variant.variantId && variant.variantId !== block.variantId
            ? `${spell.id}.companion.variants.${variant.variantId}`
            : `${spell.id}.companion`;
        const keys = [
          prefix,
          ...(variant.attacks ?? []).map((a) => `${prefix}.attacks.${a.id}`),
        ];
        for (const [locale, catalogue] of Object.entries(catalogues)) {
          for (const key of keys) {
            if (!catalogue[key]?.name) missing.push(`${locale}:${key}`);
          }
          if (block.variants && !catalogue[prefix]?.variantLabel) {
            missing.push(`${locale}:${prefix}.variantLabel`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("spell companions — on the Companions rail", () => {
  it("shows Find Steed's Otherworldly Steed at the spell's level", () => {
    const [steed] = buildCompanionCardViews(withSpells(["find-steed"]), "en", t);
    expect(steed).toMatchObject({
      featureId: "find-steed",
      label: "Otherworldly Steed",
      ac: 12,
      hpMax: 25,
      speed: "60 ft",
      selectedVariantId: "celestial",
    });
    expect(steed?.attacks[0]?.damage).toBe("1d8 + 2 srd.damage_radiant");
  });

  it("shows a Concentration summon only while concentrating on it", () => {
    expect(buildCompanionCardViews(withSpells(["summon-dragon"]), "en", t)).toEqual([]);
    const [spirit] = buildCompanionCardViews(
      withSpells(["summon-dragon"], {
        concentration: concentrationValue("summon-dragon"),
      }),
      "en",
      t
    );
    expect(spirit).toMatchObject({ label: "Draconic Spirit", ac: 19, hpMax: 50 });
  });

  it("scales the creature with the slot it was cast with", () => {
    const [spirit] = buildCompanionCardViews(
      withSpells(["summon-dragon"], {
        concentration: concentrationValue("summon-dragon"),
        concentrationCastLevel: 7,
      }),
      "en",
      t
    );
    expect(spirit).toMatchObject({ ac: 21, hpMax: 70 });
    expect(spirit?.attacks[0]?.damage).toBe("1d6 + 11 srd.damage_piercing");
  });

  it("gives the Arcane Hand the caster's Hit Point maximum", () => {
    const [hand] = buildCompanionCardViews(
      withSpells(["bigbys-hand"], { concentration: concentrationValue("bigbys-hand") }),
      "en",
      t
    );
    expect(hand).toMatchObject({ ac: 20, hpMax: MOCK_CHARACTER.character.hp.max });
  });

  it("prints every Speed mode in the reader's units", () => {
    const [wasp] = buildCompanionCardViews(
      withSpells(["giant-insect"], {
        concentration: concentrationValue("giant-insect"),
        companionVariant: { "giant-insect": "wasp" },
      }),
      "it",
      t
    );
    expect(wasp).toMatchObject({
      label: "Vespa gigante",
      speed: "12 m, character.speed_climb 12 m, character.speed_fly 12 m",
    });
  });

  it("swaps the Otherworldly Slam's damage type with the steed's creature type", () => {
    const [fiend] = buildCompanionCardViews(
      withSpells(["find-steed"], { companionVariant: { "find-steed": "fiend" } }),
      "en",
      t
    );
    expect(fiend?.attacks[0]?.damage).toBe("1d8 + 2 srd.damage_necrotic");
  });
});
