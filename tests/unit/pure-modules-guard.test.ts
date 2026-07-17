/// <reference types="node" />
/**
 * Regression — keep "pure" lib modules free of Firebase imports.
 *
 * **The recurring bug:** in CI the env vars `VITE_FIREBASE_API_KEY` etc.
 * are absent, so any test that transitively imports `@/lib/firebase`
 * crashes at module load with `auth/invalid-api-key`. We hit this with
 * `sanitize-character.test.ts` (fixed by extracting the pure module) and
 * AGAIN with `firestore-strip-undefined.test.ts` (fixed the same way).
 *
 * **This guard** statically scans the source of each registered pure
 * module and asserts it does NOT import from `@/lib/firebase`,
 * `@/lib/firestore`, `@/lib/storage`, or `firebase/*`. If a future agent
 * sneaks a Firebase import into one of these files (directly or via a new
 * neighbour module that pulls one in), the build fails before CI does.
 *
 * **To add a new pure module:** append its path to `PURE_MODULES` below
 * AND its transitive-allowed deps. The walker chases imports across the
 * `src/lib` and `src/data` trees; anything outside those + node built-ins
 * is treated as opaque. If a module legitimately needs Firebase, it does
 * NOT belong on this list — move the pure parts out.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");
const SRC = join(REPO_ROOT, "src");

// ── Module-level caches (S2) ─────────────────────────────────────────────────
// The three describe blocks below re-read + re-regex the SAME engine-core files
// hundreds of times (once per PURE_MODULE and once per test-file import tree).
// These caches make each unique file's read + import-resolution + transitive walk
// happen EXACTLY ONCE per worker — identical assertions over cached intermediates.
const FILE_CACHE = new Map<string, string>();
/** Memoized `readFileSync` — every reader below shares one read per path. */
function read(file: string): string {
  let cached = FILE_CACHE.get(file);
  if (cached === undefined) {
    cached = readFileSync(file, "utf8");
    FILE_CACHE.set(file, cached);
  }
  return cached;
}

const RESOLVE_CACHE = new Map<string, string | null>();
const TREE_CACHE = new Map<string, Set<string>>();

/**
 * Modules guaranteed pure — testable in CI without Firebase env vars.
 * Add new entries here as new pure helpers ship.
 */
