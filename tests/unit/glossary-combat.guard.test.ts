/**
 * Beginner glossary: core combat terms guard (owner decision 2026-10-16: every rule
 * term a beginner meets gets a plain-language line).
 *
 * Cases come from `COMBAT_GLOSSARY` and `COVER_TERM`, the tables the Play wiring is
 * typed by (`CombatTermId`), never a hand list here:
 *  - every combat term has a `glossary.term.<id>` line in EN and IT;
 *  - each line names its own term under its official SRD 5.2.1 name, EN and IT
 *    ("Bonus Action" / "Azione Bonus"); a cover term's name is its cover row's in
 *    the `rule` catalogue;
 *  - every rule term or other combat term an EN line mentions appears in the IT
 *    line under its official Italian name (Disadvantage → Svantaggio);
 *  - (wiring: glossary-tip's no-dead-entry test pins a `term="<id>"` /
 *    `term: "<id>"` site in src/ for each of them.)
 */
import { describe, it, expect } from "vitest";
import {
  COMBAT_GLOSSARY,
  COVER_TERM,
  type CombatTermId,
} from "@/components/shared/combat-glossary";
import { COVER_REFERENCE, coverKey } from "@/data/cover";
import type { LocaleText } from "@/data/types";
import { srdBi } from "@tests/_harness/loc";
import enGlossary from "@/i18n/en/ui/glossary.json";
import itGlossary from "@/i18n/it/ui/glossary.json";
import { RULE_TERMS, missingOfficialTerms } from "@tests/unit/__helpers__/glossary-terms";

const EN_TERMS: Record<string, string | undefined> = enGlossary.glossary.term;
const IT_TERMS: Record<string, string | undefined> = itGlossary.glossary.term;

const TERMS: ReadonlyArray<readonly [CombatTermId, LocaleText]> = [
  ...(Object.entries(COMBAT_GLOSSARY) as [CombatTermId, LocaleText][]),
  ...COVER_REFERENCE.map(
    (c) => [COVER_TERM[c.id].term, srdBi("rule", coverKey(c.id), "name")] as const
  ),
];

const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ...RULE_TERMS,
  ...TERMS.map(([, name]) => [name.en, name.it] as const),
];

describe("beginner glossary: core combat terms", () => {
  it("covers the combat terms a beginner meets in Play", () => {
    expect(TERMS.length).toBeGreaterThanOrEqual(13);
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
});
