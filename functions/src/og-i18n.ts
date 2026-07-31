/**
 * og-i18n — the tiny {en,it} string table for the OG surface's DYNAMIC output.
 *
 * The rendered preview cards (`og-image.ts`) and their `<meta>` tags (`og-meta.ts`)
 * localise to the CHARACTER/CAMPAIGN OWNER's stored locale — `users/{uid}.settings.
 * language`, read server-side in `index.ts` (the Admin SDK can read it; the crawler
 * carries no recipient locale, and a card is cached once and shown to everyone, so the
 * OWNER's locale is the only cache-consistent choice — it keys off the doc, not the
 * request). Only the DYNAMIC output localises; the STATIC fallback card baked into
 * `index.html` stays ENGLISH always (owner decision, 2026-07-31).
 *
 * WHY A LOCAL COPY, not the app's i18n: a Cloud Function cannot import react-i18next's
 * runtime (no DOM, not in the app's bundler graph). The set the OG surface needs is a
 * handful of labels, so a minimal {en,it} record HERE is the ponytail call over wiring
 * the app catalogues into the functions build. Keep it MINIMAL and mirror the app's own
 * IT wording (Livello / CA / PF — `src/i18n/it/ui/*`). Class names are NOT translated:
 * `summarizeClasses` derives an English label from the class id, and the IT SRD names
 * are not cheaply reachable server-side, so class labels stay as-is (proper-noun-ish)
 * and only the SURROUNDING words localise (owner decision).
 */

/** The two locales the OG surface renders — the app's supported set. */
export type OgLocale = "en" | "it";

/** The brand wordmark — the single canonical copy both OG modules read. */
export const BRAND = "d20 Folio";

/** Coerce a stored `settings.language` (or anything) to a supported locale; EN default
 *  — an absent/unknown/unreadable value must never break rendering (owner decision). */
export function asOgLocale(value: unknown): OgLocale {
  return value === "it" ? "it" : "en";
}

/**
 * Every user-facing string the DYNAMIC OG output needs, per locale.
 *
 * MARKETING, not classification (owner 2026-07-31): these cards are the product's
 * acquisition top-of-funnel (a friend shares → a non-user wants in), so they SELL.
 * The old dry eyebrows ("A SHARED CHARACTER" / "AN INVITATION") are gone — the
 * character's own name + stats + portrait carry the card (content-forward), and a
 * quiet value-forward FOOTER line carries the hook so it survives a crawler's crop.
 * The conversion hook ("free, no account needed" / "take a seat") also lives in the
 * unfurl DESCRIPTION, which stays compatibility-phrased ("for D&D 2024", never a form
 * that reads as an official product).
 */
export interface OgStrings {
  /** The character card footer — the value line / conversion hook (read-free). */
  characterFooter: string;
  /** The invite card footer — the aspirational "join us" line. */
  inviteFooter: string;
  /** The "Level" word prefixing the total level (class names stay as-is). */
  level: string;
  /** Armour-class label on the stat line. */
  ac: string;
  /** Hit-points label on the stat line. */
  hp: string;
  /** "N adventurers at the table", pluralised. */
  atTheTable: (members: number) => string;
  /** The character preview description tag. */
  sheetDescription: (name: string) => string;
  /** The invite preview title tag. */
  joinTitle: (name: string) => string;
  /** The invite preview description tag. */
  inviteDescription: (name: string) => string;
}

const STRINGS: Record<OgLocale, OgStrings> = {
  en: {
    characterFooter: "Free to read · no account needed",
    inviteFooter: "A seat awaits you",
    level: "Level",
    ac: "AC",
    hp: "HP",
    atTheTable: (n) => `${n} ${n === 1 ? "adventurer" : "adventurers"} at the table`,
    sheetDescription: (name) =>
      `Meet ${name}, a living character sheet on ${BRAND}. Free to read, no account needed. A companion for D&D 2024.`,
    joinTitle: (name) => `Join ${name} on ${BRAND}`,
    inviteDescription: (name) =>
      `Take a seat at the ${name} table on ${BRAND}, a free, offline-first companion for D&D 2024.`,
  },
  it: {
    characterFooter: "Lettura gratuita · nessun account",
    inviteFooter: "Un posto ti attende",
    level: "Livello",
    ac: "CA",
    hp: "PF",
    atTheTable: (n) => `${n} ${n === 1 ? "avventuriero" : "avventurieri"} al tavolo`,
    sheetDescription: (name) =>
      `Conosci ${name}, una scheda vivente su ${BRAND}. Lettura gratuita, nessun account. Un compagno per D&D 2024.`,
    joinTitle: (name) => `Unisciti a ${name} su ${BRAND}`,
    inviteDescription: (name) =>
      `Prendi posto al tavolo di ${name} su ${BRAND}, un compagno gratuito e offline-first per D&D 2024.`,
  },
};

/** The string table for a locale — the ONE lookup both OG modules read. */
export function ogStrings(locale: OgLocale): OgStrings {
  return STRINGS[locale];
}
