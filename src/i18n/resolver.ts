/**
 * `localizeSrd` — the pure, throwing SRD string resolver (R3,
 * docs/ARCHITECTURE.md + lock 1).
 *
 * SRD content (spell/feat/class/… names, descriptions, ranges, …) no longer
 * lives in `src/data/**` — `src/data` carries ids + mechanics ONLY. Every
 * translatable SRD string lives in `src/i18n/<locale>/srd/<file>.json`, keyed by
 * a STABLE key path (the entity id, with dotted segments for nested fields).
 * This module is the ONE seam that reads those catalogues.
 *
 * ## Catalogues come from the registry (SLICE 8)
 *
 * The catalogues are NO LONGER statically imported here. They are read from the
 * shared registry in `srd-en.ts`: EN is seeded statically (the canonical FACTS
 * source, always loaded); every OTHER locale is lazy-loaded per the active locale
 * by the i18n bootstrap (`ensureLocale`) and registered into that registry. So an
 * EN user pays only EN; an IT user pays EN (facts) + IT (display). A `localizeSrd`
 * call for a locale that has not been loaded yet hits the same missing-string path
 * as a missing key (throws in dev/test, sentinel in prod) — but post-bootstrap the
 * active locale is always loaded, so this never fires at runtime.
 *
 * Contract (lock 1):
 *  - PURE: no React, no Zustand, no Firebase, no i18next. Only static data in.
 *  - In dev/test a missing `kind`/`key`/`field` THROWS with the exact missing
 *    path (a missing SRD string is a BUG — CI catches it).
 *  - In production it returns the visible `⟦kind:key.field⟧` sentinel instead of
 *    throwing, so a live user never white-screens.
 *
 * Custom/homebrew content (user-authored spells/items) carries its OWN
 * single-locale text on the document and BYPASSES this resolver — see
 * {@link localizeCustom}. The resolver is for SRD ids only.
 */
import type { Locale } from "@/lib/locale";
import { srdCatalogues, type SrdKind } from "./srd-en";

/** Re-exported so existing `import { SrdKind } from "@/i18n/resolver"` sites stay. */
export type { SrdKind } from "./srd-en";

const IS_PROD = (() => {
  try {
    return import.meta.env.PROD;
  } catch {
    return false;
  }
})();

function missing(
  kind: SrdKind,
  key: string,
  field: string,
  locale: Locale
): never | string {
  const path = `${kind}:${key}.${field}#${locale}`;
  if (IS_PROD) return `⟦${path}⟧`;
  throw new Error(`[localizeSrd] missing SRD string "${path}"`);
}

/**
 * Resolve a single localized SRD string. Throws (dev/test) / returns the `⟦…⟧`
 * sentinel (prod) on any missing kind/key/field — or an un-loaded locale.
 */
export function localizeSrd(
  kind: SrdKind,
  key: string,
  field: string,
  locale: Locale
): string {
  const cats = srdCatalogues(locale);
  const entry = cats?.[kind][key];
  if (entry === undefined) return missing(kind, key, field, locale);
  const value = entry[field];
  if (value === undefined) return missing(kind, key, field, locale);
  return Array.isArray(value) ? value.join("\n") : value;
}

/**
 * Resolve a localized SRD string LIST (condition `effects`). Throws / sentinel on
 * miss, exactly like {@link localizeSrd}.
 */
export function localizeSrdList(
  kind: SrdKind,
  key: string,
  field: string,
  locale: Locale
): string[] {
  const cats = srdCatalogues(locale);
  const value = cats?.[kind][key]?.[field];
  if (value === undefined) {
    const m = missing(kind, key, field, locale);
    return [m];
  }
  return Array.isArray(value) ? value : [value];
}

/**
 * Does the catalogue carry this `(kind, key, field)`? Pure, never throws — for
 * consumers that legitimately render a field only when present (e.g. a spell's
 * optional `higherLevels`, a magic item's optional `attunementReq`). Returns
 * `false` for an un-loaded locale.
 */
export function hasSrd(
  kind: SrdKind,
  key: string,
  field: string,
  locale: Locale
): boolean {
  return srdCatalogues(locale)?.[kind][key]?.[field] !== undefined;
}

/**
 * The single-locale text of a USER-authored (custom/homebrew) entity — the
 * documented bypass of the SRD resolver (docs/ARCHITECTURE.md). Custom
 * content is user data, not SRD: it carries its own string and is shown verbatim.
 * This typed pass-through marks every such site explicitly so the
 * `no-bitext-indexing` guard can tell "resolved SRD string" from "raw user
 * string" apart.
 */
export function localizeCustom(text: string): string {
  return text;
}
