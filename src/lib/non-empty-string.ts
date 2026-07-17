/**
 * non-empty-string — the branded type that makes "a present-but-empty string"
 * UNREPRESENTABLE (owner directive 2026-06-15: it must be IMPOSSIBLE to have a
 * character with no name; enforce non-nullability at the TYPE level, not with a
 * render-time placeholder).
 *
 * A {@link NonEmptyString} is a `string` carrying a phantom `__nonEmpty` brand.
 * Because the brand is a `unique symbol` only this module can produce, a plain
 * `string` is NOT assignable WHERE a `NonEmptyString` is required — the value MUST
 * be constructed through {@link nonEmptyString} (which trims + rejects empties).
 * Conversely a `NonEmptyString` IS a `string` (the brand only ADDS to the type), so
 * every READ site stays transparent: `character.name` still slots into
 * `t(..., { name })`, `name.toLowerCase()`, `<input value={name}>`, JSX, etc. with
 * no cast. Only CONSTRUCTION sites change — exactly the seam where an empty name
 * could otherwise sneak in.
 *
 * Pure + dependency-free, so the codec, the cache, the engine, and CI unit tests
 * can all validate through the one constructor.
 */

declare const NON_EMPTY_BRAND: unique symbol;

/**
 * A `string` proven non-empty (after trimming) at construction. Assignable TO
 * `string` everywhere (reads are transparent); a bare `string` is NOT assignable to
 * it, so the only way to obtain one is {@link nonEmptyString}.
 */
export type NonEmptyString = string & { readonly [NON_EMPTY_BRAND]: true };

/**
 * The smart constructor — the SOLE way to mint a {@link NonEmptyString}. Returns the
 * TRIMMED value branded when `raw` is a string with at least one non-whitespace
 * character; returns `null` for anything else (a non-string, `""`, or a
 * whitespace-only `"   "`). Trimming is part of the contract: a name can never be
 * stored as `" Lyra "` nor as all-spaces.
 *
 * Use at every trust boundary that produces a name: the codec parse, the cache
 * stamp, the campaign-snapshot read, the inline-edit commit. A `null` result is the
 * caller's signal to REJECT (skip the member, surface a validation error) — never to
 * substitute a placeholder.
 */
export function nonEmptyString(raw: unknown): NonEmptyString | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? (trimmed as NonEmptyString) : null;
}

/**
 * Construct a {@link NonEmptyString} or THROW. For the few sites that hold a
 * compile-time guarantee the value is non-empty (a literal default like the mock's
 * name, a value already gated by the wizard) and want the brand without a `null`
 * branch. Throwing here is a programmer-error signal, never a user-facing path.
 */
export function assertNonEmptyString(raw: unknown, context = "value"): NonEmptyString {
  const v = nonEmptyString(raw);
  if (v === null) {
    throw new Error(`Expected a non-empty ${context}, got: ${JSON.stringify(raw)}`);
  }
  return v;
}
