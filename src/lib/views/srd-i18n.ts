/**
 * SRD i18n Utilities
 *
 * Provides localized name lookups for character data stored as English names/IDs.
 * Character records store class/race/background as English strings.
 * This module resolves them back to BiText for locale-aware display.
 */

import type { BiText, WeaponMastery } from "@/data/types";
import {
  CLASS_NAMES,
  SUBCLASS_NAMES,
  RACE_NAMES,
  BACKGROUND_NAMES,
} from "@/data/srd-names";
import { localeRangePair } from "@/lib/utils";
import type { LocText } from "@/lib/loc-text";
import { hasSrd, localizeSrd, localizeCustom, type SrdKind } from "@/i18n/resolver";
import i18n from "@/i18n";

type Locale = keyof BiText;

/**
 * Resolve an engine-emitted {@link LocText} to one display string at the
 * presenter edge (R6+R3 SLICE 7c). The ONE seam that turns a Grant-engine
 * carrier's localizable reference into text:
 *  - `srd`    → `localizeSrd(kind, key, field, locale)` (the catalogue);
 *  - `custom` → `localizeCustom(text)` (user-authored, verbatim);
 *  - `ui`     → `i18n.getFixedT(locale)(key)` (a `common`/ui chrome key, resolved
 *               at render — safe here because the active locale is always loaded
 *               AND EN `common` is now always loaded as the canonical fallback);
 *  - `lit`    → `text[locale]` (an engine-authored bilingual literal).
 *
 * Engine-core never calls this (it would read the active locale); only
 * `lib/views/**` + UI does — this presenter/views layer is ALLOWED to read i18n.
 * Mirrors `localizeSrd`'s throw/sentinel behaviour for the `srd` variant — a missing
 * catalogue string is a BUG the dev/test gate catches.
 */
/**
 * The display name of a grant SOURCE (feature / feat / magic-item / race trait /
 * invocation / background) — localized off its catalogue `ref` (R6+R3 SLICE 7d)
 * when the source carries one (every SRD source does), else its inline `name`
 * (synthetic/runtime sources), else its stable id as a last resort. The single
 * presenter-edge resolver for "what is this grant source called", so spell-cast /
 * free-cast / spells-view rows never read the (stripped) source BiText.
 */
export function grantSourceName(
  source: { id: string; name?: BiText; ref?: { kind: SrdKind; key: string } },
  locale: Locale
): string {
  if (source.ref) return localizeSrd(source.ref.kind, source.ref.key, "name", locale);
  return source.name?.[locale] ?? source.id;
}

export function localizeText(text: LocText, locale: Locale): string {
  if ("srd" in text) {
    return localizeSrd(text.srd.kind, text.srd.key, text.srd.field, locale);
  }
  if ("custom" in text) return localizeCustom(text.custom);
  if ("ui" in text) return i18n.getFixedT(locale)(text.ui);
  return text.lit[locale];
}

// Name maps are built from the SRD-FREE `@/data/srd-names` source (not the full
// class/race/background data) so importing this module for a label never drags the
// multi-megabyte SRD onto the roster. A guard test pins srd-names to the live data
// so the names can't drift. (Weapon-property helpers below are pure string maps.)

// English name → BiText (classes).
const classNameMap = new Map<string, BiText>(
  CLASS_NAMES.map((n) => [n.en.toLowerCase(), n])
);

// Races: id → BiText AND English name → BiText.
const raceNameMap = new Map<string, BiText>();
for (const { id, name } of RACE_NAMES) {
  raceNameMap.set(id, name);
  raceNameMap.set(name.en.toLowerCase(), name);
}

// Backgrounds: id → BiText AND English name → BiText.
const backgroundNameMap = new Map<string, BiText>();
for (const { id, name } of BACKGROUND_NAMES) {
  backgroundNameMap.set(id, name);
  backgroundNameMap.set(name.en.toLowerCase(), name);
}

