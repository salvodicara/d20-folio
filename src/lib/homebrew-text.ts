/**
 * homebrew-text — the text a player authors for a homebrew entry (a name, a
 * description, a grant's label), in whichever languages they wrote it.
 *
 * Two stored shapes, both read forever, no migration:
 *  - a plain string: every homebrew entry stored before this module. Its language
 *    is unknown, so it is the text for every locale.
 *  - a partial per-locale map (`{ it: "Morso" }`, `{ en: "Bite", it: "Morso" }`):
 *    the player wrote some languages, not necessarily all.
 *
 * The fallback for one locale: that locale, else the source locale, else any
 * present locale, else "". Engine-core reads no active locale, so this module
 * fills EVERY locale at once ({@link homebrewLocaleText}) and gives the
 * source-locale fallback as a stable key ({@link homebrewTextKey}); the viewer's
 * string is `homebrewText` in `lib/views/homebrew-text-view.ts`.
 */
import type { LocaleText } from "@/data/types";
import { LOCALES, SOURCE_LOCALE, type Locale } from "@/lib/locale";

/** Text a player authored: one string for every language, or some languages. */
export type HomebrewText = string | Partial<Record<Locale, string>>;

/** The authored text in one language through the fallback chain. */
function fallback(value: Partial<Record<Locale, string>>, code: Locale): string {
  return (
    value[code] ||
    value[SOURCE_LOCALE] ||
    LOCALES.map((c) => value[c]).find(Boolean) ||
    ""
  );
}

/**
 * The authored text filled into every locale through the fallback: the
 * `LocaleText` an engine slot holds (a homebrew grant's label, a log row's name).
 */
export function homebrewLocaleText(value: HomebrewText | undefined): LocaleText {
  return Object.fromEntries(
    LOCALES.map((code) => [
      code,
      value === undefined
        ? ""
        : typeof value === "string"
          ? value
          : fallback(value, code),
    ])
  ) as LocaleText;
}

/**
 * The text in the source locale's fallback: one stable string, the same on every
 * device, for identity and matching (a library entry's key, a Concentration
 * stamp, a weapon row's id). A plain string is itself.
 */
export function homebrewTextKey(value: HomebrewText | undefined): string {
  return homebrewLocaleText(value)[SOURCE_LOCALE];
}

/**
 * The stored value as authored text, or null when it is neither shape: a string,
 * or a non-empty map whose keys are registered locales and whose values are
 * strings. An unknown language key (a newer client's locale) is not text this
 * client can read, so the whole value is refused rather than guessed.
 */
export function conformHomebrewText(value: unknown): HomebrewText | null {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;
  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  const text: Partial<Record<Locale, string>> = {};
  for (const [key, entry] of entries) {
    if (!(LOCALES as readonly string[]).includes(key) || typeof entry !== "string") {
      return null;
    }
    text[key as Locale] = entry;
  }
  return text;
}

/** Whether a stored value is authored text (see {@link conformHomebrewText}). */
export function isHomebrewText(value: unknown): value is HomebrewText {
  return conformHomebrewText(value) !== null;
}
