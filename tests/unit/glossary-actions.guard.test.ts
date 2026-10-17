/**
 * Beginner glossary: base actions guard (owner decision 2026-10-16: every rule term
 * a beginner meets gets a plain-language line).
 *
 * Cases come from the engine's base action table (`BASE_ACTIONS`), never a hand list:
 *  - every base action id has a `glossary.term.<id>` line in EN and IT;
 *  - each line names its own action with the name its card shows (the IT names are
 *    pinned to the official IT SRD 5.2.1 by it-name-consistency.guard);
 *  - every rule term, condition or other action an EN line mentions appears in the
 *    IT line under its official Italian name (Disengage → Disimpegno, Prone → Prono).
 */
import { describe, it, expect } from "vitest";
import { BASE_ACTIONS } from "@/lib/smart-tracker";
import { baseActionKey } from "@/lib/base-action-states";
import enGlossary from "@/i18n/en/ui/glossary.json";
import itGlossary from "@/i18n/it/ui/glossary.json";
import enConditions from "@/i18n/en/srd/conditions.json";
import itConditions from "@/i18n/it/srd/conditions.json";
import { RULE_TERMS, missingOfficialTerms } from "@tests/unit/__helpers__/glossary-terms";
import { srd } from "@tests/_harness/loc";
import type { Locale } from "@/lib/locale";

/** A base action's name, as its card shows it. */
const actionName = (id: string, locale: Locale): string =>
  srd("rule", baseActionKey(id), "name", locale);

const EN_TERMS: Record<string, string | undefined> = enGlossary.glossary.term;
const IT_TERMS: Record<string, string | undefined> = itGlossary.glossary.term;
const CONDITION_IDS = Object.keys(enConditions) as (keyof typeof enConditions)[];

const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ...RULE_TERMS,
  ...CONDITION_IDS.map((c) => [enConditions[c].name, itConditions[c].name] as const),
  ...BASE_ACTIONS.map((a) => [actionName(a.id, "en"), actionName(a.id, "it")] as const),
];

const ACTIONS = BASE_ACTIONS.map((a) => [a.id, a] as const);

describe("beginner glossary: every base action", () => {
  it.each(ACTIONS)("'%s' has a plain-language line in EN and IT", (id) => {
    expect(EN_TERMS[id]?.trim(), `EN glossary.term.${id}`).toBeTruthy();
    expect(IT_TERMS[id]?.trim(), `IT glossary.term.${id}`).toBeTruthy();
  });

  it.each(ACTIONS)("'%s' names itself as its card does", (id, action) => {
    expect(EN_TERMS[id] ?? "").toContain(actionName(action.id, "en"));
    expect(IT_TERMS[id] ?? "").toContain(actionName(action.id, "it"));
  });

  it.each(ACTIONS)("'%s' uses the official IT name for every term it names", (id) => {
    const missing = missingOfficialTerms(EN_TERMS[id] ?? "", IT_TERMS[id] ?? "", PAIRS);
    expect(missing, `IT glossary.term.${id} misses official terms`).toEqual([]);
  });
});
