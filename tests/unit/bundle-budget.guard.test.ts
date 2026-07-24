/// <reference types="node" />
/**
 * Guard: the eager bundle + PWA precache can't silently balloon (P3 — perf budget).
 *
 * There was NO bundle budget before this guard. The app's WHOLE value depends on
 * a fast first paint on a phone, and the recurring failure mode is invisible: an
 * engineer eagerly `import`s a heavy datum (the IT SRD blob, a charting lib, the
 * spell/magic-item corpus) into a module the app shell reaches synchronously, and
 * the entry download silently doubles — nobody notices until a user on 3G waits.
 *
 * This guard reads the PRODUCTION BUILD (`dist/`) and pins three ceilings against
 * the measured P3 baseline (`docs/ARCHITECTURE.md` → "Performance budget (P3)"):
 *
 *   1. ENTRY CHUNK gz ≤ ENTRY_CEILING_KB — the index entry script alone.
 *   2. EAGER CLOSURE gz ≤ EAGER_CEILING_KB — the entry script PLUS its full
 *      STATIC import closure (every chunk the browser must fetch before the first
 *      interactive paint, traced through `import "./x.js"` edges) PLUS the eager
 *      stylesheet(s). This is the honest "what you download on a cold visit"
 *      number — it FAILS if someone makes a heavy lazy chunk statically reachable.
 *   3. PRECACHE total ≤ PRECACHE_CEILING_KIB — every file Workbox precaches (the
 *      install/offline footprint), summed from the generated service worker.
 *
 * Plus a RATCHET: no NEW eager chunk > NEW_EAGER_CHUNK_LIMIT_KB gz may enter the
 * static closure without an allowlist entry carrying a one-line justification —
 * the same pattern as the repo's other guards (grant-kind-exposure, route-coverage).
 * So eagerly importing the IT SRD or html2canvas into the shell trips THIS check
 * with the offending chunk named, before it ever reaches a user.
 *
 * Ceilings are baseline + ~10% headroom (legitimate growth lands; a regression
 * does not). When a ceiling is intentionally raised, update BOTH the constant here
 * AND the baseline table in `docs/ARCHITECTURE.md` in the same commit.
 *
 * NEVER re-baseline to an exact-fit measured value — always add a few KiB/bytes of
 * DETERMINISTIC headroom above the measured number to absorb gzip/build noise.
 * Two straight knife-edge flips proved this the hard way: the 2026-07-16 eager
 * closure raise (755→756) landed AT the measured 755.006 and a routine rebuild
 * flipped the gate on ~6 bytes of wobble; the 2026-07-17 precache raise (7151→7247)
 * repeated the mistake exact-fit and flipped again on the very next rebuild
 * (7247.22 measured vs a 7247 ceiling). Every raise from here on must clear the
 * measured value by a deliberate margin, not land on it.
 *
 * ── Why it reads `dist/` (and how the gate runs it) ──────────────────────────
 * The truth lives in the emitted bundle, not the source — a manualChunks tweak or
 * a transitive import can move weight the source doesn't reveal. The gate
 * (pre-push + CI `build` job) runs this AFTER `vite build`, so `dist/` exists. Run
 * locally with: `pnpm build && pnpm vitest run bundle-budget`. If `dist/` is
 * absent the guard FAILS LOUDLY with that instruction rather than passing on no
 * data — a budget you can skip by not building is no budget.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, "../../dist");
const ASSETS = resolve(DIST, "assets");

// ── Measured P3 baseline (2026-06-11) + ~10% headroom ──────────────────────────
// Baseline (gz): entry 53.7 KB · eager closure (28 chunks + css) 660.5 KB.
// Precache after the font-subset trim: 5884.9 KiB.
const ENTRY_CEILING_KB = 61; // baseline 53.7 → +14% (2026-07-10: +1 for the global keyboard-shortcut listener + the nav-anchor chrome; the SHORTCUTS registry itself stays in the lazy ShortcutsSheet chunk)
// 2026-06-29: re-baselined 660.5 → 727.1 (the prior +10% headroom was fully absorbed by
// accumulated shipping; the premium campaign-hub layout CSS crossed it). Tightened headroom to
// ~+3% — the eager closure is NEAR budget; frontier #1 (make SRD resolution lazy) is the real lever.
// 2026-07-10: raised 750 → 755 for the compendium school-enamel palette (organic CSS growth on a
// ratified design addition, not a lazy-chunk leak — verified the eager closure's 13 chunk families
// are unchanged vs main). Still near budget; frontier #1 remains the real lever.
// 2026-07-16: raised 755 → 756 (+1 KB). Two owner-ratified features landed the same day — the
// rules-text colour grammar (main) + the Gilded Reliquary corner ornament (this branch). After
// ~45% trimming the two `--frame-ornate` SVGs, the closure sits WITHIN BUILD NOISE of the old 755
// (clean-build 755.006, an earlier build 755.005 — a ~6-byte gzip/bundler wobble around a
// knife-edge ceiling), causing nondeterministic gate flips with no underlying regression. +1 KB
// restores deterministic headroom while keeping the guard's teeth (chunk families unchanged vs
// main). Frontier #1 (lazy SRD) remains the real lever.
// 2026-07-17: raised 756 → 773 (+17 KB) for the content-pack licensing partition:
// the SAME EN catalogue bytes now ship as public + pack JSON chunk pairs (per-chunk
// gzip compresses the split corpora slightly worse than the former monoliths) plus
// the composed-build overlay (PHB name/prose restores) and the @pack merge seam.
// Measured 769.7 post-partition; +3 KB deterministic headroom (never exact-fit).
const EAGER_CEILING_KB = 773; // baseline 727.1 → ~+6% (near budget — see ARCHITECTURE P3 frontier #1)
// 2026-06-11: raised from 6480 → 7150 for the lazy PDF-export renderer chunk
// (character-pdf-*.js, ~428 KB raw / ~178 KB gz). The chunk is LAZY (loaded only
// on demand from the PDF export flow) and correctly precached for offline-first.
// New measured baseline: 6693 KiB (236 entries) → +7% headroom = 7150.
// 2026-07-16: raised 7150 → 7151 (+1 KiB) for the Gilded Reliquary per-theme corner
// ornament (the owner-ratified full-BG3 identity push) landing atop main's freshly-
// merged rules-text colour grammar — a hairline integration collision (each fit
// alone; combined +2 KiB precache / +0.1 KB eager). The two `--frame-ornate` SVG
// data-URIs were first trimmed ~45% (diagonal-mirror dedup via a matrix(0 1 1 0 0 0)
// `use`, quarter-coord rounding, raw `<>`, one fewer corner `use`) — that ALONE
// cleared the eager-closure ceiling with no raise; this +1 KiB covers the residual
// raw precache cost of the second (per-theme) SVG copy, which cannot dedup on disk.
// 2026-07-17: raised 7151 → 7247 (+96 KiB) for the Batch-4 v2 scene plates (P12–P14 of
// the owner-ratified full-BG3 push): home-hero / home-hero-light / login repainted at
// BG3 main-menu richness. The painterly edges carry real image entropy the shy v1 blurs
// did not — the bytes ARE the feature. Cost was minimized first: re-encoded at WebP
// q75 + sharp_yuv (visually transparent at 1:1, verified on the full-opacity login
// hero) → 80 + 113 + 78 KiB vs the v1s' 26 + 42 + 106.
// 2026-07-17 (same-day correction): the 7247 raise above landed EXACT-FIT against the
// measured build (7247.22 KiB) — the very knife-edge mistake this file's raise-protocol
// now warns against. Raised 7247 → 7250 (+3 KiB) of deliberate, deterministic headroom;
// no new asset weight, purely absorbing gzip/build noise.
// 2026-07-17: raised 7250 → 7252 (+2 KiB) for the wave-2 identity strike (two-tone
// reliquary SVG raw growth + the gilt-glint/kindle recipes; gz eager +0.22 KB) — the
// measured build moved 7247.2 → 7249.1, leaving 0.9 KiB under 7250, the exact-fit
// condition the raise-protocol forbids; the new ceiling restores the ~3 KiB floor.
// 2026-07-17: raised 7252 → 7262 (+10 KiB) for the content-pack partition (the split
// public/pack catalogue chunk pairs + the overlay — same content, slightly worse
// per-chunk compression; measured 7256.6).
// 2026-07-17: raised 7262 → 7276 (+14 KiB) for the SRD repatriation of the 22
// held-back entries (11 subclass features + 11 magic items): the public EN+IT
// catalogue chunks now carry the SRD's own verbatim prose where the pack's
// shorter paraphrases used to sit — the bytes ARE the licensing fix — compounded
// by the dual-SRD legal-attribution text merged on main. Measured 7270.8.
// 2026-07-24: raised 7276 → 8033 (+757 KiB) for the Batch-4 realm scenes (P15–P23 of
// the owner-ratified full-BG3 push): the login-light / campaign-hall drop-in swaps at
// full richness, plus SIX brand-new per-realm plates — compendium (Grand Library),
// roster (Hall of Heroes), and creation+level-up (Ritual of Making), each a designed
// dark/light pair. The painterly plates carry real image entropy — the bytes ARE the
// feature; cost was minimized first (WebP q75 + sharp_yuv, visually transparent at
// 1:1, verified per-plate at grading). Measured 8027.2.
// 2026-07-24 (same-day, post-rebase): raised 8033 → 8039 (+6 KiB) after rebasing the
// atmosphere branch onto origin/main's RA-wave SYSTEM-audit fixes (RA-01…RA-35) —
// accumulated JS chunk growth carried in from main, not new atmosphere-branch asset
// weight. Measured 8033.79 KiB (276 entries); +5 KiB deterministic headroom (never
// exact-fit).
const PRECACHE_CEILING_KIB = 8039; // baseline 8033.79 (2026-07-24 RA-wave chunk growth, post-rebase) + ~5 KiB deterministic headroom — never exact-fit
const NEW_EAGER_CHUNK_LIMIT_KB = 50; // gz; a new eager chunk above this needs an allowlist entry

/**
 * Eager chunks ABOVE the per-chunk ratchet that are KNOWINGLY in the static
 * closure, each with a one-line justification. A NEW heavy eager chunk not listed
 * here fails the ratchet — forcing a deliberate choice (make it lazy, or justify
 * it). Sizes are the gz the chunk currently weighs; keep the reason current.
 *
 * NOTE the entry naturally pulls the SRD corpus today because the Grant engine
 * reads SRD facts SYNCHRONOUSLY from always-eager engine modules (smart-tracker /
 * resolve-grant-sources). Making the SRD lazy-per-route is an ENGINE-layer change
 * tracked as a ranked deferred finding in docs/ARCHITECTURE.md → "Performance
 * budget (P3)"; until then these corpus chunks are legitimately eager and listed.
 */
