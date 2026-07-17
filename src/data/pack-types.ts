/**
 * Content-pack contract types — the shapes BOTH `@pack` resolutions export.
 *
 * The `@pack` alias resolves to `content-pack/index.ts` (the private content
 * pack) when it is present and enabled, else to `src/data/pack-empty.ts` (the
 * typed-empty stub the public SRD-only build uses). Every merge point in the
 * public data/i18n layer types its `@pack` imports against these shapes, so the
 * two resolutions can never drift structurally: each mode's typecheck
 * (`pnpm typecheck` / `pnpm typecheck:srd-only`) checks the module it composes.
 *
 * See docs/ARCHITECTURE.md → "The content-pack seam".
 */
import type { SrdCatalogue, SrdKind } from "@/i18n/srd-en";
import type { Locale } from "@/lib/locale";

/**
 * Per-kind, id-keyed SRD catalogue additions or patches for one locale — the
 * same `{ <id>: { <field>: leaf } }` shape as the `src/i18n/<locale>/srd/*.json`
 * shards.
 */
export type SrdCataloguePatch = Partial<Record<SrdKind, SrdCatalogue>>;

/**
 * Field-level i18n patches over PUBLIC entries, per locale. The pack uses these
 * to restore the PHB display names (the creator-attributed spell names over
 * the SRD 5.2.1 print names) and the full original prose the public catalogues
 * carry in SRD-safe form. A patch may only touch an EXISTING public entry —
 * patching a missing entry throws at merge time (drift is a bug, never silent).
 */
export type PackSrdOverlay = Partial<Record<Locale, SrdCataloguePatch>>;

/**
 * UI-chrome (`common` namespace) label patches, per locale, keyed
 * `<group> → <key> → label` — the same nested shape as the `ui/<group>.json`
 * shards. Used for the handful of engine-vocabulary labels whose composed
 * wording is pack-owned (e.g. the "heritage" feat-category label).
 */
export type PackUiOverlay = Partial<
  Record<Locale, Record<string, Record<string, string>>>
>;

/** Raw-JSON fixture loaders keyed by fixture name (the pack fixture file names). */
export type PackFixtureLoaders = Readonly<Record<string, () => Promise<string>>>;

/** Lazy per-locale loader for the pack's non-EN SRD catalogue shards. */
export type PackSrdLoader = (locale: Locale) => Promise<SrdCataloguePatch>;
