/**
 * Beginner glossary: conditions guard (owner decision 2026-10-16: every rule term a
 * beginner meets gets a plain-language line).
 *
 * Cases come from the SRD condition catalogue (`SRD_CONDITIONS`), never a hand list:
 *  - every SRD condition id has a `glossary.term.<id>` line in EN and IT;
 *  - each line names its own condition with the canonical SRD name (EN `name`, and
 *    the IT registry name from `i18n/it/srd/conditions.json`, e.g. "Prono");
 *  - every official rule term or other condition an EN line mentions appears in
 *    the IT line under its official SRD 5.2.1 Italian term (Advantage → Vantaggio,
 *    Prone → Prono), so the beginner line never drifts from the names on screen.
 */
import { describe, it, expect } from "vitest";
import { SRD_CONDITIONS } from "@/data/conditions";
import enGlossary from "@/i18n/en/ui/glossary.json";
import itGlossary from "@/i18n/it/ui/glossary.json";
import enConditions from "@/i18n/en/srd/conditions.json";
import itConditions from "@/i18n/it/srd/conditions.json";

const EN_TERMS: Record<string, string | undefined> = enGlossary.glossary.term;
const IT_TERMS: Record<string, string | undefined> = itGlossary.glossary.term;
const EN_NAMES: Record<string, { name: string } | undefined> = enConditions;
const IT_NAMES: Record<string, { name: string } | undefined> = itConditions;

/** Official SRD 5.2.1 rule terms (EN → IT stem) the beginner lines may use. */
const RULE_TERMS: ReadonlyArray<readonly [string, string]> = [
  ["Advantage", "Vantaggio"],
  ["Disadvantage", "Svantaggio"],
  ["Speed", "Velocità"],
  ["Bonus Action", "Azion"],
  ["Reaction", "Reazion"],
  ["Concentration", "Concentrazione"],
  ["Critical Hit", "Colpo Critico"],
  ["Initiative", "Iniziativa"],
  ["Long Rest", "Riposo Lungo"],
  ["Resistance", "Resistenza"],
  ["Strength", "Forza"],
  ["Dexterity", "Destrezza"],
];

/** Case-sensitive, word-start: "Advantage" never matches inside "Disadvantage". */
const mentions = (text: string, term: string): boolean =>
  new RegExp(`(?<!\\p{L})${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(text);

const IDS = SRD_CONDITIONS.map((c) => c.id);

describe("beginner glossary: every SRD condition", () => {
  it.each(IDS)("'%s' has a plain-language line in EN and IT", (id) => {
    expect(EN_TERMS[id]?.trim(), `EN glossary.term.${id}`).toBeTruthy();
    expect(IT_TERMS[id]?.trim(), `IT glossary.term.${id}`).toBeTruthy();
  });

  it.each(IDS)("'%s' names itself with the canonical SRD name", (id) => {
    expect(EN_TERMS[id] ?? "").toContain(EN_NAMES[id]?.name ?? id);
    expect(IT_TERMS[id] ?? "").toContain(IT_NAMES[id]?.name ?? id);
  });

  it.each(IDS)("'%s' uses the official IT term for every rule term it names", (id) => {
    const pairs: (readonly [string, string])[] = [
      ...RULE_TERMS,
      ...IDS.map((c) => [EN_NAMES[c]?.name ?? c, IT_NAMES[c]?.name ?? c] as const),
    ];
    const missing = pairs
      .filter(([en]) => mentions(EN_TERMS[id] ?? "", en))
      .filter(([, it]) => !mentions(IT_TERMS[id] ?? "", it))
      .map(([en, it]) => `${en} → ${it}`);
    expect(missing, `IT glossary.term.${id} misses official terms`).toEqual([]);
  });
});
