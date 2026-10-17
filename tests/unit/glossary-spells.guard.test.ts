/**
 * Beginner glossary: spellcasting terms guard (owner decision 2026-10-16: every rule
 * term a beginner meets gets a plain-language line).
 *
 * Cases come from `SPELL_GLOSSARY`, the one table the spell-card wiring is typed
 * by (`SpellTermId`), never a hand list here:
 *  - every spellcasting term has a `glossary.term.<id>` line in EN and IT;
 *  - each line names its own term under its official SRD 5.2.1 name, EN and IT
 *    ("Casting Time" / "Tempo di Lancio");
 *  - every rule term or other spell term an EN line mentions appears in the IT
 *    line under its official Italian name (Spellcasting Focus → Focus da Incantatore);
 *  - (wiring: glossary-tip's no-dead-entry test pins a `term="<id>"` /
 *    `term: "<id>"` site in src/ for each of them.)
 */
import { describe, it, expect } from "vitest";
import { SPELL_GLOSSARY, type SpellTermId } from "@/components/shared/spell-glossary";
import enGlossary from "@/i18n/en/ui/glossary.json";
import itGlossary from "@/i18n/it/ui/glossary.json";
import {
  RULE_TERMS,
  missingOfficialTerms,
  uiName,
} from "@tests/unit/__helpers__/glossary-terms";

const EN_TERMS: Record<string, string | undefined> = enGlossary.glossary.term;
const IT_TERMS: Record<string, string | undefined> = itGlossary.glossary.term;

/** Each spell term with its official names, read from the ui key it names. */
const TERMS = (Object.entries(SPELL_GLOSSARY) as [SpellTermId, string][]).map(
  ([id, key]) => [id, { en: uiName(key, "en"), it: uiName(key, "it") }] as const
);

const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ...RULE_TERMS,
  ["Spell Slot", "Slot Incantesim"],
  ["Cantrip", "Trucchett"],
  ["Spellcasting Focus", "Focus da Incantatore"],
  ["Saving Throw", "Tiro Salvezza"],
  ...TERMS.map(([, name]) => [name.en, name.it] as const),
];

describe("beginner glossary: spellcasting terms", () => {
  it("covers the spellcasting terms a beginner meets on a spell card", () => {
    expect(TERMS.length).toBeGreaterThanOrEqual(16);
  });

  it.each(TERMS)("'%s' has a plain-language line in EN and IT", (id) => {
    expect(EN_TERMS[id]?.trim(), `EN glossary.term.${id}`).toBeTruthy();
    expect(IT_TERMS[id]?.trim(), `IT glossary.term.${id}`).toBeTruthy();
  });

  it.each(TERMS)("'%s' names itself by its official SRD name", (id, name) => {
    expect(EN_TERMS[id] ?? "").toContain(name.en);
    expect(IT_TERMS[id] ?? "").toContain(name.it);
  });

  it.each(TERMS)("'%s' uses the official IT name for every term it names", (id) => {
    const missing = missingOfficialTerms(EN_TERMS[id] ?? "", IT_TERMS[id] ?? "", PAIRS);
    expect(missing, `IT glossary.term.${id} misses official terms`).toEqual([]);
  });

  it.each(TERMS)("'%s' measures in metres in IT", (id) => {
    expect(IT_TERMS[id] ?? "").not.toMatch(/\b(feet|foot|piedi)\b/);
  });
});