const PURE_MODULES = [
  "src/lib/strip-undefined.ts",
  "src/lib/sanitize-character.ts",
  "src/lib/cast-options.ts",
  "src/lib/feat-spell-choices.ts",
  "src/lib/feat-skill-tool-choices.ts",
  "src/lib/feat-tool-choices.ts",
  "src/lib/feat-skill-choices.ts",
  "src/lib/spell-mastery-pick.ts",
  "src/lib/signature-spells-pick.ts",
  "src/lib/maneuver-pick.ts",
  "src/lib/resolve-spell-ability.ts",
  "src/lib/expanded-spells.ts",
  // R2 — the presenter layer (lib/views). Pure: engine output + locale → view-model.
  "src/lib/views/sheet-view.ts",
  "src/lib/views/combat-action-view.ts",
  "src/lib/views/toast-intent.ts",
  "src/lib/views/level-up-view.ts",
  "src/lib/views/spells-view.ts",
  "src/lib/views/inventory-view.ts",
  "src/lib/views/creation-view.ts",
  "src/lib/views/tracker-view.ts",
  // SLICE 7 — the two presenters moved out of engine-core (consumed only by UI):
  // the SRD-name/weapon-property localizer family + the spell cast-option assembler.
  "src/lib/views/srd-i18n.ts",
  "src/lib/views/spell-cast-sources.ts",
  // The combat-log events-as-data localizer (line + glyph/hue per CombatEvent).
  "src/lib/views/combat-log-view.ts",
  // Bug-report client (OWN-37) — debug-context collection + the error-log ring
  // + the screen catalogue are unit-tested with VITE_FIREBASE_API_KEY unset, so
  // they must stay Firebase-free.
  "src/features/report/error-log.ts",
  "src/features/report/collect-debug-context.ts",
  "src/features/report/screens.ts",
] as const;

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["']@\/lib\/firebase["']/,
  /from\s+["']@\/lib\/firestore["']/,
  /from\s+["']@\/lib\/storage["']/,
  /from\s+["']firebase\//,
  /from\s+["']firebase["']/,
];

/**
 * Resolve a TS/TSX import target to an absolute path within /src.
 * Returns null when the target lives outside /src (node_modules, etc.).
 */
function resolveImport(fromFile: string, spec: string): string | null {
  const key = fromFile + "\0" + spec;
  const memo = RESOLVE_CACHE.get(key);
  if (memo !== undefined) return memo;

  let target: string;
  if (spec.startsWith("@/")) {
    target = join(SRC, spec.slice(2));
  } else if (spec.startsWith("./") || spec.startsWith("../")) {
    target = resolve(dirname(fromFile), spec);
  } else {
    RESOLVE_CACHE.set(key, null); // bare specifier — node_modules
    return null;
  }
  // Try `.ts`, `.tsx`, `/index.ts`, `/index.tsx` in that order
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = target + ext;
    if (existsSync(candidate)) {
      RESOLVE_CACHE.set(key, candidate);
      return candidate;
    }
  }
  RESOLVE_CACHE.set(key, null);
  return null;
}

/** A file's DIRECT in-`src` import targets (resolved + memoized per file). */
function directImports(file: string): string[] {
  const out: string[] = [];
  const importRegex = /from\s+["']([^"']+)["']/g;
  const source = read(file);
  let match;
  while ((match = importRegex.exec(source)) !== null) {
    const spec = match[1];
    if (!spec) continue;
    const resolved = resolveImport(file, spec);
    if (resolved) out.push(resolved);
  }
  return out;
}

/**
 * Walk the import tree from `entry`, returning every source file reached.
 * Stops at the SRC boundary; non-SRC specs are skipped. Memoized per entry.
 */
function collectTransitiveImports(entry: string): Set<string> {
  const memo = TREE_CACHE.get(entry);
  if (memo !== undefined) return memo;

  const visited = new Set<string>();
  const queue: string[] = [entry];
  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    for (const resolved of directImports(file)) {
      if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  TREE_CACHE.set(entry, visited);
  return visited;
}

describe("pure modules don't transitively import Firebase", () => {
  for (const rel of PURE_MODULES) {
    it(`${rel} has no Firebase imports in its transitive tree`, () => {
      const entry = join(REPO_ROOT, rel);
      expect(existsSync(entry)).toBe(true);
      const reached = collectTransitiveImports(entry);
      const offenders: { file: string; line: string }[] = [];
      for (const file of reached) {
        const source = read(file);
        for (const line of source.split("\n")) {
          for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
            if (pattern.test(line)) {
              offenders.push({
                file: file.replace(REPO_ROOT + "/", ""),
                line: line.trim(),
              });
            }
          }
        }
      }
      if (offenders.length > 0) {
        const msg = offenders.map((o) => `  ${o.file}: ${o.line}`).join("\n");
        throw new Error(
          `Pure module ${rel} transitively imports Firebase. Offenders:\n${msg}\n\n` +
            `Fix: extract the pure parts out, or break the import chain.`
        );
      }
      expect(offenders).toEqual([]);
    });
  }
});

/**
 * Second layer — test-side guard.
 *
 * The CI failure happened because a test file imported the helper from
 * `@/lib/firestore` (which pulls Firebase) instead of from the pure
 * module. This scans every `tests/unit/*.test.ts(x)` file's transitive
 * import tree for Firebase imports. In CI without VITE_FIREBASE_API_KEY,
 * the test file would crash at module load before any `it()` ran.
 *
 * **Auto-exemption:** a test that calls `vi.mock("@/lib/firebase")` or
 * `vi.mock("@/lib/firestore")` is exempt — those `vi.mock()` calls are
 * hoisted before any import runs, so Firebase is never actually loaded.
 * The guard reads each test's source for those mocks and waives the
 * check accordingly.
 *
 * If you add a test that wants Firebase behavior end-to-end, either
 * (a) `vi.mock("@/lib/firebase")` at the top (recommended), or
 * (b) keep using pure helpers (best — see src/lib/strip-undefined.ts).
 */
import { readdirSync, statSync } from "node:fs";

const TESTS_UNIT = join(REPO_ROOT, "tests/unit");

const VI_MOCK_FIREBASE_PATTERNS = [
  /vi\.mock\(\s*["']@\/lib\/firebase["']/,
  /vi\.mock\(\s*["']@\/lib\/firestore["']/,
  /vi\.mock\(\s*["']@\/lib\/storage["']/,
  /vi\.mock\(\s*["']firebase\//,
];

function mocksFirebase(source: string): boolean {
  return VI_MOCK_FIREBASE_PATTERNS.some((p) => p.test(source));
}

function listTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTestFiles(full));
    } else if (/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * R2 — the presenter layer (`src/lib/views/**`) is framework-free.
 *
 * `lib/views/` is the ONLY engine-side layer permitted to localize/format (it may
 * take a `locale` param + call `localizeSrd` + the unit formatters). But it must
 * stay PURE in the structural sense: no React, no Zustand stores, no Firebase, no
 * DOM. That keeps every presenter unit-testable with trivial fakes and keeps the
 * UI↔engine seam one-directional (views never reach UP into a store or component).
 * This scans each `lib/views/**` file's OWN imports (not transitive — a presenter
 * legitimately imports engine-core, which is itself Firebase-free by the guard
 * above) for those forbidden specifiers, resolving alias + relative spellings.
 */
const VIEWS_FORBIDDEN_PATTERNS: { label: string; test: (spec: string) => boolean }[] = [
  { label: "React", test: (s) => s === "react" || s.startsWith("react/") },
  { label: "react-i18next", test: (s) => s === "react-i18next" },
  { label: "react-dom", test: (s) => s === "react-dom" || s.startsWith("react-dom/") },
  { label: "react-router", test: (s) => s.startsWith("react-router") },
  { label: "a Zustand store", test: (s) => /(^|\/)stores\//.test(s) },
  { label: "Firebase", test: (s) => s.startsWith("firebase") },
  { label: "@/lib/firebase", test: (s) => s === "@/lib/firebase" },
  { label: "@/lib/firestore", test: (s) => s === "@/lib/firestore" },
  { label: "@/lib/storage", test: (s) => s === "@/lib/storage" },
];

function listViewsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listViewsFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("R2 — lib/views presenter layer is framework-free (no React/stores/Firebase/DOM)", () => {
  const VIEWS_DIR = join(SRC, "lib", "views");
  const viewFiles = listViewsFiles(VIEWS_DIR);

  it("has at least the seed presenters (sheet-view, combat-action-view)", () => {
    const names = viewFiles.map((f) => f.replace(VIEWS_DIR + "/", ""));
    expect(names).toContain("sheet-view.ts");
    expect(names).toContain("combat-action-view.ts");
  });

  for (const file of viewFiles) {
    const rel = file.replace(SRC + "/", "src/");
    it(`${rel} imports no React / store / Firebase`, () => {
      const source = read(file);
      const offenders: string[] = [];
      const re = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(source)) !== null) {
        const spec = m[1];
        if (!spec) continue;
        for (const pat of VIEWS_FORBIDDEN_PATTERNS) {
          if (pat.test(spec)) offenders.push(`${spec} (${pat.label})`);
        }
      }
      expect(
        offenders,
        `lib/views must be framework-free — no React, stores, or Firebase. Found: ` +
          `${offenders.join(", ")}. A presenter takes engine output + locale and returns ` +
          `a plain view-model; the UI wires it to React/stores. docs/ARCHITECTURE.md`
      ).toEqual([]);
    });
  }
});

describe("test files don't transitively import Firebase (CI-safety guard)", () => {
  const testFiles = listTestFiles(TESTS_UNIT);
  for (const testFile of testFiles) {
    const relPath = testFile.replace(REPO_ROOT + "/", "");
    it(`${relPath} has no Firebase imports (or mocks them via vi.mock)`, () => {
      const testSource = read(testFile);
      if (mocksFirebase(testSource)) return; // Explicitly mocked → safe in CI.
      const reached = collectTransitiveImports(testFile);
      const offenders: { file: string; line: string }[] = [];
      for (const file of reached) {
        const source = read(file);
        for (const line of source.split("\n")) {
          for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
            if (pattern.test(line)) {
              offenders.push({
                file: file.replace(REPO_ROOT + "/", ""),
                line: line.trim(),
              });
            }
          }
        }
      }
      if (offenders.length > 0) {
        const lines = offenders.map((o) => `  ${o.file}: ${o.line}`).join("\n");
        throw new Error(
          `Test ${relPath} transitively imports Firebase; this crashes CI with auth/invalid-api-key.\n` +
            `Offending imports:\n${lines}\n\n` +
            `Fix: import the pure helper instead (see src/lib/strip-undefined.ts as a template), ` +
            `or add vi.mock("@/lib/firebase") at the top of the test.`
        );
      }
      expect(offenders).toEqual([]);
    });
  }
});
