/**
 * Beginner glossary guards' shared vocabulary: the official SRD 5.2.1 rule terms
 * (EN → IT stem) a plain-language line may use, and the check that an IT line
 * names every term its EN line names under the official Italian term.
 */

/** Official SRD 5.2.1 rule terms (EN → IT stem) the beginner lines may use. */
export const RULE_TERMS: ReadonlyArray<readonly [string, string]> = [
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
  ["Intelligence", "Intelligenza"],
  ["Wisdom", "Saggezza"],
  ["Charisma", "Carisma"],
  ["Unarmed Strike", "Colpo Senz'armi"],
];

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Case-sensitive. An EN term is a whole word (plural "s" allowed), so "Advantage"
 * never matches inside "Disadvantage" and "Grapple" never inside "Grappled". An IT
 * term is a word-start stem ("Azion" covers Azione and Azioni).
 */
const mentionsEn = (text: string, term: string): boolean =>
  new RegExp(`(?<!\\p{L})${escape(term)}s?(?!\\p{L})`, "u").test(text);
const mentionsIt = (text: string, term: string): boolean =>
  new RegExp(`(?<!\\p{L})${escape(term)}`, "u").test(text);

/** The `EN → IT` pairs the EN line names but the IT line misses. */
export function missingOfficialTerms(
  en: string,
  it: string,
  pairs: ReadonlyArray<readonly [string, string]>
): string[] {
  return pairs
    .filter(([enTerm]) => mentionsEn(en, enTerm))
    .filter(([, itTerm]) => !mentionsIt(it, itTerm))
    .map(([enTerm, itTerm]) => `${enTerm} → ${itTerm}`);
}
