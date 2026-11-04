/**
 * The new creation screen (approved prototypes create-1…6): every class as a card,
 * the «Personaggio» summary beside the steps, and every background with its two
 * skills and its origin feat. A card's art is data (`ClassArt`): a game-icons glyph
 * for every class until the full set of paintings exists, then all swap at once.
 */
import i18n from "i18next";

import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { DEFAULT_QUICKBUILD_PRESET, QUICKBUILD_PRESETS } from "@/data/quickbuild";
import { SRD_RACES } from "@/data/races";
import { classTables } from "@/data/classes";
import { localizeSrd } from "@/i18n/resolver";
import type { CreationDraft, CreationFacts } from "@/lib/creation/draft";
import type { Locale } from "@/lib/locale";
import { appliedQuickbuildState } from "@/lib/quickbuild";
import { raceTraitNames } from "@/lib/views/creation-view";
import type { AbilityCode } from "@/types/ability";
import type { IconName } from "@/ui/icon-names";
import { skillNameToId } from "@/lib/skills";

/** A class card's art: one kind for every class at a time. */
export type ClassArt = { kind: "glyph"; icon: IconName };

export interface ClassCard {
  id: string;
  name: string;
  art: ClassArt;
}

export function classCards(locale: Locale): ClassCard[] {
  return classTables
    .map((table) => ({
      id: table.id,
      name: localizeSrd("class", table.id, "name", locale),
      art: { kind: "glyph" as const, icon: `g-class-${table.id}` as IconName },
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

const ARMOR_ORDER: readonly string[] = [
  "light-armor",
  "medium-armor",
  "heavy-armor",
  "shields",
];

export interface CreationSummary {
  classId: string;
  className: string;
  level: number;
  hitDie: string;
  /** The class's main ability (or abilities), named. */
  primaryAbility: string;
  /** The armour the class trains with, in a few words («leggere, medie, scudi»). */
  armor: string;
  /** The background's name, once one is chosen. */
  background: string | null;
  /** The species' name. */
  species: string;
  /** The class's main ability with its score as built («Saggezza 17 (+3)»). */
  primaryScore: { code: AbilityCode; score: number; mod: number } | null;
}

export function creationSummary(
  draft: CreationDraft,
  facts: CreationFacts,
  locale: Locale
): CreationSummary {
  const t = i18n.getFixedT(locale);
  const table = facts.classTable;
  const or = new Intl.ListFormat(locale, { type: "disjunction" });
  return {
    classId: draft.classId,
    className: localizeSrd("class", draft.classId, "name", locale),
    level: draft.level,
    hitDie: `d${String(facts.hitDie)}`,
    primaryAbility: or.format(
      (table?.primaryAbility ?? []).map((a) => t(`abilities.${a}`))
    ),
    armor: (table?.armorProficiencies ?? [])
      .filter((id) => ARMOR_ORDER.includes(id))
      .sort((a, b) => ARMOR_ORDER.indexOf(a) - ARMOR_ORDER.indexOf(b))
      .map((id) => t(`create.screen.armorShort.${id}`))
      .join(", "),
    background: facts.backgroundData
      ? localizeSrd("background", facts.backgroundData.id, "name", locale)
      : null,
    species: localizeSrd("race", draft.raceId, "name", locale),
    primaryScore: primaryScoreOf(table?.primaryAbility ?? [], facts),
  };
}

export interface BackgroundRow {
  id: string;
  name: string;
  skills: string[];
  /** The origin feat's name. */
  feat: string;
}

export function backgroundRows(locale: Locale): BackgroundRow[] {
  const t = i18n.getFixedT(locale);
  return SRD_BACKGROUNDS.map((bg) => ({
    id: bg.id,
    name: localizeSrd("background", bg.id, "name", locale),
    skills: bg.skillProficiencies.map((skill) =>
      t(`skills.${skillNameToId(skill) ?? skill}`)
    ),
    feat: localizeSrd("feat", bg.feat, "name", locale),
  })).sort((a, b) => a.name.localeCompare(b.name, locale));
}

export interface SpeciesRow {
  id: string;
  name: string;
  /** Up to three of its traits, named. */
  traits: string[];
}

export function speciesRows(locale: Locale): SpeciesRow[] {
  return SRD_RACES.map((race) => ({
    id: race.id,
    name: localizeSrd("race", race.id, "name", locale),
    traits: raceTraitNames(race.id, 3, locale),
  })).sort((a, b) => a.name.localeCompare(b.name, locale));
}

const ABILITY_ORDER: readonly AbilityCode[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

export interface AbilityTile {
  code: AbilityCode;
  /** The score chosen (suggested, bought or rolled). */
  base: number;
  /** The background's bonus on it (0, 1 or 2). */
  bonus: number;
  score: number;
  mod: number;
}

/** The six abilities as the step shows them: base, background bonus, score. */
export function abilityTiles(draft: CreationDraft, facts: CreationFacts): AbilityTile[] {
  return ABILITY_ORDER.map((code) => {
    const base = draft.abilityScores[code];
    const score = facts.effectiveScores[code];
    return { code, base, bonus: score - base, score, mod: Math.floor((score - 10) / 2) };
  });
}

/** The class's ready-made scores (its quickbuild): «Valori consigliati». */
export function suggestedScores(classId: string): Record<AbilityCode, number> {
  const preset = QUICKBUILD_PRESETS[classId] ?? DEFAULT_QUICKBUILD_PRESET;
  return { ...appliedQuickbuildState(classId, preset).abilityScores };
}

/** The best of the class's main abilities, as built. */
function primaryScoreOf(
  codes: ReadonlyArray<AbilityCode>,
  facts: CreationFacts
): CreationSummary["primaryScore"] {
  const best = [...codes].sort(
    (a, b) => facts.effectiveScores[b] - facts.effectiveScores[a]
  )[0];
  if (!best) return null;
  const score = facts.effectiveScores[best];
  return { code: best, score, mod: Math.floor((score - 10) / 2) };
}

/** A modifier as the sheet writes it: «+2», «−1» (a real minus sign). */
export const signed = (n: number): string =>
  n >= 0 ? `+${String(n)}` : `−${String(-n)}`;
