/**
 * Test-only localizer for engine-emitted {@link LocText} carrier fields (R6+R3
 * SLICE 7c). Wraps the presenter `localizeText` to also accept `undefined` (an
 * optional carrier field — `granted-action.description`, `summary.trigger`, …),
 * returning `""` so a test can assert on a possibly-absent field without a
 * non-null assertion (golden rule 13 bans `!`). For a present field it resolves
 * the same string the app shows.
 */
import type { LocText } from "@/lib/loc-text";
import type { Locale } from "@/lib/locale";
import { localizeText } from "@/lib/views/srd-i18n";
import { localizeSrd, hasSrd, type SrdKind } from "@/i18n/resolver";

export function loc(text: LocText | undefined, locale: Locale): string {
  return text ? localizeText(text, locale) : "";
}

/**
 * Test helper — the SRD catalogue value for `(kind, key, field)` in `locale`,
 * or `""` when absent. The R3 strip (SLICE 7d) moved every SRD
 * `name`/`description`/… off `src/data/**` into the catalogue, so tests that
 * used to read `entity.name.en` assert against `srd(kind, id, "name", "en")`
 * instead. Mirrors what the app renders (`localizeSrd`), so the test stays a
 * faithful behaviour check.
 */
export function srd(kind: SrdKind, key: string, field: string, locale: Locale): string {
  return hasSrd(kind, key, field, locale) ? localizeSrd(kind, key, field, locale) : "";
}

/** A `{ en, it }` BiText reconstructed from the catalogue — for `toEqual` checks. */
export function srdBi(
  kind: SrdKind,
  key: string,
  field: string
): { en: string; it: string } {
  return { en: srd(kind, key, field, "en"), it: srd(kind, key, field, "it") };
}

/**
 * The catalogue text of a class-feature / feat ACTION (its `mechanics.actions[i]`
 * description/label) in `locale`. The R3 codemod keyed these positionally
 * (`<featureId>.mechanics.actions.<i>`), so a test reads the action text the same
 * way the smart-tracker does. `kind` defaults to `class-feature`.
 */
export function actionText(
  featureId: string | undefined,
  index: number,
  field: "description" | "label",
  locale: Locale,
  kind: SrdKind = "class-feature"
): string {
  return srd(kind, `${featureId ?? ""}.mechanics.actions.${index}`, field, locale);
}
