/**
 * The guided creation labels can explain themselves — PD, rule 30 audit (2026-09-09).
 *
 * `GlossaryTip` (the one plain-language glossary primitive) resolves bodies from
 * `glossary.term.<id>` in EN and IT. The audit found the six live creation files use
 * no glossary at all and that the catalogue lacked the very terms creation asks a
 * beginner to choose: species, background, class, subclass, fighting style, weapon
 * mastery, standard array, alignment, origin feat. Slay the Spire and Baldur's Gate 3
 * define every keyword where it is shown (docs/superpowers/research/2026-09-09-pd/);
 * this pins that the catalogue carries a body for each creation term in both locales.
 */
import { describe, expect, it } from "vitest";
import enGlossary from "@/i18n/en/ui/glossary.json";
import itGlossary from "@/i18n/it/ui/glossary.json";

const CREATION_TERMS = [
  "species",
  "background",
  "characterClass",
  "subclass",
  "fightingStyle",
  "weaponMastery",
  "standardArray",
  "alignment",
  "originFeat",
  "skillProficiency",
] as const;

const term = (catalogue: { glossary: { term: Record<string, string> } }, id: string) =>
  catalogue.glossary.term[id];

describe("glossary covers every creation term in EN and IT", () => {
  it.each(CREATION_TERMS)(
    "%s has a body of at least one sentence in both locales",
    (id) => {
      const en = term(enGlossary, id);
      const it = term(itGlossary, id);
      expect(en, `EN glossary.term.${id}`).toBeTypeOf("string");
      expect(it, `IT glossary.term.${id}`).toBeTypeOf("string");
      expect(en.trim().length).toBeGreaterThanOrEqual(40);
      expect(it.trim().length).toBeGreaterThanOrEqual(40);
      expect(it).not.toBe(en);
    }
  );
});
