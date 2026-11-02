/**
 * Content-pack build-mode switch — the ONE place that decides whether the
 * `@pack` alias resolves to the private content pack (`content-pack/index.ts`),
 * to the typed-empty stub (`src/data/pack-empty.ts`), or to the runtime pack
 * (`src/data/pack-runtime.ts`).
 *
 * `VITE_CONTENT_PACK=runtime` is the production build: it bundles no private
 * content, and allowlisted accounts download the pack after sign-in (the JSON
 * that `scripts/pack/emit-pack.ts` writes, version `VITE_PACK_VERSION`).
 *
 * The rule is presence + opt-out: the pack is enabled iff `content-pack/index.ts`
 * exists AND `VITE_CONTENT_PACK` is not `"0"`. The public repo snapshot simply
 * has no `content-pack/` directory, so it builds SRD-only with zero config;
 * this repo forces the SRD-only lane with `VITE_CONTENT_PACK=0`
 * (`pnpm test:srd-only` / `pnpm build:srd-only`). Consumed by `vite.config.ts`,
 * `vitest.config.ts`, and the i18n leak-lock (`scripts/i18n/catalogue-io.ts`).
 *
 * Heavy catalogue art/data owns narrow sub-entries (`@pack/monsters`,
 * `@pack/monster-art`, `@pack/item-art`) so it never rides the eager `@pack`
 * barrel merely because the app composes the private corpus.
 */
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Absolute path of the content pack's entry module (may not exist). */
export const CONTENT_PACK_ENTRY = path.join(ROOT, "content-pack", "index.ts");

/** Absolute path of the typed-empty stub the SRD-only build uses. */
export const PACK_EMPTY_ENTRY = path.join(ROOT, "src", "data", "pack-empty.ts");

/**
 * Absolute path of the pack's LAZY English prose sub-entry (may not exist): the
 * `description` text of the pack's catalogue, kept off the eager `@pack` barrel.
 */
export const CONTENT_PACK_EN_PROSE_ENTRY = path.join(
  ROOT,
  "content-pack",
  "i18n",
  "en-prose.ts"
);

/** Absolute path of the pack's LAZY monster sub-entry (may not exist). */
export const CONTENT_PACK_MONSTERS_ENTRY = path.join(
  ROOT,
  "content-pack",
  "data",
  "monsters",
  "index.ts"
);

/** Absolute path of the pack's lazy canonical-monster-art module (may not exist). */
export const CONTENT_PACK_MONSTER_ART_ENTRY = path.join(
  ROOT,
  "content-pack",
  "data",
  "monster-art.ts"
);

/** Absolute path of the pack's optional canonical-item-art module (may not exist). */
export const CONTENT_PACK_ITEM_ART_ENTRY = path.join(
  ROOT,
  "content-pack",
  "data",
  "item-art.ts"
);

/** The runtime pack: served from downloaded JSON (`VITE_CONTENT_PACK=runtime`). */
export const PACK_RUNTIME_ENTRY = path.join(ROOT, "src", "data", "pack-runtime.ts");

/** The runtime pack's lazy English prose (`@pack/i18n-en-prose` in runtime mode). */
export const PACK_RUNTIME_PROSE_ENTRY = path.join(
  ROOT,
  "src",
  "data",
  "pack-runtime-prose.ts"
);

/** True when this build bundles no pack and downloads it at runtime instead. */
export function packRuntimeMode(): boolean {
  return process.env.VITE_CONTENT_PACK === "runtime";
}

/** True when this build/test run composes the private content pack in. */
export function contentPackEnabled(): boolean {
  if (process.env.VITE_CONTENT_PACK === "0" || packRuntimeMode()) return false;
  return existsSync(CONTENT_PACK_ENTRY);
}

/**
 * The `@pack` alias map for this run: Vite, both Vitest configs and the Node
 * script loader (`scripts/alias-hooks.mjs`) all use THIS map, so they cannot drift.
 *
 * Sub-entries come first: string aliases match by prefix, so `@pack` would
 * swallow them otherwise. `@pack/monsters` keeps the bestiary corpus off the
 * eager-reachable `@pack` barrel (the always-eager Grant engine reads
 * `packFeats`/`packSpells`/… through it, and Rolldown puts whatever that barrel
 * re-exports in the eager chunk), so the corpus is reachable ONLY from the lazy
 * `src/data/monsters/index.ts` (docs/ARCHITECTURE.md → "The content-pack seam").
 * `@pack/i18n-en-prose` is the pack's lazy English prose (the catalogue
 * `description` text); a pack from before the facts/prose split has no such
 * file, and its descriptions stay in the eager `packSrdEn`.
 *
 * SRD-only resolves every entry to the SAME typed-empty stub (it exports
 * `packMonsters: []` etc. too): one stub, no second empty file to keep in step.
 */
export function packAliases(): Record<string, string> {
  const runtime = packRuntimeMode();
  const pack = contentPackEnabled();
  const entry = (packEntry: string): string =>
    runtime ? PACK_RUNTIME_ENTRY : pack ? packEntry : PACK_EMPTY_ENTRY;
  return {
    "@pack/item-art": entry(CONTENT_PACK_ITEM_ART_ENTRY),
    "@pack/monster-art": entry(CONTENT_PACK_MONSTER_ART_ENTRY),
    "@pack/monsters": entry(CONTENT_PACK_MONSTERS_ENTRY),
    "@pack/i18n-en-prose": runtime
      ? PACK_RUNTIME_PROSE_ENTRY
      : pack && existsSync(CONTENT_PACK_EN_PROSE_ENTRY)
        ? CONTENT_PACK_EN_PROSE_ENTRY
        : PACK_EMPTY_ENTRY,
    "@pack": entry(CONTENT_PACK_ENTRY),
  };
}

/**
 * Vite `server.fs.allow` roots for this run. `content-pack/` is a symlink into
 * the private content repo, and the dev server serves modules by REAL path —
 * without the pack's real directory on the allow list it 404s every pack
 * module (`/@fs/…` outside the repo root). Consumed by `vite.config.ts`; the
 * vitest lanes instead resolve with `preserveSymlinks` (vitest.config.ts).
 */
export function fsAllowRoots(): string[] {
  return contentPackEnabled()
    ? [ROOT, realpathSync(path.dirname(CONTENT_PACK_ENTRY))]
    : [ROOT];
}
