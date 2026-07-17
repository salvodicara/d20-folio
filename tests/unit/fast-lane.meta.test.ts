/**
 * Fast-lane meta-guard (R5 — docs/ARCHITECTURE.md).
 *
 * Pins two invariants that keep the test architecture honest:
 *
 *  1. **The fast lane stays jsdom-free.** Every file the fast Vitest project runs
 *     (`tests/unit|src/**\/*.test.ts` minus the DOM-bound `.test.ts` listed in
 *     `tests/lanes.ts`) must NOT import React / react-dom / @testing-library /
 *     jsdom — directly or via a sibling test helper. A DOM-bound `.test.ts` that
 *     forgets to register itself in `JSDOM_TS_TESTS` (so it leaks into the fast
 *     lane) fails HERE, loudly, instead of silently dragging jsdom into the lane
 *     whose whole point is sub-second-per-file feedback.
 *
 *  2. **Each table-driven family has exactly one row per entity.** The five R5
 *     consolidated suites (`*.table.test.ts`) replaced 78 one-file-per-entity
 *     suites; this guard cross-checks the expected row count for each so a
 *     dropped (or duplicated) entity fails CI — coverage can never silently
 *     shrink. (Each suite ALSO self-checks via its own table-integrity test; this
 *     is the cross-family ledger.)
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

describe("fast lane — jsdom/React-free", () => {
  it("finds a non-trivial set of fast-lane files (the scan actually ran)", () => {
    expect(fastFiles.length).toBeGreaterThan(100);
  });

  it.each(fastFiles.map((f) => f.replace(REPO_ROOT + "/", "")))(
    "%s imports no React / jsdom / testing-library",
    (rel) => {
      const source = readFileSync(join(REPO_ROOT, rel), "utf8");
      const offenders = source
        .split("\n")
        .filter((line) => DOM_IMPORT_PATTERNS.some((p) => p.test(line)))
        .map((l) => l.trim());
      if (offenders.length > 0) {
        throw new Error(
          `${rel} is in the FAST lane but imports a DOM/React module:\n` +
            offenders.map((o) => `  ${o}`).join("\n") +
            `\n\nFix: add this file to JSDOM_TS_TESTS in tests/lanes.ts so it runs ` +
            `in the SLOW (jsdom) lane, or remove the DOM dependency.`
        );
      }
      expect(offenders).toEqual([]);
    }
  );

  it("every JSDOM_TS_TESTS entry exists and is a .test.ts", () => {
    for (const rel of JSDOM_TS_TESTS) {
      expect(rel.endsWith(".test.ts")).toBe(true);
      expect(() => statSync(join(REPO_ROOT, rel))).not.toThrow();
    }
  });
});

// ── Lock 2: each table-driven family has one row per entity ───────────────────

/** The R5 consolidated families and their expected entity-row counts. */
const TABLE_FAMILIES: { file: string; expectedRows: number }[] = [
  {
    file: "content-pack/tests/unit/aggregated-primitives.table.test.ts",
    expectedRows: 29,
  },
  { file: "content-pack/tests/unit/aggregated-grants.table.test.ts", expectedRows: 24 },
  { file: "content-pack/tests/unit/fix-2024-classes.table.test.ts", expectedRows: 11 },
  { file: "content-pack/tests/unit/wire-2024-classes.table.test.ts", expectedRows: 9 },
  { file: "content-pack/tests/unit/subclass-wiring.table.test.ts", expectedRows: 10 },
];

/** Count the top-level `name:` row keys inside the `ENTITIES` array literal. */
function countRows(source: string): number {
  const start = source.indexOf("const ENTITIES");
  expect(start).toBeGreaterThanOrEqual(0);
  const arrayBody = source.slice(start, source.indexOf("\n];", start));
  // Each row begins with `    name: "<entity>",` at 4-space object-property indent.
  return (arrayBody.match(/^ {4}name: "/gm) ?? []).length;
}

// Every family file lives pack-side, so the whole ledger only applies where the
// pack exists on disk — the SRD-only public tree has none of these files.
describe.runIf(existsSync(PACK_TESTS_DIR))(
  "table-driven families — one row per entity (cross-family ledger)",
  () => {
    it.each(TABLE_FAMILIES)(
      "$file declares exactly $expectedRows entity rows",
      ({ file, expectedRows }) => {
        const source = readFileSync(join(REPO_ROOT, file), "utf8");
        expect(countRows(source)).toBe(expectedRows);
      }
    );

    it("the five families collapse the former per-entity files into 5 suites (+5 PRIM rows)", () => {
      const totalRows = TABLE_FAMILIES.reduce((n, f) => n + f.expectedRows, 0);
      expect(TABLE_FAMILIES).toHaveLength(5);
      // 78 former per-entity files + 5 PRIM primitive rows (aura, spell-die-augment,
      // copy-to-2nd-target, resource-conversion, item-bound-bonus).
      expect(totalRows).toBe(83);
    });
  }
);
