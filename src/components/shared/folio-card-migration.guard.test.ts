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
 *  (b) NO raw Tailwind palette colour utility (text-amber-400, bg-slate-200, …)
 *      on a player surface — those hues are dark-only and collapse below WCAG
 *      1.4.3 on the light vellum. The only colour source is the @theme bridge
 *      token utilities (text-warning/success/error/info/accent/…), theme-aware
 *      and AA in BOTH themes. (Mirrors the engine-branch palette guard so the UI
 *      branch fails fast on its own surfaces.)
 *
 *  (c) NO production UI module imports the legacy card stack — `BaseCard`,
 *      `ActionCard`, or `SummaryChips`. The four card pages use `UniversalCard` +
 *      the folio token contract (`folio-colors` helpers / `.sl-chip` / `.at-chip`
 *      / verdict chip).
 *
 *      `BaseCard` / `ActionCard` / `SummaryChips` / `ResourcesPanel` are DELETED,
 *      as are the legacy colour maps (`@/lib/action-type-colors` +
 *      `SPELL_LEVEL_COLORS`); importing them would now fail the typecheck. This
 *      guard keeps the card-component names from being re-introduced, which is
 *      what keeps the four pages reading as one product.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../.."); // src/components/shared → repo root
const SRC = resolve(root, "src");
// `features/**` is scanned too — the re-homed character molecules + the cockpit
// live there now, so the card-migration invariants must follow them.
const SCAN_DIRS = [
  resolve(SRC, "app"),
  resolve(SRC, "components"),
  resolve(SRC, "features"),
];

function collect(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
      continue;
    }
    if (full.endsWith(".tsx") || full.endsWith(".ts")) out.push(full);
  }
}

function scanFiles(): { rel: string; src: string }[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) collect(d, files);
  return files.map((f) => ({ rel: relative(root, f), src: readFileSync(f, "utf8") }));
}

// A className string literal (single- or double-quoted, or a template chunk).
// We test each className-ish string for the chip signal independently so a
// `rounded-full` in one cn() argument and `px-…` in another both count.
const ALL_FILES = scanFiles();

describe("folio card-migration guards", () => {
  // ── (a) no rectangular pills ──────────────────────────────────────────────
  it("(a) rounded-full is never used on a text chip (rounded-full + px-)", () => {
    const RECT_PILL = /rounded-full[^"'`]*\bpx-[0-9]/;
    const violations: Record<string, string[]> = {};
    for (const { rel, src } of ALL_FILES) {
      // Skip this guard file itself (it documents the patterns in prose).
      if (rel.endsWith("folio-card-migration.guard.test.ts")) continue;
      const hits = src
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => RECT_PILL.test(line))
        .map(({ n }) => `L${n}`);
      if (hits.length > 0) violations[rel] = hits;
    }
    expect(violations).toEqual({});
  });

  // ── (b) no raw Tailwind palette colour utilities ───────────────────────────
  it("(b) uses folio @theme token utilities, not raw palette hues", () => {
    const PALETTES =
      "amber|emerald|blue|slate|gray|grey|red|green|orange|yellow|purple|violet|indigo|sky|teal|cyan|lime|rose|pink|fuchsia|zinc|neutral|stone";
    const RAW_PALETTE = new RegExp(
      `\\b(?:text|bg|border|ring|from|to|via|fill|stroke|shadow|decoration|outline|divide|placeholder|caret|accent)-(?:${PALETTES})-(?:50|100|200|300|400|500|600|700|800|900|950)\\b`,
      "g"
    );
    // Internal admin console + decorative section-icon `color=` props are tracked
    // by the engine-branch guard; this UI guard mirrors its allow-list so the two
    // branches don't diverge. Keep SHRINKING — never grow to silence a leak.
    const ALLOWLIST = new Set<string>([
      "src/app/routes/admin.tsx",
      "src/components/sheet/LevelUpModal.tsx",
      "src/features/character/molecules/ActionLog.tsx", // re-homed in 3B
    ]);
    const violations: Record<string, string[]> = {};
    for (const { rel, src } of ALL_FILES) {
      if (ALLOWLIST.has(rel)) continue;
      // Skip this guard file itself (its prose names the patterns it forbids).
      if (rel.endsWith("folio-card-migration.guard.test.ts")) continue;
      // Skip DEV-ONLY scaffolding (leads with the `// DEV-ONLY (remove before release):`
      // marker). Such modules are dead-code-eliminated from the prod bundle and never a
      // PLAYER surface, so the player-surface theme contract doesn't apply — they read
      // intentionally as dev chrome (mono/amber/dashed). The marker is the greppable
      // removal handle, not a per-file allowlist entry that could rot.
      if (src.startsWith("// DEV-ONLY (remove before release):")) continue;
      const hits = [...src.matchAll(RAW_PALETTE)].map((m) => m[0]);
      if (hits.length > 0) violations[rel] = [...new Set(hits)];
    }
    expect(violations).toEqual({});
  });

  // ── (b2) no arbitrary-hex colour utility (bg-[#…] / text-[#…] / border-[#…]) ─
  // Sibling to (b): (b) catches NAMED Tailwind palettes; this catches the
  // arbitrary-value escape hatch `bg-[#d4a72c]` etc. Raw hex is a fixed dark-tuned
  // value — it is not theme-aware and collapses on the light vellum, the exact leak
  // that let the pre-folio TrackerPips pending-spend states (#d4a72c) survive the
  // Features-page migration. The only colour source on a player surface is the
  // @theme bridge tokens (text-warning/accent/…) or a folio `--token`.
  it("(b2) uses theme tokens, not arbitrary-hex colour utilities (bg-[#…] / text-[#…])", () => {
    const RAW_HEX = new RegExp(
      `\\b(?:text|bg|border|ring|from|to|via|fill|stroke|shadow|decoration|outline|divide|placeholder|caret)-\\[#[0-9a-fA-F]{3,8}\\b`,
      "g"
    );
    // Previously held the `@deprecated` legacy modules that survived only for the
    // engine-layer unit test. They have all been deleted, so the allow-list is
    // now empty — every remaining UI module must be raw-hex-clean. NEVER grow it.
    const violations: Record<string, string[]> = {};
    for (const { rel, src } of ALL_FILES) {
      if (rel.endsWith("folio-card-migration.guard.test.ts")) continue;
      const hits = [...src.matchAll(RAW_HEX)].map((m) => m[0]);
      if (hits.length > 0) violations[rel] = [...new Set(hits)];
    }
    expect(violations).toEqual({});
  });

  // ── (c) no production UI module reaches the legacy card stack ───────────────
  it("(c) no production UI module imports BaseCard/ActionCard/SummaryChips", () => {
    // The legacy card components have all been deleted; this guard keeps their
    // names from being re-introduced. Real import statements only (not prose
    // mentions in a JSDoc comment).
    const IMPORTS = [
      /import[^;]*\bBaseCard\b[^;]*from/,
      /import[^;]*\bActionCard\b[^;]*from/,
      /import[^;]*\bSummaryChips\b[^;]*from/,
    ];
    const violations: Record<string, string[]> = {};
    for (const { rel, src } of ALL_FILES) {
      if (rel.endsWith("folio-card-migration.guard.test.ts")) continue;
      const hits = IMPORTS.filter((re) => re.test(src)).map((re) => re.source);
      if (hits.length > 0) violations[rel] = hits;
    }
    expect(violations).toEqual({});
  });
});
