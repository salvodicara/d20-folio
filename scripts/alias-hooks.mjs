/**
 * alias-hooks — the Node module-customization hooks `scripts/alias-loader.mjs`
 * registers. Two jobs, both about making the APP's own modules loadable by a plain
 * `node` admin script so a script never has to replicate engine logic (golden rule 17):
 *
 *  1. `resolve` — the Vite `@/` and `@pack` aliases, plus extension-less relative
 *     imports (Node ESM will not append `.ts` on its own).
 *  2. `load` — JSON import attributes, and the `import.meta.glob(...)` expansion.
 *
 * WHY THE GLOB EXPANSION EXISTS. `import.meta.glob` is a Vite compile-time feature;
 * under plain `node` it is simply not a function, and `src/i18n/loaders.ts` calls it
 * at module init. That single line used to make the whole composed SRD graph — and
 * therefore the app's play codec — unloadable outside a bundler, which forced any
 * script that needs the codec into an SRD-only composition. A migration that decides
 * live characters carrying private-pack content may not run SRD-only, so the hook
 * rewrites each `import.meta.glob(...)` call into the equivalent object literal at
 * load time. Only sources that actually contain the token are transformed, and only
 * where it is real CODE — an occurrence inside a `//` or block comment (this file's own
 * documentation, for one) is masked out before the scan and left verbatim.
 *
 * Supported option shapes are exactly the ones this repository uses (every other
 * combination throws a named error rather than silently producing a wrong module):
 *
 *   glob(pattern)                                   → { path: () => import(path) }
 *   glob(pattern, { query: "?raw", import: "default" })
 *                                                   → { path: () => Promise<string> }
 *   glob(pattern, { eager: true, query: "?url", import: "default" })
 *                                                   → { path: "<file:// href>" }
 *
 * `pattern` is a string or an array of strings; a `!`-prefixed entry is a negation.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, relative, resolve as resolvePath } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolvePath(HERE, "..", "src");
const PACK_ROOT = resolvePath(SRC, "..", "content-pack");
/** The documented content-pack opt-out (`scripts/content-pack-mode.ts` — "the ONE
 *  place that decides"): presence + `VITE_CONTENT_PACK !== "0"`. */
const PACK_DISABLED = process.env.VITE_CONTENT_PACK === "0";

/** Append a `.ts`/`.tsx`/`index.ts` extension to an extension-less file path. */
function withExt(abs) {
  if (/\.[a-z0-9]+$/i.test(abs)) return abs;
  if (existsSync(`${abs}.ts`)) return `${abs}.ts`;
  if (existsSync(`${abs}.tsx`)) return `${abs}.tsx`;
  if (existsSync(`${abs}/index.ts`)) return `${abs}/index.ts`;
  if (existsSync(`${abs}/index.tsx`)) return `${abs}/index.tsx`;
  return abs;
}

export async function resolve(specifier, context, next) {
  // (0) the Vite "@pack" alias: the sibling pack when present, else the SRD-only stub.
  if (specifier === "@pack" || specifier.startsWith("@pack/")) {
    const sub = specifier === "@pack" ? "" : specifier.slice("@pack".length);
    const packTarget = withExt(PACK_ROOT + (sub === "" ? "/index" : sub));
    if (!PACK_DISABLED && existsSync(packTarget)) {
      return next(pathToFileURL(packTarget).href, context);
    }
    return next(pathToFileURL(withExt(`${SRC}/data/pack-empty`)).href, context);
  }
  // (1) the Vite "@/" alias → <repo>/src/…
  if (specifier.startsWith("@/")) {
    return next(pathToFileURL(withExt(`${SRC}/${specifier.slice(2)}`)).href, context);
  }
  // (2) an extension-less RELATIVE import from a TS module (the engine's own "./foo"
  //     imports) — node ESM won't auto-add .ts, so resolve it here.
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file://") &&
    !/\.[a-z0-9]+$/i.test(specifier)
  ) {
    const abs = withExt(
      resolvePath(dirname(fileURLToPath(context.parentURL)), specifier)
    );
    if (existsSync(abs)) return next(pathToFileURL(abs).href, context);
  }
  return next(specifier, context);
}

// ── import.meta.glob expansion ──────────────────────────────────────────────

/** One glob segment pattern → a regular-expression source (`/` is never matched by
 *  `*`; `**` spans directories). */
function globToRegExp(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        if (pattern[index + 2] === "/") {
          source += "(?:[^/]+/)*";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }
    source += /[a-z0-9/_-]/i.test(char) ? char : `\\${char}`;
  }
  return new RegExp(`^${source}$`);
}

/** Every file under `root`, as paths relative to it, with `/` separators. */
function walk(root) {
  const found = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) found.push(full);
    }
  };
  if (existsSync(root) && statSync(root).isDirectory()) visit(root);
  return found;
}

/** The longest literal directory prefix of a glob pattern — the only subtree that
 *  can match, so an unbounded repository walk never happens. */
