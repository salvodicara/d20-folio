/**
 * Guard: the Illuminated-Folio card-migration + token-contract invariants.
 *
 * After every card-bearing page (Spells, Combat, Equipment, Features) migrated
 * onto the single folio `UniversalCard`, this static source scan keeps the
 * residual from creeping back:
 *
 *  (a) NO rectangular pill — `rounded-full` may only sit on a genuinely circular
 *      element (spinner / dot / square icon-button / step badge), never on a
 *      text chip. The lapidary radius rule: chips are 4px facets (`rounded-sm`),
 *      the ONLY true pill is the §21 switch track. A chip betrays itself by
 *      carrying horizontal text padding (`px-…`) on the same className, so a
 *      `rounded-full` + `px-` co-occurrence is the violation signal.
 *
 *  (b) NO arbitrary-hex colour utility (`bg-[#…]` / `text-[#…]` / `border-[#…]`)
 *      — raw hex is a fixed dark-tuned value, not theme-aware, and collapses on
 *      the light vellum (the exact leak that let the pre-folio TrackerPips
 *      pending-spend #d4a72c survive the Features-page migration). The NAMED
 *      raw-palette twin of this check lives ONCE, in
 *      tests/unit/no-raw-palette-utilities.test.ts (golden rule 14 — the
 *      duplicate copy that lived here, with its own drifting allowlist, was
 *      retired 2026-08-05).
 *
 *  (c) NO production UI module imports the legacy card stack — `BaseCard`,
 *      `ActionCard`, or `SummaryChips` (all deleted; importing them would fail
 *      the typecheck — this keeps the NAMES from being re-introduced).
 *
 * Blind spot: a violation composed at runtime (className built from variables)
 * is invisible to this static line scan.
 */
import { describe, it, expect } from "vitest";
import { resolve, relative } from "node:path";
import { SRC_ROOT as SRC, srcFiles, readSrc } from "@tests/unit/__helpers__/src-files";

const root = resolve(SRC, "..");
// `features/**` is scanned too — the re-homed character molecules + the cockpit
// live there now, so the card-migration invariants must follow them.
const SCAN_DIRS = [
  resolve(SRC, "app"),
  resolve(SRC, "components"),
  resolve(SRC, "features"),
];

const ALL_FILES = SCAN_DIRS.flatMap((d) => srcFiles({ under: d, exts: [".ts", ".tsx"] }))
  .map((f) => ({ rel: relative(root, f), src: readSrc(f) }))
  // Skip this guard file itself (its prose names the patterns it forbids).
  .filter(({ rel }) => !rel.endsWith("folio-card-migration.guard.test.ts"));

describe("folio card-migration guards", () => {
  // Anti-vacuity: the derived scan set must never silently empty out.
  it("derives a non-empty scan set", () => {
    expect(ALL_FILES.length).toBeGreaterThan(50);
  });

  // ── (a) no rectangular pills ──────────────────────────────────────────────
  it("(a) rounded-full is never used on a text chip (rounded-full + px-)", () => {
    const RECT_PILL = /rounded-full[^"'`]*\bpx-[0-9]/;
    const violations: Record<string, string[]> = {};
    for (const { rel, src } of ALL_FILES) {
      const hits = src
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => RECT_PILL.test(line))
        .map(({ n }) => `L${n}`);
      if (hits.length > 0) violations[rel] = hits;
    }
    expect(violations).toEqual({});
  });

  // ── (b) no arbitrary-hex colour utility ────────────────────────────────────
  it("(b) uses theme tokens, not arbitrary-hex colour utilities (bg-[#…] / text-[#…])", () => {
    const RAW_HEX = new RegExp(
      `\\b(?:text|bg|border|ring|from|to|via|fill|stroke|shadow|decoration|outline|divide|placeholder|caret)-\\[#[0-9a-fA-F]{3,8}\\b`,
      "g"
    );
    const violations: Record<string, string[]> = {};
    for (const { rel, src } of ALL_FILES) {
      const hits = [...src.matchAll(RAW_HEX)].map((m) => m[0]);
      if (hits.length > 0) violations[rel] = [...new Set(hits)];
    }
    expect(violations).toEqual({});
  });

  // ── (c) no production UI module reaches the legacy card stack ───────────────
  it("(c) no production UI module imports BaseCard/ActionCard/SummaryChips", () => {
    const IMPORTS = [
      /import[^;]*\bBaseCard\b[^;]*from/,
      /import[^;]*\bActionCard\b[^;]*from/,
      /import[^;]*\bSummaryChips\b[^;]*from/,
    ];
    const violations: Record<string, string[]> = {};
    for (const { rel, src } of ALL_FILES) {
      const hits = IMPORTS.filter((re) => re.test(src)).map((re) => re.source);
      if (hits.length > 0) violations[rel] = hits;
    }
    expect(violations).toEqual({});
  });
});
