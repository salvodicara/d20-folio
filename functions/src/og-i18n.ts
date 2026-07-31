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
 * INVITATIONAL, not promotional (owner 2026-07-31): a shared link is an invitation
 * ("here's my character, have a look"), never an ad. So these cards NAME the thing and
 * OPEN the door — the character's own name + stats + portrait carry the card
 * (content-forward), and a quiet FOOTER line extends the invitation. No price /
 * benefit claim ("free", "no account") ever appears here: a benefit is stated only at
 * the decision moment (the sign-up CTA on the /view page), never as an ambient claim on
 * a share artifact. The eyebrows ("A SHARED CHARACTER" / "AN INVITATION") are likewise
 * gone. The unfurl DESCRIPTION stays compatibility-phrased ("for D&D 2024", never a
 * form that reads as an official product).
 */
export interface OgStrings {
  /** The character card footer — the invitation line (read-free, no benefit claim). */
  characterFooter: string;
  /** The invite card footer — the "step inside" invitation line. */
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
    characterFooter: "Have a look at this hero",
    inviteFooter: "Step into this adventure",
    level: "Level",
    ac: "AC",
    hp: "HP",
    atTheTable: (n) => `${n} ${n === 1 ? "adventurer" : "adventurers"} at the table`,
    // Invitational, no benefit claim (the `${name}` is unused for the invite card): the
    // compat phrase stays ("for D&D 2024"), the "free / no account" hook does not.
    sheetDescription: (name) =>
      `Have a look at ${name}'s hero on ${BRAND}, a companion for D&D 2024.`,
    joinTitle: (name) => `Join ${name} on ${BRAND}`,
    inviteDescription: () =>
      `Take a look inside this adventure on ${BRAND}, a companion for D&D 2024.`,
  },
  it: {
    characterFooter: "Dai un'occhiata a questo eroe",
    inviteFooter: "Entra in questa avventura",
    level: "Livello",
    ac: "CA",
    hp: "PF",
    atTheTable: (n) => `${n} ${n === 1 ? "avventuriero" : "avventurieri"} al tavolo`,
    sheetDescription: (name) =>
      `Dai un'occhiata all'eroe ${name} su ${BRAND}, un compagno per D&D 2024.`,
    joinTitle: (name) => `Unisciti a ${name} su ${BRAND}`,
    inviteDescription: () =>
      `Dai un'occhiata a questa avventura su ${BRAND}, un compagno per D&D 2024.`,
  },
};

/** The string table for a locale — the ONE lookup both OG modules read. */
export function ogStrings(locale: OgLocale): OgStrings {
  return STRINGS[locale];
}
