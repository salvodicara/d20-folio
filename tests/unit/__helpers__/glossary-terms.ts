/**
 * Beginner glossary guards' shared vocabulary: the official SRD 5.2.1 rule terms a
 * plain-language line may use, named by the catalogue key that holds each name
 * (never an inline EN/IT pair), and the check that an IT line names every term
 * its EN line names under the official Italian term.
 */
import { mergedUi, type Json } from "./ui-merged";

/**
 * Each rule term's official name, as the ui key whose (EN, IT) value is exactly
 * that name: the label the sheet already shows where one exists, else a
 * `glossary.name.<term>` entry.
 */
export const OFFICIAL_NAME_KEY = {
  advantage: "common.advantage",
  disadvantage: "common.disadvantage",
  bloodied: "character.health.bloodied",
  temporaryHitPoints: "glossary.name.temporaryHitPoints",
  deathSavingThrow: "glossary.name.deathSavingThrow",
  resistance: "common.resistance",
  vulnerability: "combat.damageMathVulnerable",
  immunity: "combat.damageMathImmune",
  reaction: "combat.reaction",
  bonusAction: "features.slotBonus",
  speed: "character.speed",
  concentration: "spells.concentration",
  criticalHit: "abilities.critRange",
  difficultTerrain: "glossary.name.difficultTerrain",
  surprise: "glossary.name.surprise",
  initiative: "monster.initiative",
  longRest: "rest.longRest",
  strength: "abilities.STR",
  dexterity: "abilities.DEX",
  intelligence: "abilities.INT",
  wisdom: "abilities.WIS",
  charisma: "abilities.CHA",
  unarmedStrike: "glossary.name.unarmedStrike",
} as const;

export type OfficialTerm = keyof typeof OFFICIAL_NAME_KEY;

const UI = { en: mergedUi("en"), it: mergedUi("it") };

/** The ui string at `key` in `locale`. */
export function uiName(key: string, locale: "en" | "it"): string {
  let node: Json | string | unknown[] | undefined = UI[locale];
  for (const part of key.split(".")) {
    node =
      node && typeof node === "object" && !Array.isArray(node) ? node[part] : undefined;
  }
  if (typeof node !== "string") throw new Error(`no ${locale} name at ${key}`);
  return node;
}

/** A term's official name in `locale`, read from its catalogue key. */
export const officialName = (term: OfficialTerm, locale: "en" | "it"): string =>
  uiName(OFFICIAL_NAME_KEY[term], locale);

/** A term's official `[EN, IT]` names. */
export const officialPair = (term: OfficialTerm): readonly [string, string] => [
  officialName(term, "en"),
  officialName(term, "it"),
];

/** Official SRD 5.2.1 rule terms (EN → IT) the beginner lines may use. */
export const RULE_TERMS: ReadonlyArray<readonly [string, string]> = (
  [
    "advantage",
    "disadvantage",
    "speed",
    "bonusAction",
    "reaction",
    "concentration",
    "criticalHit",
    "initiative",
    "longRest",
    "resistance",
    "strength",
    "dexterity",
    "intelligence",
    "wisdom",
    "charisma",
    "unarmedStrike",
  ] as const
).map(officialPair);

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * An Italian name as a pattern that also matches its plural: each word's final
 * vowel may change ("Azione Bonus" matches "Azioni Bonus", "Colpo Critico" matches
 * "Colpi Critici").
 */
const italianForms = (term: string): string =>
  term
    .split(" ")
    .map((word) => {
      const stem = word.replace(/[aeiou]$/u, "");
      return stem === word ? escape(word) : `${escape(stem)}\\p{L}`;
    })
    .join(" ");

/**
 * Case-sensitive. An EN term is a whole word (plural "s" allowed), so "Advantage"
 * never matches inside "Disadvantage" and "Grapple" never inside "Grappled". An IT
 * term matches at a word start in its singular or plural form.
 */
const mentionsEn = (text: string, term: string): boolean =>
  new RegExp(`(?<!\\p{L})${escape(term)}s?(?!\\p{L})`, "u").test(text);
const mentionsIt = (text: string, term: string): boolean =>
  new RegExp(`(?<!\\p{L})${italianForms(term)}`, "u").test(text);

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
