/**
 * alias-loader — a tiny Node module-resolution hook that maps the Vite `@/` alias
 * to the repo's `src/` directory, so an admin SCRIPT run with plain `node` can
 * import the app's engine modules (the unified codec, the SRD) the SAME way the app
 * does — without duplicating their logic in the script (golden rule 17: one source
 * of truth, no replicated codec).
 *
 * Node 24 already strips TypeScript types from `.ts` files natively; this hook only
 * adds the `@/…` → `<repo>/src/…` rewrite Node doesn't know about, and appends a
 * `.ts` extension to an extension-less alias import. Used by
 * `scripts/migrate-unified-codec.ts` via:
 *
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-unified-codec.ts
 */
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolvePath(HERE, "..", "src");

register(
  // Inline the resolve hook as a data: URL so this single file both registers AND
  // defines the hook (no second file to ship).
  "data:text/javascript," +
    encodeURIComponent(`
      import { existsSync } from "node:fs";
      import { fileURLToPath, pathToFileURL } from "node:url";
      import { dirname, resolve as resolvePath } from "node:path";
      const SRC = ${JSON.stringify(SRC)};
      // Append a .ts/.tsx/index.ts extension to an extension-less file path.
      function withExt(abs) {
        if (/\\.[a-z0-9]+$/i.test(abs)) return abs;
        if (existsSync(abs + ".ts")) return abs + ".ts";
        if (existsSync(abs + ".tsx")) return abs + ".tsx";
        if (existsSync(abs + "/index.ts")) return abs + "/index.ts";
        if (existsSync(abs + "/index.tsx")) return abs + "/index.tsx";
        return abs;
      }
      export async function resolve(specifier, context, next) {
        // (1) the Vite "@/" alias → <repo>/src/…
        if (specifier.startsWith("@/")) {
          const abs = withExt(SRC + "/" + specifier.slice(2));
          return next(pathToFileURL(abs).href, context);
        }
        // (2) an extension-less RELATIVE import from a TS module (the engine's own
        //     "./foo" imports) — node ESM won't auto-add .ts, so resolve it here.
        if (
          (specifier.startsWith("./") || specifier.startsWith("../")) &&
          context.parentURL &&
          context.parentURL.startsWith("file://") &&
          !/\\.[a-z0-9]+$/i.test(specifier)
        ) {
          const parentDir = dirname(fileURLToPath(context.parentURL));
          const abs = withExt(resolvePath(parentDir, specifier));
          if (existsSync(abs)) return next(pathToFileURL(abs).href, context);
        }
        return next(specifier, context);
      }
      // Vite imports *.json with no import attribute; Node ESM requires
      // \`with { type: "json" }\`. Inject it on resolve so the engine's id-keyed
      // SRD JSON catalogues load under plain node.
      export async function load(url, context, next) {
        if (url.endsWith(".json")) {
          return next(url, { ...context, importAttributes: { type: "json" } });
        }
        return next(url, context);
      }
    `),
  pathToFileURL("./")
);

// Touch the imports so linters don't flag them as unused (they document intent).
void existsSync;
void pathToFileURL;
