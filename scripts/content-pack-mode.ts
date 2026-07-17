/**
 * Content-pack build-mode switch — the ONE place that decides whether the
 * `@pack` alias resolves to the private content pack (`content-pack/index.ts`)
 * or to the typed-empty stub (`src/data/pack-empty.ts`).
 *
 * The rule is presence + opt-out: the pack is enabled iff `content-pack/index.ts`
 * exists AND `VITE_CONTENT_PACK` is not `"0"`. The public repo snapshot simply
 * has no `content-pack/` directory, so it builds SRD-only with zero config;
 * this repo forces the SRD-only lane with `VITE_CONTENT_PACK=0`
 * (`pnpm test:srd-only` / `pnpm build:srd-only`). Consumed by `vite.config.ts`,
 * `vitest.config.ts`, and the i18n leak-lock (`scripts/i18n/catalogue-io.ts`).
 */
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Absolute path of the content pack's entry module (may not exist). */
export const CONTENT_PACK_ENTRY = path.join(ROOT, "content-pack", "index.ts");

/** Absolute path of the typed-empty stub the SRD-only build uses. */
export const PACK_EMPTY_ENTRY = path.join(ROOT, "src", "data", "pack-empty.ts");

/** True when this build/test run composes the private content pack in. */
export function contentPackEnabled(): boolean {
  if (process.env.VITE_CONTENT_PACK === "0") return false;
  return existsSync(CONTENT_PACK_ENTRY);
}

/** The module the `@pack` alias resolves to for this run. */
export function packAliasTarget(): string {
  return contentPackEnabled() ? CONTENT_PACK_ENTRY : PACK_EMPTY_ENTRY;
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