function staticPrefix(pattern) {
  const wildcard = pattern.search(/[*?[]/);
  const head = wildcard === -1 ? pattern : pattern.slice(0, wildcard);
  const cut = head.lastIndexOf("/");
  return cut === -1 ? "" : head.slice(0, cut);
}

/** Vite keys a glob result by the matched path RELATIVE to the importing module,
 *  always with an explicit `./` or `../` prefix. */
function globKey(baseDirectory, absolute) {
  const rel = relative(baseDirectory, absolute).split("\\").join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function matchGlob(baseDirectory, patterns) {
  const positives = patterns.filter((pattern) => !pattern.startsWith("!"));
  const negatives = patterns
    .filter((pattern) => pattern.startsWith("!"))
    .map((pattern) => globToRegExp(pattern.slice(1)));
  const keys = new Set();
  for (const pattern of positives) {
    const test = globToRegExp(pattern);
    const root = resolvePath(baseDirectory, staticPrefix(pattern));
    for (const absolute of walk(root)) {
      const key = globKey(baseDirectory, absolute);
      if (!test.test(key)) continue;
      if (negatives.some((negative) => negative.test(key))) continue;
      keys.add(key);
    }
  }
  return [...keys].sort();
}

function entryFor(key, absolute, options) {
  const literal = JSON.stringify(key);
  const eager = options.eager === true;
  const query = options.query;
  if (!eager && query === undefined && options.import === undefined) {
    // The module NAMESPACE, matching Vite's default lazy glob (`{ default, … }`).
    return `${literal}: () => import(${literal}${
      key.endsWith(".json") ? `, { with: { type: "json" } }` : ""
    })`;
  }
  if (!eager && query === "?raw" && options.import === "default") {
    return `${literal}: () => import("node:fs/promises").then((fs) => fs.readFile(${JSON.stringify(
      absolute
    )}, "utf8"))`;
  }
  if (eager && query === "?url" && options.import === "default") {
    return `${literal}: ${JSON.stringify(pathToFileURL(absolute).href)}`;
  }
  throw new TypeError(
    `alias-hooks: unsupported import.meta.glob options ${JSON.stringify(options)}`
  );
}

/** Scan forward from `open` (the index of "(") to its matching ")", skipping over
 *  string literals so a bracket inside a pattern cannot end the argument list. */
function closingParen(source, open) {
  let depth = 0;
  let quote = "";
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "(" || char === "[" || char === "{") depth += 1;
    else if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new SyntaxError("alias-hooks: unterminated import.meta.glob call");
}

const GLOB_CALL = /import\.meta\.glob\s*(?:<[^(]*?>)?\s*\(/g;

/**
 * A copy of `source` with every `//` and block comment blanked to spaces (newlines
 * kept), so DETECTION never fires on the token inside a comment — a doc block that
 * merely NAMES `import.meta.glob(` would otherwise be rewritten into an object
 * literal, silently corrupting the module. Character offsets are preserved exactly,
 * so every index found in the mask addresses the same character of the original.
 * String literals are left intact: the scanner has to see their quotes to know it is
 * inside one, and a glob call's own arguments are string literals.
 */
function maskComments(source) {
  // `split("")` (never `[...source]`): UTF-16 units, so an index into the mask is the
  // same index into the original even with an astral character in a comment.
  const chars = source.split("");
  let index = 0;
  while (index < chars.length) {
    const char = chars[index];
    if (char === '"' || char === "'" || char === "`") {
      index += 1;
      while (index < chars.length && chars[index] !== char) {
        index += chars[index] === "\\" ? 2 : 1;
      }
      index += 1;
      continue;
    }
    if (char === "/" && chars[index + 1] === "/") {
      while (index < chars.length && chars[index] !== "\n") {
        chars[index] = " ";
        index += 1;
      }
      continue;
    }
    if (char === "/" && chars[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? chars.length : end + 2;
      for (; index < stop; index += 1) {
        if (chars[index] !== "\n") chars[index] = " ";
      }
      continue;
    }
    index += 1;
  }
  return chars.join("");
}

/**
 * Rewrite every `import.meta.glob(...)` call in `source` into an object literal.
 * The argument text is a literal expression in this repository's own sources, so it
 * is evaluated with `Function` — the hook only ever sees files this repo ships.
 */
export function expandImportMetaGlob(source, url) {
  if (!source.includes("import.meta.glob")) return source;
  // Detection and every position below are taken from the COMMENT-MASKED copy (same
  // length, same offsets), while the text that is evaluated and emitted comes from the
  // original — so a comment mentioning the token is left exactly as written.
  const masked = maskComments(source);
  if (!masked.includes("import.meta.glob")) return source;
  const baseDirectory = dirname(fileURLToPath(url));
  let output = "";
  let cursor = 0;
  GLOB_CALL.lastIndex = 0;
  let match;
  while ((match = GLOB_CALL.exec(masked)) !== null) {
    const open = match.index + match[0].length - 1;
    const close = closingParen(masked, open);
    const argumentText = source.slice(open + 1, close);
    // The argument list is a literal expression in this repository's own sources, and
    // the hook only ever sees files this repo ships — never third-party or user input.
    const args = new Function(`return [${argumentText}]`)();
    const patterns = Array.isArray(args[0]) ? args[0] : [args[0]];
    const options = args[1] ?? {};
    const entries = matchGlob(baseDirectory, patterns).map((key) =>
      entryFor(key, resolvePath(baseDirectory, key), options)
    );
    output += source.slice(cursor, match.index) + `{${entries.join(", ")}}`;
    cursor = close + 1;
    GLOB_CALL.lastIndex = cursor;
  }
  return output + source.slice(cursor);
}

export async function load(url, context, next) {
  // Vite imports *.json with no import attribute; Node ESM requires
  // `with { type: "json" }`. Inject it on resolve so the engine's id-keyed SRD JSON
  // catalogues load under plain node.
  if (url.endsWith(".json")) {
    return next(url, { ...context, importAttributes: { type: "json" } });
  }
  const result = await next(url, context);
  if (result.source === undefined || result.source === null) return result;
  const text =
    typeof result.source === "string"
      ? result.source
      : Buffer.from(result.source).toString("utf8");
  if (!text.includes("import.meta.glob")) return result;
  // The format is preserved (`module-typescript` for a `.ts` file), so Node still
  // strips the types from the rewritten source.
  return { ...result, source: expandImportMetaGlob(text, url) };
}