const EAGER_ALLOWLIST: { chunk: string; reason: string }[] = [
  {
    chunk: "firebase",
    reason:
      "Firebase SDK (auth + firestore + storage) — the app shell needs auth at boot to " +
      "gate every route; already its own long-cacheable vendor chunk.",
  },
  {
    chunk: "react-vendor",
    reason:
      "react + react-dom + react-router + i18next + zustand — the framework runtime.",
  },
  {
    chunk: "magic-items",
    reason:
      "SRD magic-item corpus — reached synchronously by the Grant engine (smart-tracker / " +
      "resolve-grant-sources) which the always-eager character store imports. Lazy-per-route " +
      "SRD is the #1 ranked deferred P3 finding (engine-layer change).",
  },
  {
    chunk: "spells",
    reason:
      "SRD spell corpus — same synchronous Grant-engine reachability as magic-items; deferred " +
      "to the engine-layer SRD-lazy finding.",
  },
  {
    chunk: "class-features",
    reason:
      "SRD class-feature corpus — same synchronous Grant-engine reachability; deferred to the " +
      "engine-layer SRD-lazy finding.",
  },
  {
    chunk: "cockpit-engine",
    reason:
      "The cockpit combat ENGINE itself (smart-tracker + the combat/level-up/inventory view-models " +
      "+ the per-step pick resolvers), pinned to one cacheable chunk via manualChunks so it never " +
      "inlines into the ENTRY script — a graph-shape change from the id-storage refactor had " +
      "ballooned the entry past its ceiling. Eager-reachable through the always-eager character " +
      "store's combat-state actions (timers/potions/trackers); making it lazy-per-route is the SAME " +
      "deferred engine-layer P3 finding as the SRD corpus chunks above. Consolidates previously-" +
      "distributed eager engine modules (no new eager bytes — the eager-closure budget still holds).",
  },
];

