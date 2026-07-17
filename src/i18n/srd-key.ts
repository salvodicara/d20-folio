/**
 * `srdKey` — the runtime reproduction of the R3 codemod's stable catalogue key
 * paths (docs/ARCHITECTURE.md; companion to `scripts/r3-extract-srd-strings.cjs`).
 *
 * The codemod lifted every translatable SRD string out of `src/data/**` into
 * `src/i18n/<locale>/srd/<kind>.json`, keyed by a STABLE key path:
 *   - a top-level entity keys by its own `id`;
 *   - a nested object extends the parent key with `.<propName>`;
 *   - a nested array element keys by `.<propName>.<elementId>` when the element
 *     has an `id`, else `.<propName>.<slug(element.name.en)>` when it has a name,
 *     else `.<propName>.<index>`.
 *
 * This module reproduces those segment rules so the engine/views can compute the
 * SAME key the codemod produced — the composite key travels WITH the data
 * top-down (golden rule 7: branch on stable keys, never on display strings).
 *
 * PURE: no React, stores, Firebase, i18next, or locale. Just key-path math.
 */

/** The codemod's `slug` — lowercase, strip apostrophes, non-alnum → `-`. */
export function srdSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The stable segment for one element of a nested SRD array, mirroring the
 * codemod's array-element rule. `nameEn` is the element's English name (the
 * codemod read `name.en`); pass it ONLY for id-less, named elements.
 */
export function srdArraySegment(
  prop: string,
  el: { id?: string; nameEn?: string },
  index: number
): string {
  if (typeof el.id === "string") return `${prop}.${el.id}`;
  if (typeof el.nameEn === "string") return `${prop}.${srdSlug(el.nameEn)}`;
  return `${prop}.${index}`;
}

/** Compose a full key path from a base key and trailing dotted segments. */
export function srdKey(base: string, ...segments: string[]): string {
  return [base, ...segments].join(".");
}

/**
 * The stable catalogue segment for one element of a `grants[]` array, mirroring
 * the codemod's array-element rule for declarative grants (R6+R3 SLICE 7c). A
 * grant element has no single `id` convention: a `manifested-weapon` /
 * `pact-weapon` / `pact-weapon-rider` carries `id`, a `cunning-strike-option`
 * carries `optionId`, and an id-less but named `granted-action` was keyed by the
 * codemod under `slug(name.en)`. This resolves them in that priority — `id`,
 * then `optionId`, then the name slug, then the positional index — producing the
 * SAME segment the codemod wrote (`grants.<seg>`). `nameEn` is the grant's
 * English name (pass it only when the grant has one); reading it computes a
 * STABLE KEY, never display or locale-branching (same category as `srdEn`).
 */
export function srdGrantSegment(
  grant: { id?: string; optionId?: string; nameEn?: string },
  index: number
): string {
  const id = grant.id ?? grant.optionId;
  if (typeof id === "string") return `grants.${id}`;
  if (typeof grant.nameEn === "string") return `grants.${srdSlug(grant.nameEn)}`;
  return `grants.${index}`;
}
