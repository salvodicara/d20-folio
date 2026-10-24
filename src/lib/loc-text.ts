/**
 * `LocText` — a stable, localizable text REFERENCE the engine emits in place of
 * a materialized `LocaleText` (R6+R3 SLICE 7c, docs/ARCHITECTURE.md).
 *
 * ## Why this exists
 *
 * After R3 the translatable SRD strings no longer live in `src/data/**` — they
 * live in `src/i18n/<locale>/srd/<file>.json`, resolved at the presenter edge by
 * `localizeSrd`. The Grant engine (`grants.ts` aggregate + `smart-tracker.ts`
 * resolved actions/trackers) therefore can NO LONGER carry a `name`/`description`/
 * `label`/`trigger` as `LocaleText` data — it has no IT to materialize, and it must
 * never read the active locale (engine-core ↛ i18n; §1.1).
 *
 * Instead every such carrier field holds a `LocText`: a self-describing pointer
 * to ONE display string that the view resolves via {@link localizeText}
 * (`lib/views/srd-i18n.ts`). It is one of three variants:
 *
 *  - `srd`  — a stable catalogue reference `{ kind, key, field }`. The view
 *    resolves it through `localizeSrd(kind, key, field, locale)`. This is the
 *    common case: a class-feature / feat / race-trait / spell / equipment /
 *    invocation / maneuver / magic-item string the codemod lifted into the
 *    catalogue under a stable key (the entity id, with dotted segments for
 *    nested grant/action/option paths — see `@/i18n/srd-key`).
 *  - `custom` — a USER-authored single string (a homebrew feature/spell/weapon
 *    name or description). Not SRD: it carries its own text and the view shows it
 *    verbatim via `localizeCustom` (the documented resolver bypass).
 *  - `lit` — an ENGINE literal `LocaleText` that is NOT `src/data/**` SRD content
 *    (or homebrew text the player wrote per language, filled by `customText`).
 *    Being retired: engine words move to the catalogues (the smart-tracker's
 *    base actions read the `rule` catalogue, its Unarmed Strike and temp-HP lines
 *    `ui` keys); it stays for rows stored before the move and for
 *    names copied from a catalogue in every language (an encounter monster's
 *    action). No source file spells words in one (`no-srd-strings-in-data`
 *    guard). The view reads `text[locale]`.
 *  - `ui` — a REF to a `common`/ui i18n CHROME key (e.g. `"combat.otherReactionName"`),
 *    resolved at RENDER by the view via `i18n.getFixedT(locale)(key)`. Unlike `lit`,
 *    it NEVER freezes a both-locale value into the carrier — it stores only the key,
 *    so a logged row re-localizes on a language switch and EN stays resolvable as the
 *    canonical fallback (EN `common` is always loaded — see `src/i18n/index.ts`). Use
 *    for a view-synthesized row whose label is chrome (not SRD content, not user text),
 *    like the off-list reaction. The key MUST exist in BOTH `{en,it}/ui/*.json`.
 *
 * ## Contract
 *  - PURE: this module is the TYPE + three tiny constructors. No React, Zustand,
 *    Firebase, i18next, or active locale. It imports `SrdKind` from the
 *    whitelisted `@/i18n/srd-en` (locale-independent) and `LocaleText` from the data
 *    types — engine-core may import both.
 *  - The RESOLVER ({@link localizeText}) lives in `lib/views/` because it reads
 *    the active locale and calls `localizeSrd`; the engine never resolves a
 *    `LocText` itself.
 */
import type { LocaleText } from "@/data/types";
import type { SrdKind } from "@/i18n/srd-en";
import { homebrewLocaleText, type HomebrewText } from "@/lib/homebrew-text";

/**
 * A stable, localizable text reference — see the module doc. Exactly one of the
 * three variants; the view's {@link localizeText} resolves it to one string.
 */
export type LocText =
  | { srd: { kind: SrdKind; key: string; field: string } }
  | { custom: string }
  | { lit: LocaleText }
  | { ui: string; params?: UiTextParams };

/** The scalar `{{name}}` values a `ui` text interpolates (a computed die, a number). */
export type UiTextParams = Readonly<Record<string, string | number>>;

/** Construct an SRD-catalogue `LocText` from a `(kind, key, field)`. */
export function srdText(kind: SrdKind, key: string, field: string): LocText {
  return { srd: { kind, key, field } };
}

/**
 * Construct a `LocText` from USER-authored text (custom content). A plain string
 * stays `custom`, shown verbatim. Text authored per language becomes a `lit`
 * filled for every locale through `homebrewText`'s fallback, so a row that stores
 * it (a log line, a turn's action name) is the shape every reader already knows.
 */
export function customText(text: HomebrewText): LocText {
  return typeof text === "string" ? { custom: text } : { lit: homebrewLocaleText(text) };
}

/** Construct a `LocText` from an ENGINE-authored bilingual literal. */
export function litText(text: LocaleText): LocText {
  return { lit: text };
}

/**
 * Construct a `LocText` that REFERS to a `common`/ui chrome i18n `key`, resolved at
 * render time (`i18n.getFixedT(locale)(key)`). Contrast with {@link litText}: `ui`
 * is a REF to a chrome key resolved at render — it never freezes a both-locale value
 * — so a logged row re-localizes on a language switch and EN remains resolvable as the
 * canonical fallback. The `key` MUST exist in BOTH `{en,it}/ui/*.json`. `params`
 * fill its `{{name}}` placeholders (a computed die or amount), so the words stay in
 * the catalogue and only the fact rides the carrier.
 */
export function uiText(key: string, params?: UiTextParams): LocText {
  return params ? { ui: key, params } : { ui: key };
}
