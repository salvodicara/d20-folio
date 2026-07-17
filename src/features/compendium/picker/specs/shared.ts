/**
 * Small pure helpers shared by the per-type compendium specs (class labels,
 * the caster/all-class lists). No JSX — kept in a `.ts` so the spec `.tsx`
 * files stay component-free for Fast Refresh.
 */

import { localizeSrd, hasSrd } from "@/i18n/resolver";
import type { SrdKind } from "@/i18n/srd-en";
import type { Locale } from "@/lib/locale";
import type { TFn } from "../types";

/** Localized class name for a bare class id ("bard" → "Bard"). */
export function classLabel(cls: string, t: TFn): string {
  return t(`srd.class_${cls}`);
}

/** The eight spellcasting classes the Spell add-modal offers as filters. */
export const CASTER_CLASSES = [
  "bard",
  "cleric",
  "druid",
  "paladin",
  "ranger",
  "sorcerer",
  "warlock",
  "wizard",
] as const;

/** Every class the Feature add-modal offers as filters. */
export const ALL_CLASSES = [
  "artificer",
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
] as const;

/**
 * Item f — content search corpus: the entity's DESCRIPTION text in both the
 * active locale AND English, so a player can find a spell/feat/item by what it
 * DOES, not only its name (e.g. searching "fire" surfaces every fire spell;
 * "advantage" surfaces every advantage-granting feature) in whichever language
 * they read.
 *
 * Critically it resolves ONLY resident locales: the active locale (always loaded)
 * + EN (statically bundled, always loaded) — NEVER the lazy non-active shard,
 * which the palette crash proved is a white-screen (`compendium-spec-srd-coverage`
 * locks this). Each lookup is `hasSrd`-guarded so an entity lacking a description
 * field is simply skipped, never throwing. De-duplicated for an EN user (active
 * === "en"). The returned strings are spread into a spec's `searchText`.
 */
export function descriptionSearch(
  kind: SrdKind,
  id: string,
  locale: Locale,
  field = "description"
): string[] {
  const out: string[] = [];
  if (hasSrd(kind, id, field, locale)) out.push(localizeSrd(kind, id, field, locale));
  // EN copy too (always resident) — but skip the duplicate when the active locale
  // already IS English.
  if (locale !== "en" && hasSrd(kind, id, field, "en")) {
    out.push(localizeSrd(kind, id, field, "en"));
  }
  return out;
}
