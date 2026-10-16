/**
 * The locale registry — the single source of truth for the supported languages.
 * Pure, dependency-free (engine-safe).
 *
 * A new language is a data change: one entry here plus its `src/i18n/<code>/{ui,srd}`
 * catalogues (and the pack's, for private content). Nothing else asks "is this
 * Italian?": number formats and units come from the entry
 * (`tests/unit/locale-registry.test.ts` guards it).
 */
interface LocaleSpec {
  /** The language's own name, as the language picker shows it. */
  label: string;
  /** BCP 47 tag for `Intl` number and date formatting. */
  intl: string;
  /** Distances, speeds and weights: metres/kg or feet/lb. */
  units: "metric" | "imperial";
}

export const LOCALE_REGISTRY = {
  en: { label: "English", intl: "en-US", units: "imperial" },
  it: { label: "Italiano", intl: "it-IT", units: "metric" },
} as const satisfies Record<string, LocaleSpec>;

export type Locale = keyof typeof LOCALE_REGISTRY;

/** The language every catalogue is authored in and every other one falls back to. */
export const SOURCE_LOCALE: Locale = "en";

/** Every supported locale, in display order. */
export const LOCALES = Object.keys(LOCALE_REGISTRY) as readonly Locale[];

function isLocale(value: string): value is Locale {
  return Object.hasOwn(LOCALE_REGISTRY, value);
}

/**
 * Narrow any language tag to a {@link Locale}: an exact code, else its primary
 * subtag (`it-IT` → `it`), else English.
 */
export function asLocale(value: string | undefined): Locale {
  if (!value) return "en";
  const primary = value.toLowerCase().split("-")[0] ?? "";
  if (isLocale(value)) return value;
  return isLocale(primary) ? primary : "en";
}

/** The `Intl` tag for numbers and dates in this language. */
export function intlTag(code: Locale): string {
  return LOCALE_REGISTRY[code].intl;
}

/** True when this language measures in metres and kilograms. */
export function usesMetric(locale: string): boolean {
  return LOCALE_REGISTRY[asLocale(locale)].units === "metric";
}

/** The next language in registry order, wrapping: the one-tap language switch. */
export function nextLocale(locale: Locale): Locale {
  return LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length] ?? SOURCE_LOCALE;
}
