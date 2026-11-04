/**
 * The new creation screen (approved prototypes create-1…6): every class as a card,
 * the «Personaggio» summary beside the steps, and every background with its two
 * skills and its origin feat. A card's art is data (`ClassArt`): a game-icons glyph
 * for every class until the full set of paintings exists, then all swap at once.
 */
import i18n from "i18next";

import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { classTables } from "@/data/classes";
import { localizeSrd } from "@/i18n/resolver";
import type { CreationDraft, CreationFacts } from "@/lib/creation/draft";
import type { Locale } from "@/lib/locale";
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

export interface CreationSummary {
  classId: string;
  className: string;
  level: number;
  hitDie: string;
  /** The class's main ability (or abilities), named. */
  primaryAbility: string;
  armor: string[];
  /** The background's name, once one is chosen. */
  background: string | null;
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
    armor: (table?.armorProficiencies ?? []).map((id) =>
      localizeSrd("proficiency", id, "name", locale)
    ),
    background: facts.backgroundData
      ? localizeSrd("background", facts.backgroundData.id, "name", locale)
      : null,
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
