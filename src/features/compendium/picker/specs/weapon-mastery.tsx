/**
 * Weapon-mastery compendium spec — BROWSE-ONLY (the Compendium's "Weapon Mastery"
 * facet). The 2024 PHB defines eight weapon mastery properties (Cleave, Graze,
 * Nick, Push, Sap, Slow, Topple, Vex); a weapon-mastery class feature lets a
 * character USE the property of chosen weapons. This spec makes the properties
 * themselves browsable so a player can look up what "Vex" or "Topple" does —
 * exactly mirroring the maneuver / metamagic / invocation browse specs.
 *
 * The mastery ids come from the `WeaponMastery` type (the canonical data list);
 * their names + descriptions resolve from the `weapon-mastery` SRD catalogue
 * (EN + IT), so they're fully bilingual like every other compendium entry.
 */

import { Swords } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import type { WeaponMastery } from "@/data/types";
import type { CompendiumPickerSpec } from "../types";
import { CmpSeal } from "../CmpSeal";
import { descriptionSearch, nameCorpus } from "./shared";

/** One browsable weapon-mastery property — identified by its catalogue id. */
interface MasteryEntry {
  /** Lowercase catalogue id ("cleave", "vex", …) — the SRD-string key. */
  id: string;
}

/** The eight 2024 mastery properties, ordered as the `WeaponMastery` type lists
 *  them. Lowercased to the catalogue key — the single source for the id set, so a
 *  data add (a new mastery) flows here without a parallel list. */
const MASTERIES: readonly WeaponMastery[] = [
  "Cleave",
  "Graze",
  "Nick",
  "Push",
  "Sap",
  "Slow",
  "Topple",
  "Vex",
];

const MASTERY_DATA: MasteryEntry[] = MASTERIES.map((m) => ({ id: m.toLowerCase() }));

/** Resolve a localized SRD string for a mastery field. */
const mText = (e: MasteryEntry, field: string, locale: Locale) =>
  localizeSrd("weapon-mastery", e.id, field, locale);

export const weaponMasterySpec: CompendiumPickerSpec<MasteryEntry> = {
  id: "weapon-mastery",
  label: (t) => t("abilities.weaponMastery"),
  icon: Swords,
  // No codex verdict — this is a single-source facet (every entry IS a Weapon
  // Mastery), so a "Mastery" badge only echoes the tab + header + seal. The freed
  // row width goes to the subtitle's effect summary (the actual differentiator).
  data: MASTERY_DATA,
  getId: (e) => e.id,
  getName: (e, { locale }) => mText(e, "name", locale),
  // Active locale + EN names (both always loaded) + the id + the description text
  // (item f corpus): a player finds "Topple" by searching "prone" in either lang.
  nameText: (e, { locale }) =>
    nameCorpus("weapon-mastery", e.id, mText(e, "name", locale)),
  searchText: (e, ctx) => [
    ...weaponMasterySpec.nameText(e, ctx),
    ...descriptionSearch("weapon-mastery", e.id, ctx.locale),
  ],
  searchPlaceholder: (t) => t("weaponMastery.search"),

  // No facets — eight properties is a short, flat list (like a small browse spec).
  filters: [],

  row: (e, { locale }) => ({
    leading: <CmpSeal icon={Swords} tone="var(--at-action)" />,
    name: mText(e, "name", locale),
    // The differentiator, not the redundant "Weapon Mastery" rubric: a short
    // effect summary (id-keyed SRD catalogue, EN + IT) so a row says what the
    // mastery DOES at a glance.
    meta: mText(e, "summary", locale),
  }),

  detail: (e, { t, locale }) => ({
    eyebrow: (
      <span className="inline-flex items-center gap-2">
        <Icon as={Swords} size="sm" className="text-accent" decorative />
        {t("weaponMastery.eyebrow")}
      </span>
    ),
    description: mText(e, "description", locale),
  }),
};
