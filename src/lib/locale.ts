/**
 * The canonical `Locale` type — the single source of truth for the set of
 * supported languages. Pure, dependency-free (engine-safe). New language = add
 * its code here AND its `src/i18n/<code>/{ui,srd}` folder (R3,
 * docs/ARCHITECTURE.md).
 */
export type Locale = "en" | "it";

/** Every supported locale, in display order. */
export const LOCALES: readonly Locale[] = ["en", "it"];

/** Narrow an arbitrary string to a {@link Locale} (defaults to `"en"`). */
export function asLocale(value: string | undefined): Locale {
  return value === "it" ? "it" : "en";
}