const allowed = new Set(EAGER_ALLOWLIST.map((e) => e.chunk));

/** gz size (KB) of a file on disk. */
function gzKB(path: string): number {
  return gzipSync(readFileSync(path), { level: 9 }).length / 1024;
}

/**
 * The chunk FAMILY name (hash-stripped). Rollup/Rolldown names are
 * `<name>-<8charHash>.js` where the hash is the LAST dash-segment (no extra
 * dashes), e.g. `spells-BriybGtU.js` → `spells`, `react-vendor-uUpe0FXP.js` →
 * `react-vendor`, `magic-items-D_2EKOql.js` → `magic-items`. Strip ONLY the final
 * `-<hash>.js` segment, never an earlier dash in a multi-word name.
 */
function family(file: string): string {
  // The hash segment is `-<8 base64url chars>.js`. Vite/Rolldown hashes are EXACTLY 8
  // chars and CAN contain `-`/`_` (e.g. `bio--2YqWt3a`, `auth-aMT3rQR-`,
  // `cockpit-engine-beEHF-Cq`). Match EXACTLY 8 (not `{8,}`) and anchor at the end, so
  // an earlier dash in a multi-word name (`react-vendor`, `magic-items`,
  // `cockpit-engine`) is preserved while a hyphen-containing hash is still fully
  // stripped — the old `[A-Za-z0-9_]{8,}` class excluded `-`, so it FLAKILY failed
  // (leaving the hash in the family) whenever a hash happened to contain a dash.
  return file.replace(/-[A-Za-z0-9_-]{8}\.js$/, "").replace(/\.js$/, "");
}