// Subclasses: kebab-case id → BiText AND English name → BiText — so the roster /
// sheets display "College of Lore" instead of the raw "college-of-lore" srdId.
const subclassNameMap = new Map<string, BiText>();
for (const { id, name } of SUBCLASS_NAMES) {
  subclassNameMap.set(id.toLowerCase(), name);
  subclassNameMap.set(name.en.toLowerCase(), name);
}

/**
 * Translate a class name (stored as English) to the current locale.
 * Falls back to the original string if no match found.
 */
export function localizeClassName(name: string, locale: Locale): string {
  const biText = classNameMap.get(name.toLowerCase());
  return biText?.[locale] ?? name;
}

/**
 * Translate a race name/ID to the current locale.
 * Falls back to the original string if no match found.
 */
export function localizeRaceName(nameOrId: string, locale: Locale): string {
  const biText = raceNameMap.get(nameOrId.toLowerCase());
  return biText?.[locale] ?? nameOrId;
}

/**
 * The localized "race · class level" identity line — the SINGLE source of truth
 * for every surface that summarizes a character (roster card, cockpit header,
 * lore tab). R4 — class + level DERIVE from `classes[]` (the source of truth);
 * a multiclass character renders every class at its level joined by " / "
 * ("Mago 5 / Chierico 3"). Class ids localize via `localizeClassName`; the
 * subclass is rendered separately by consumers via `localizeSubclassName`.
 */
export function localizeCharacterIdentity(
  char: { race?: string; classes?: ReadonlyArray<{ classId: string; level: number }> },
  locale: Locale
): string {
  const race = char.race ? localizeRaceName(char.race, locale) : "";
  const classes = char.classes ?? [];
  const classPart = classes
    .map((e) => `${localizeClassName(e.classId, locale)} ${e.level}`.trim())
    .filter(Boolean)
    .join(" / ");
  return [race, classPart].filter(Boolean).join(" · ");
}

/**
 * Translate a background name/ID to the current locale.
 * Falls back to the original string if no match found.
 */
export function localizeBackgroundName(nameOrId: string, locale: Locale): string {
  const biText = backgroundNameMap.get(nameOrId.toLowerCase());
  return biText?.[locale] ?? nameOrId;
}

/**
 * Translate a subclass ID (kebab-case srdId, e.g. "college-of-lore") or English
 * name to the current locale. Falls back to a title-cased version of the raw ID
 * so a raw srdId never leaks into the UI.
 */
