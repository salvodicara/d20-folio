/**
 * The Play screen's «Privilegi e tratti» and «Competenze e addestramento» (D&D Beyond's
 * Features & Traits and Proficiencies & Training), read-only.
 *
 * Features: the classic Features tab's own list (`characterFeatureList`), grouped by
 * origin (class, subclass, species, feats, homebrew), each with its source, rules text
 * and — for a limited feature — the uses left and the rest that brings them back.
 * Proficiencies: the classic rail's lists — the class table's armor and weapons with
 * the player's overrides, Weapon Mastery, the merged tools and languages.
 */
import { getClassTable } from "@/data/classes";
import { localizeSrd } from "@/i18n/resolver";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { primaryClassId } from "@/lib/classes";
import { hasWeaponMastery } from "@/lib/compute";
import type { Locale } from "@/lib/locale";
import { characterFeatureList, type FeatureGroup } from "@/lib/views/feature-list";
import {
  applySetOverride,
  displayLanguages,
  displayToolProficiencies,
} from "@/lib/views/sheet-view";
import {
  localizeTrackers,
  trackerRecoveryBadgeBucket,
  type RecoveryBadgeBucket,
} from "@/lib/views/tracker-view";
import type { CharacterDoc } from "@/types/character";

export interface PlayFeatureRow {
  id: string;
  name: string;
  /** "Bard 3", "College of Lore 3", a homebrew's own source; null for species traits
   *  and feats (their group says it). */
  source: string | null;
  /** A feat's category id, labelled by the screen. */
  featCategory?: string;
  /** Rules text; empty when the catalogue has none (the row does not open). */
  description: string;
  uses: { left: number; max: number; recovery: RecoveryBadgeBucket | null } | null;
}

export interface PlayFeaturesView {
  groups: { group: FeatureGroup; rows: PlayFeatureRow[] }[];
}

export function playFeaturesView(doc: CharacterDoc, locale: Locale): PlayFeaturesView {
  const trackers = new Map(localizeTrackers(doc, locale).map((t) => [t.id, t]));
  const groups: PlayFeaturesView["groups"] = [];
  for (const f of characterFeatureList(doc.character, locale)) {
    const tracker = trackers.get(f.id);
    const row: PlayFeatureRow = {
      id: f.id,
      name: f.name,
      source: f.sourceLabel,
      ...(f.featCategory ? { featCategory: f.featCategory } : {}),
      description: f.description,
      uses: tracker
        ? {
            left: Math.max(0, tracker.total - tracker.used),
            max: tracker.total,
            recovery: trackerRecoveryBadgeBucket(tracker.recovery),
          }
        : null,
    };
    const last = groups.at(-1);
    if (last?.group === f.group) last.rows.push(row);
    else groups.push({ group: f.group, rows: [row] });
  }
  return { groups };
}

export interface PlayProficienciesView {
  armor: string;
  weapons: string;
  weaponMastery: boolean;
  tools: string;
  languages: string;
}

export function playProficienciesView(
  doc: CharacterDoc,
  locale: Locale
): PlayProficienciesView {
  const cd = doc.character;
  const classId = primaryClassId(cd);
  const table = getClassTable(classId);
  const label = (p: string) => localizeSrd("proficiency", p, "name", locale);
  const aggregate = aggregateCharacterGrants(cd, doc.session);
  return {
    armor: applySetOverride(table?.armorProficiencies ?? [], cd.armorProficiencyOverrides)
      .map(label)
      .join(", "),
    weapons: applySetOverride(
      table?.weaponProficiencies ?? [],
      cd.weaponProficiencyOverrides
    )
      .map(label)
      .join(", "),
    weaponMastery: hasWeaponMastery(classId),
    tools: displayToolProficiencies(
      cd.toolProficiencyIds,
      cd.customToolProficiencies,
      aggregate,
      locale
    ),
    languages: displayLanguages(cd.languageIds, cd.customLanguages, aggregate, locale),
  };
}
