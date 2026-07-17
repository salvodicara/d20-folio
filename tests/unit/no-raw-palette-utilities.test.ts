/**
 * Guard: player-facing surfaces must not use raw Tailwind palette color
 * utilities (text-amber-400, text-slate-200, bg-amber-500/20, …).
 *
 * **Why:** those raw palette hues are tuned for dark backgrounds only. On the
 * light Illuminated-Folio vellum they collapse below WCAG 1.4.3 (e.g. amber-400
 * = 1.54:1, slate-200 = 1.14:1 — effectively invisible). The ONLY allowed colour
 * source is the @theme bridge → folio token utilities (text-warning,
 * text-success, text-error, text-info, text-accent, etc.), which are theme-aware
 * and clear AA in BOTH themes. This caught the equipment currency, level-up
 * prerequisite, and create-wizard hint regressions in the r5 design review.
 *
 * **Scope:** src/app/routes/characters + src/components/sheet + the shared
 * components — the surfaces a player actually sees. The re-homed admin console
 * (`features/account/AdminPage.tsx`) was restyled onto folio semantic tokens in
 * Phase 6, so it is no longer allow-listed; LevelUpModal's decorative
 * section-icon `color=` props are tracked separately for migration.
 *
 * To clear a new violation, swap the raw palette class for the mapped semantic
 * token utility — do NOT add the file to the allow-list.
 */
import { describe, it, expect } from "vitest";
import { resolve, relative } from "node:path";
import { SRC_ROOT as SRC, srcFiles, readSrc } from "./__helpers__/src-files";

const root = resolve(SRC, "..");

// Raw Tailwind palette colour utilities (the @theme bridge token utilities —
// text-warning/success/error/info/accent/text-primary/etc. — are NOT palette
// names and are unaffected).
const PALETTES =
  "amber|emerald|blue|slate|gray|grey|red|green|orange|yellow|purple|violet|indigo|sky|teal|cyan|lime|rose|pink|fuchsia|zinc|neutral|stone";
const RAW_PALETTE = new RegExp(
  `\\b(?:text|bg|border|ring|from|to|via|fill|stroke|shadow|decoration|outline|divide|placeholder|caret|accent)-(?:${PALETTES})-(?:50|100|200|300|400|500|600|700|800|900|950)\\b`,
  "g"
);

// Files still pending migration (internal/admin or decorative section icons).
// Keep this list SHRINKING — never grow it to silence a new player-facing leak.
const ALLOWLIST = new Set<string>([
  "src/components/sheet/LevelUpModal.tsx", // decorative per-section icon `color=` props (tracked)
  // ActionLog.tsx removed: its glyph + border now read one per-type folio
  // `--at-*` palette inline (no raw Tailwind palette utilities remain).
]);

// `features/**` is scanned too: the re-homed character molecules (HpBar,
// GameRail/ResourceRail, DeathSaves, …) and the cockpit live there now, so the
// palette guard must follow them or coverage silently rots.
const SCAN_DIRS = [
  resolve(SRC, "app/routes"),
  resolve(SRC, "components"),
  resolve(SRC, "features"),
];

describe("no raw Tailwind palette utilities on player surfaces", () => {
  const files = SCAN_DIRS.flatMap((d) => srcFiles({ under: d, exts: [".tsx"] }));

  const violations: Record<string, string[]> = {};
  for (const file of files) {
    const rel = relative(root, file);
    if (ALLOWLIST.has(rel)) continue;
    const src = readSrc(file);
    const hits = [...src.matchAll(RAW_PALETTE)].map((m) => m[0]);
    if (hits.length > 0) violations[rel] = [...new Set(hits)];
  }

  it("uses folio @theme token utilities, not raw palette hues", () => {
    expect(violations).toEqual({});
  });
});
