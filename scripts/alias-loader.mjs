/**
 * alias-loader — registers the Node module-resolution/load hooks that let an admin
 * SCRIPT run with plain `node` import the app's engine modules (the unified codec,
 * the SRD, the composed content pack) the SAME way the app does — without
 * duplicating their logic in the script (golden rule 17: one source of truth, no
 * replicated codec).
 *
 * Node 24 already strips TypeScript types from `.ts` files natively; the hooks in
 * `scripts/alias-hooks.mjs` add what Node does not know: the `@/` and `@pack`
 * aliases, extension-less relative imports, JSON import attributes, and the
 * `import.meta.glob(...)` expansion that makes the composed SRD/pack graph loadable
 * outside Vite. Used by every migration script via:
 *
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-character-parents.ts
 */
import { register } from "node:module";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

register(new URL("./alias-hooks.mjs", import.meta.url), pathToFileURL("./"));

// CYCLE WARM-UP. `content-pack/index.ts` re-exports `./overlay` (line ~43) AFTER
// `./i18n/loader`, and that loader imports back into `@/i18n/loaders` →
// `@/i18n/srd-en`, whose module body READS `srdOverlay` at init. Under Node's ESM
// cycle semantics the binding is still in its temporal dead zone at that moment, so
// any script that reaches the SRD graph through `@pack` dies with
// "Cannot access 'srdOverlay' before initialization". (A bundler is immune: Vite
// rewrites cyclic bindings into lazily-read getters.) Evaluating the overlay module
// FIRST initializes it before the cycle closes. Cheap — the module is a pair of typed
// data tables with no runtime imports — and skipped entirely when the pack is absent
// or opted out, so `--import ./scripts/alias-loader.mjs` stays the only thing a
// script needs.
const packOverlay = new URL("../content-pack/overlay.ts", import.meta.url);
if (process.env.VITE_CONTENT_PACK !== "0" && existsSync(packOverlay)) {
  await import(packOverlay.href);
}