/** Every `import "./x.js"` / `from "./x.js"` STATIC edge in a chunk's source. */
const STATIC_IMPORT = /(?:from|import)\s*["']\.\/([A-Za-z0-9_.-]+\.js)["']/g;

function distMissingMessage(): string {
  return (
    `dist/ not found — the bundle budget reads the PRODUCTION build.\n` +
    `Run:  pnpm build && pnpm vitest run bundle-budget\n` +
    `(The gate runs this after \`vite build\`; a budget you can skip by not building is no budget.)`
  );
}

describe("bundle budget — eager entry + precache ceilings (P3)", () => {
  it("the production build exists (run `pnpm build` first)", () => {
    expect(existsSync(DIST), distMissingMessage()).toBe(true);
    expect(existsSync(ASSETS), distMissingMessage()).toBe(true);
  });

  // Trace the eager static closure once, shared across the assertions below.
  const haveDist = existsSync(ASSETS);
  const html = haveDist ? readFileSync(resolve(DIST, "index.html"), "utf8") : "";
  const jsFiles = haveDist
    ? new Set(readdirSync(ASSETS).filter((f) => f.endsWith(".js")))
    : new Set<string>();

  const entryMatch = html.match(/<script[^>]*type="module"[^>]*src="\/assets\/([^"]+)"/);
  const entryFile = entryMatch?.[1] ?? "";

  /** BFS the static import graph from the entry chunk → the set of eager chunk files. */
  function eagerClosure(): Set<string> {
    const seen = new Set<string>();
    if (!entryFile) return seen;
    const stack = [entryFile];
    while (stack.length) {
      const f = stack.pop();
      if (!f || seen.has(f)) continue;
      seen.add(f);
      const src = readFileSync(resolve(ASSETS, f), "utf8");
      for (const m of src.matchAll(STATIC_IMPORT)) {
        const dep = m[1];
        if (dep && dep !== f && jsFiles.has(dep)) stack.push(dep);
      }
    }
    return seen;
  }

  it("entry chunk gz is within the ceiling", () => {
    if (!haveDist) return; // the existence test above already failed loudly
    expect(
      entryFile,
      "could not find the module entry <script> in dist/index.html"
    ).not.toBe("");
    const kb = gzKB(resolve(ASSETS, entryFile));
    expect(
      kb,
      `Entry chunk ${entryFile} is ${kb.toFixed(1)} KB gz — over the ${ENTRY_CEILING_KB} KB ceiling.\n` +
        `Either shave the entry, or (deliberately) raise ENTRY_CEILING_KB here AND the baseline in ` +
        `docs/ARCHITECTURE.md → "Performance budget (P3)" in the same commit.`
    ).toBeLessThanOrEqual(ENTRY_CEILING_KB);
  });

  it("eager closure gz (entry + static imports + css) is within the ceiling", () => {
    if (!haveDist) return;
    const closure = eagerClosure();
    let jsKB = 0;
    for (const f of closure) jsKB += gzKB(resolve(ASSETS, f));
    const cssHrefs = [
      ...html.matchAll(/rel="stylesheet"[^>]*href="\/assets\/([^"]+\.css)"/g),
    ].map((m) => m[1]);
    let cssKB = 0;
    for (const c of cssHrefs) if (c) cssKB += gzKB(resolve(ASSETS, c));
    const total = jsKB + cssKB;
    expect(
      total,
      `Eager download is ${total.toFixed(1)} KB gz (JS ${jsKB.toFixed(1)} + CSS ${cssKB.toFixed(1)}) ` +
        `across ${closure.size} chunks — over the ${EAGER_CEILING_KB} KB ceiling.\n` +
        `A lazy chunk likely became statically reachable from the entry. Make it dynamic ` +
        `(React.lazy / import()), or raise EAGER_CEILING_KB here AND the baseline doc in the same commit.`
    ).toBeLessThanOrEqual(EAGER_CEILING_KB);
  });

  it("no NEW eager chunk above the per-chunk ratchet without an allowlist entry", () => {
    if (!haveDist) return;
    const closure = eagerClosure();
    const offenders: string[] = [];
    for (const f of closure) {
      const kb = gzKB(resolve(ASSETS, f));
      if (kb <= NEW_EAGER_CHUNK_LIMIT_KB) continue;
      const fam = family(f);
      // The framework/entry chunks (index/react-vendor/firebase) are allowlisted by
      // family; index is the entry itself (covered by its own ceiling).
      if (fam === family(entryFile)) continue;
      if (!allowed.has(fam))
        offenders.push(`${f}  (${kb.toFixed(1)} KB gz, family "${fam}")`);
    }
    if (offenders.length) {
      throw new Error(
        `These EAGER chunks exceed ${NEW_EAGER_CHUNK_LIMIT_KB} KB gz and are NOT allowlisted:\n` +
          offenders.map((o) => `  ${o}`).join("\n") +
          `\n\nIf the chunk SHOULD be eager, add { chunk, reason } to EAGER_ALLOWLIST with a ` +
          `one-line justification. If it should NOT (e.g. you eagerly imported the IT SRD or a ` +
          `heavy lib into the app shell), make it lazy (React.lazy / dynamic import()) instead.`
      );
    }
    expect(offenders).toEqual([]);
  });

  it("PWA precache total is within the ceiling", () => {
    if (!haveDist) return;
    // The generated SW embeds the precache manifest as `[{url, revision}, ...]`.
    // Sum the on-disk size of every precached url (paths are app-root-relative).
    const swPath = resolve(DIST, "sw.js");
    expect(existsSync(swPath), "dist/sw.js (the generated Workbox SW) not found").toBe(
      true
    );
    const sw = readFileSync(swPath, "utf8");
    // Workbox embeds the manifest as `{url:"…",revision:"…"}` (UNQUOTED keys in the
    // minified SW). Match the url of each precache entry.
    const urls = [...sw.matchAll(/\burl:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(
      urls.length,
      "precache manifest parsed empty — SW format changed?"
    ).toBeGreaterThan(20);
    let kib = 0;
    const missing: string[] = [];
    for (const u of urls) {
      if (!u) continue;
      const p = resolve(DIST, u.replace(/^\//, ""));
      if (existsSync(p) && statSync(p).isFile()) kib += statSync(p).size / 1024;
      else missing.push(u);
    }
    // A handful of virtual entries (registerSW/manifest) may not map 1:1; tolerate a
    // few, but a wholesale miss means the parse broke.
    expect(
      missing.length,
      `too many precache urls didn't resolve to files: ${missing.join(", ")}`
    ).toBeLessThan(5);
    expect(
      kib,
      `PWA precache is ${kib.toFixed(0)} KiB across ${urls.length} entries — over the ` +
        `${PRECACHE_CEILING_KIB} KiB ceiling. Something heavy entered the precache (an oversized ` +
        `asset, an un-trimmed font subset, a newly-eager corpus). Trim it, or raise ` +
        `PRECACHE_CEILING_KIB here AND the baseline doc in the same commit.`
    ).toBeLessThanOrEqual(PRECACHE_CEILING_KIB);
  });

  it("every allowlist entry carries a justification (the ratchet stays honest)", () => {
    for (const e of EAGER_ALLOWLIST) {
      expect(e.chunk.trim().length, "allowlist chunk name empty").toBeGreaterThan(0);
      expect(e.reason.trim().length, `${e.chunk} needs a reason`).toBeGreaterThan(15);
    }
    // No duplicate families in the allowlist (single source of truth).
    const fams = EAGER_ALLOWLIST.map((e) => basename(e.chunk));
    expect(new Set(fams).size, "duplicate allowlist entries").toBe(fams.length);
  });
});
