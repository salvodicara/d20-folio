/**
 * Fast-lane meta-guard (R5 — docs/ARCHITECTURE.md).
 *
 * Pins the invariant that keeps the test architecture honest:
 *
 *  1. **The fast lane stays jsdom-free.** Every file the fast Vitest project runs
 *     (`tests/unit|src/**\/*.test.ts` minus the DOM-bound `.test.ts` listed in
 *     `tests/lanes.ts`) must NOT import React / react-dom / @testing-library /
 *     jsdom — directly or via a sibling test helper. A DOM-bound `.test.ts` that
 *     forgets to register itself in `JSDOM_TS_TESTS` (so it leaks into the fast
 *     lane) fails HERE, loudly, instead of silently dragging jsdom into the lane
 *     whose whole point is sub-second-per-file feedback.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { JSDOM_TS_TESTS, PACK_JSDOM_TS_TESTS } from "../lanes";

const REPO_ROOT = resolve(__dirname, "../..");

// ── Lock 1: the fast lane imports no jsdom/React ─────────────────────────────

/** Imports that prove a test needs a DOM (and therefore the slow lane). */
const DOM_IMPORT_PATTERNS: RegExp[] = [
  /from\s+["']react["']/,
  /from\s+["']react-dom(?:\/[^"']*)?["']/,
  /from\s+["']@testing-library\/[^"']+["']/,
  /from\s+["']jsdom["']/,
  /import\s+["']jsdom["']/,
  /from\s+["']@?vitest\/browser/,
];

function listTestTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTestTs(full));
    } else if (/\.test\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const JSDOM_TS = new Set(
  [...JSDOM_TS_TESTS, ...PACK_JSDOM_TS_TESTS].map((p) => join(REPO_ROOT, p))
);

/** The pack suites live only in pack mode, but the LANE discipline is static. */
const PACK_TESTS_DIR = join(REPO_ROOT, "content-pack/tests/unit");

/** The files the fast project actually runs: `.test.ts` minus the DOM-bound set. */
const fastFiles = [
  ...listTestTs(join(REPO_ROOT, "tests/unit")),
  ...listTestTs(join(REPO_ROOT, "src")),
  ...(existsSync(PACK_TESTS_DIR) ? listTestTs(PACK_TESTS_DIR) : []),
].filter((f) => !JSDOM_TS.has(f));

function findDomImports(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => DOM_IMPORT_PATTERNS.some((p) => p.test(line)))
    .map((line) => line.trim());
}

function findFastLaneDomImports(): Array<{ file: string; imports: string[] }> {
  return fastFiles
    .map((file) => ({
      file: file.replace(`${REPO_ROOT}/`, ""),
      imports: findDomImports(readFileSync(file, "utf8")),
    }))
    .filter(({ imports }) => imports.length > 0)
    .sort((left, right) => left.file.localeCompare(right.file));
}

function formatFastLaneOffenders(
  offenders: Array<{ file: string; imports: string[] }>
): string {
  return (
    "Fast-lane files must not import DOM/React modules:\n" +
    offenders
      .map(
        ({ file, imports }) =>
          `${file}:\n${imports.map((item) => `  ${item}`).join("\n")}`
      )
      .join("\n") +
    "\n\nFix: add the file to JSDOM_TS_TESTS in tests/lanes.ts so it runs in the SLOW (jsdom) lane, or remove the DOM dependency."
  );
}

describe("fast lane — jsdom/React-free", () => {
  it("detects default and side-effect DOM imports", () => {
    const defaultImport = ["import React from ", '"react";'].join("");
    const sideEffectImport = ["import ", '"jsdom";'].join("");
    expect(findDomImports(`${defaultImport}\n${sideEffectImport}`)).toEqual([
      defaultImport,
      sideEffectImport,
    ]);
  });

  it("scans every fast-lane file and reports all DOM/React offenders together", () => {
    expect(fastFiles.length).toBeGreaterThan(100);
    const offenders = findFastLaneDomImports();
    expect(offenders, formatFastLaneOffenders(offenders)).toEqual([]);
  });

  it("every JSDOM_TS_TESTS entry exists and is a .test.ts", () => {
    for (const rel of JSDOM_TS_TESTS) {
      expect(rel.endsWith(".test.ts")).toBe(true);
      expect(() => statSync(join(REPO_ROOT, rel))).not.toThrow();
    }
  });
});