export function localizeSubclassName(nameOrId: string, locale: Locale): string {
  const biText = subclassNameMap.get(nameOrId.toLowerCase());
  if (biText) return biText[locale];
  // Honest fallback: title-case the kebab-case id ("college-of-lore" → "College
  // Of Lore") so an unmapped homebrew/setting subclass still reads as a label.
  return nameOrId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Weapon property / category localization ────────────────────────────────

/**
 * Slug a canonical EN weapon-property / ammo word into its STABLE catalogue token
 * — lowercase, parentheses and other punctuation collapse to single hyphens
 * ("Two-Handed (unless mounted)" → "two-handed-unless-mounted", "Arrow" → "arrow").
 * Derived (never hardcoded) so NO localized display literal lives in code (golden
 * rule 7 — the code speaks ids; the names live in the JSON catalogue).
 */
function weaponPropertyToken(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Resolve a `weapon-property` catalogue name, interpolating `{{…}}` parameters. */
function weaponPropertyName(
  token: string,
  locale: Locale,
  params: Record<string, string> = {}
): string {
  const template = localizeSrd("weapon-property", token, "name", locale);
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => params[key] ?? "");
}

/**
 * Localizes a single weapon property string, sourcing EVERY display word from the
 * `weapon-property` SRD catalogue (no IT literal lives here — golden rule 7).
 * The canonical EN data string is parsed to a STABLE token + parameters; the token
 * resolves a (possibly parameterized) catalogue template that is then interpolated:
 *  - Simple properties (Finesse, Light, Two-Handed, …) → `{name}` verbatim.
 *  - "Thrown (Range X/Y)"          → `thrown`, `{{range}}` = the converted pair.
 *  - "Versatile (dX)"              → `versatile`, `{{die}}` = the die (e.g. "1d10").
 *  - "Ammunition (Range X/Y; T)"   → `ammunition`, `{{range}}` + `{{type}}`
 *                                    (the ammo type localized via its own token).
 * Distances convert through `localeRangePair` (domain rule D3). An unrecognized /
 * custom property falls back to its original string (never a catalogue miss).
 */
export function localizeWeaponProperty(prop: string, locale: Locale): string {
  // EN data strings ARE the canonical display (the `weapon-property` catalogue's
  // EN entries equal them by construction — kept for EN↔IT parity + the leak-lock):
  // return verbatim, so the printed range keeps its bare "20/60" with no unit added.
  if (locale === "en") return prop;

  // Simple (non-parameterized) property — slug to its token; if the catalogue
  // carries it, resolve the localized name from JSON. (Parameterized properties
  // slug to a token the catalogue does NOT hold, so they fall through to their
  // parsers below; a custom/unknown property falls through to the verbatim tail.)
  const simpleToken = weaponPropertyToken(prop);
  if (hasSrd("weapon-property", simpleToken, "name", locale)) {
    return weaponPropertyName(simpleToken, locale);
  }

  // "Thrown (Range X/Y)" → template with the metre/foot-converted range pair.
  const thrownMatch = prop.match(/^Thrown \(Range (\d+)\/(\d+)\)$/i);
  if (thrownMatch) {
    const range = localeRangePair(
      parseInt(thrownMatch[1] ?? "0", 10),
      parseInt(thrownMatch[2] ?? "0", 10),
      locale
    );
    return weaponPropertyName("thrown", locale, { range });
  }

  // "Versatile (dX)" → template with the two-handed die folded in.
  const versatileMatch = prop.match(/^Versatile \((\d*d\d+)\)$/i);
  if (versatileMatch) {
    return weaponPropertyName("versatile", locale, { die: versatileMatch[1] ?? "" });
  }

  // "Ammunition (Range X/Y; Type)" → template with the range pair + localized type.
  const ammoMatch = prop.match(/^Ammunition \(Range (\d+)\/(\d+); ([^)]+)\)$/i);
  if (ammoMatch) {
    const range = localeRangePair(
      parseInt(ammoMatch[1] ?? "0", 10),
      parseInt(ammoMatch[2] ?? "0", 10),
      locale
    );
    const typeWord = ammoMatch[3] ?? "";
    const ammoToken = weaponPropertyToken(typeWord);
    const type = hasSrd("weapon-property", ammoToken, "name", locale)
      ? localizeSrd("weapon-property", ammoToken, "name", locale)
      : typeWord;
    return weaponPropertyName("ammunition", locale, { range, type });
  }

  // Unrecognized / custom property — show it verbatim (no catalogue miss).
  return prop;
}

/**
 * Localizes the weapon category ("simple" / "martial") to the current locale.
 * Returns the string capitalized for display.
 */
export function localizeWeaponCategory(category: string, locale: Locale): string {
  if (locale === "en") {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }
  const map: Record<string, string> = { simple: "Semplice", martial: "Marziale" };
  return map[category.toLowerCase()] ?? category;
}

/**
 * Localizes a weapon's Mastery property token to its display name. The stored
 * fact is the canonical {@link WeaponMastery} token ("Topple", "Vex", …); the
 * `weapon-mastery` SRD catalogue is keyed by the lowercased id ("topple",
 * "vex", …) — the SAME id mapping the Compendium's weapon-mastery facet uses
 * (`m.toLowerCase()`), so EVERY surface that shows a mastery (weapon cards, the
 * inventory tags, the Features re-pick rows, level-up) resolves through this ONE
 * path and reads identically by construction (golden rule 6). Never branch on
 * the display string — derive the catalogue id from the stable token (rule 7).
 */
export function localizeWeaponMastery(mastery: WeaponMastery, locale: Locale): string {
  return localizeSrd("weapon-mastery", mastery.toLowerCase(), "name", locale);
}
