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
const ENTRY_CEILING_KB = 64; // baseline 53.7 → +17% (2026-07-10: +1 for the global keyboard-shortcut listener + the nav-anchor chrome; the SHORTCUTS registry itself stays in the lazy ShortcutsSheet chunk. 2026-07-24: raised 61 → 62 (+1 KB) for the ⌘K reference palette entries — the always-mounted palette's referenceHits memo + its inline bilingual search-term arrays + the requestPlayRef uiStore seam, all EAGER SHELL code. 2026-07-31: raised 62 → 63 (+1 KB) for the anonymous-viewer topbar chrome — the logged-out `{user ? account : sign-in}` branch the eager Topbar renders in place of the account cluster (a single "Sign in" button routing to /login; owner-simplified from the earlier two-button form, and the post-view conversion card removed entirely). All EAGER SHELL (the topbar is on the eager AppShell). NOT a data leak: the button routes to /login (no firebase/auth import); eager-closure chunk families unchanged vs main. 2026-08-02: raised 63 → 64 (+1 KB) for the combat-chronicle in-encounter declaration panel — AttackDeclaration + the pure attack-scope helpers on the EAGER PlayTab (the sheet's play surface); the Firebase-side apply-damage write stays behind a DYNAMIC import so the eager closure's chunk families are UNCHANGED vs main (eager-closure ceiling untouched). Measured 63.61; +0.39 KB deterministic headroom (never exact-fit))
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
// 2026-07-30: raised 776 → 779 (+3 KB) for the quickbuild wave (creation opens on a
// ready-made build + the seeded randomizer). NOT a lazy-chunk leak — the eager closure
// is the SAME 14 chunk families — but the split is worth stating exactly, traced by
// grepping dist for each module's own string literals: the PUBLIC preset record lands
// in the lazy `srd-content` chunk, and the applicator, the yardstick and the randomizer
// in the lazy `CreationWizard` chunk. The PACK preset record does NOT: it reaches the
// bundle through the `@pack` barrel, which eager modules already import, so it rides
// the eager `cockpit-engine` chunk — ~8 presets of bare ids, a fraction of the raise,
// and prising it out would mean restructuring the barrel for ~1 KB. The rest is
// shared-module churn. Measured 776.5; +2.5 KB never-exact-fit headroom.
// [2026-07-31 addendum: the `@pack/monsters` sub-entry below is now the cheap pattern for
// prising a corpus off the barrel. The presets STAY on it deliberately — a fixed ~8 rows
// of bare ids that do not scale; the bestiary is the one that does.]
// 2026-07-17: raised 756 → 773 (+17 KB) for the content-pack licensing partition:
// the SAME EN catalogue bytes now ship as public + pack JSON chunk pairs (per-chunk
// gzip compresses the split corpora slightly worse than the former monoliths) plus
// the composed-build overlay (PHB name/prose restores) and the @pack merge seam.
// Measured 769.7 post-partition; +3 KB deterministic headroom (never exact-fit).
// 2026-07-24 (style-A ornament, rebase onto the bestiary waves): raised 773 → 776
// (+3 KB) for the style-A per-corner ornament CSS (~+1 KB gz) atop the bestiary-held
// 771.4 KB baseline; chunk shape unchanged at 14 chunks. Measured 773.2 KB; +3 KB
// deterministic headroom (never exact-fit).
// 2026-08-02 (custom-monster library + monster portraits): raised 779 → 782 (+3 KB)
// for the owner-approved monster-art feature. The chunk families are UNCHANGED (still
// the same 14 eager chunks) — the growth is the eagerly-loaded Option-B plate CSS in
// folio.css (~+2.7 KB gz); the feature's JS lands in LAZY chunks (the encounter editor,
// the portrait panel, the crop hook), not the eager closure. Measured 779.2 KB gz
// (JS 702.9 + CSS 76.3); +~2.8 KB never-exact-fit headroom → 782.
// 2026-08-02 (the status ledge — BG3-style status badges on the turn meter): raised
// 782 → 786 (+4 KB) for the owner-approved status-ledge. The chunk families are
// UNCHANGED (still the same 14 eager chunks) — StatusLedge rides the eager PlayTab via
// ThisTurnTracker, and its composeStatusBadges/composeTurnLimiters live in the already-
// eager combat-action-view, so NO new lazy chunk went statically reachable; the growth
// is the component code (~+3.3 KB JS) + the `.status-ledge`/`.status-badge` folio.css
// grammar (~+0.7 KB gz). The dead-icon trim was applied FIRST — the badge unit is a
// turn LIMITER, so the icon map now imports ONLY the limiter-causing conditions and
// drops charmed/deafened/invisible (no self-side limiter → never badged today; see the
// StatusLedge seam comment) — but it recovered ~0 KB (per-icon gz is negligible; the
// eager number was byte-identical before and after), confirming the icons were never
// the driver. This is legitimate eager feature weight on the play surface, not a leak.
// Measured 783.2 KB gz (JS 706.2 + CSS 77.0); +~2.8 KB never-exact-fit headroom → 786.
const EAGER_CEILING_KB = 786; // baseline 727.1 → ~+8% (near budget — see ARCHITECTURE P3 frontier #1)
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
// 2026-07-24 (bestiary): raised 8039 → 8300 (+245 KiB corpus, +7 KiB W2 rules content from main) for the lazy monster corpus —
// the bestiary's MonsterStatBlock data chunks (`srd-monsters` + composed `monsters`)
// plus the EN/IT `monsters` i18n catalogue shards. All are LAZY (fetched only when the
// codex Monsters wing / palette opens) but precached to honour the offline-first
// promise. This is NOT an eager regression: the eager closure is UNCHANGED at ~771.4 KB
// gz / 14 chunks — the transient +13 KB eager fragmentation (a specs-barrel top-level
// `await` had turned the barrel async and stopped Rolldown inlining ~60 shared shell
// modules into the entry chunk) was fixed in this same commit, restoring main's chunk
// shape. Measured 8273.55 KiB (282 entries) on the COMPOSED lane — the larger of the
// two; the SRD-only lane measures smaller and passes under the same shared ceiling.
// +~10 KiB deterministic headroom (never exact-fit).
// 2026-07-24 (rebase): combined with the W2 rules-content raise from main (8039 → 8046)
// — re-measured on the combined tree; never exact-fit.
// 2026-07-24 (bestiary c-d wave): raised 8300 → 8373 (+73 KiB) for the c-d tranche's
// 32 statblocks — the EN/IT `monsters` catalogue shards grew by the wave's bilingual
// trait/action prose (still LAZY, precached for offline-first, NOT an eager regression:
// the eager closure is unchanged, the corpus rides the `srd-monsters`/`monsters` lazy
// chunks). Measured 8362.50 KiB (282 entries) on the COMPOSED lane — the larger of the
// two; the SRD-only lane is smaller under the same shared ceiling. +~10 KiB
// deterministic headroom (never exact-fit).
// 2026-07-24 (bestiary e-g wave): raised 8391 → 8517 (guard-measured 8506.58 KiB on the combined rebased tree — the e-g corpus atop main's identity corner-knot raise; +~10 KiB never-exact-fit headroom) for the e-g tranche's
// 64 statblocks (Eagle…Guardian Naga) — the EN/IT `monsters` catalogue shards grew by
// the wave's bilingual trait/action prose (still LAZY, precached for offline-first, NOT
// an eager regression: the eager closure is unchanged at ~771.4 KB gz, the corpus rides
// the `srd-monsters`/`monsters` lazy chunks). Measured 8498.07 KiB (285 entries) on the
// COMPOSED lane — the larger of the two; the SRD-only lane is smaller under the same
// shared ceiling. +~10 KiB deterministic headroom (never exact-fit).
// 2026-07-24 (bestiary h-k wave): raised 8517 → 8579 (+62 KiB) for the h-k tranche's
// 26 statblocks (Half-Dragon…Kraken) — the EN/IT `monsters` catalogue shards grew by
// the wave's bilingual trait/action prose (still LAZY, precached for offline-first, NOT
// an eager regression: the eager closure is unchanged at ~771.4 KB gz, the corpus rides
// the `srd-monsters`/`monsters` lazy chunks). Measured 8568.93 KiB (285 entries) on the
// COMPOSED lane — the larger of the two; the SRD-only lane is smaller under the same
// shared ceiling. +~10 KiB deterministic headroom (never exact-fit).
// 2026-07-24 (bestiary l-m wave): raised 8579 → 8638 (+59 KiB) for the l-m tranche's
// 21 statblocks (Lamia…Mummy Lord) — the EN/IT `monsters` catalogue shards grew by
// the wave's bilingual trait/action prose (still LAZY, precached for offline-first, NOT
// an eager regression: the eager closure is unchanged at ~771.4 KB gz, the corpus rides
// the `srd-monsters`/`monsters` lazy chunks). Measured 8628.04 KiB (285 entries) on the
// COMPOSED lane — the larger of the two; the SRD-only lane is smaller under the same
// shared ceiling. +~10 KiB deterministic headroom (never exact-fit).
// 2026-07-24 (bestiary n-p wave): raised 8638 → 8702 (+64 KiB) for the n-p tranche's
// 27 statblocks (Nalfeshnee…Purple Worm) — the EN/IT `monsters` catalogue shards grew by
// the wave's bilingual trait/action prose (still LAZY, precached for offline-first, NOT
// an eager regression: the eager closure is unchanged at ~771.4 KB gz, the corpus rides
// the `srd-monsters`/`monsters` lazy chunks). Measured 8691.76 KiB (285 entries) on the
// COMPOSED lane — the larger of the two; the SRD-only lane is smaller under the same
// shared ceiling. +~10 KiB deterministic headroom (never exact-fit).
// 2026-07-24 (bestiary q-s wave): raised 8702 → 8819 (+117 KiB) for the q-s tranche's
// 45 statblocks (Quasit…Swarm of Venomous Snakes — the wave's spellcasters (rakshasa · sea-hag
// · spirit-naga), the three sphinxes + solar + storm/stone giants, and the seven swarms) — the
// EN/IT `monsters` catalogue shards grew by the wave's bilingual trait/action prose (still LAZY,
// precached for offline-first, NOT an eager regression: the eager closure is unchanged at
// ~771.4 KB gz, the corpus rides the `srd-monsters`/`monsters` lazy chunks). Measured 8808.76 KiB
// (285 entries) on the COMPOSED lane — the larger of the two; the SRD-only lane is smaller under
// the same shared ceiling. +~10 KiB deterministic headroom (never exact-fit).
// 2026-07-24 (bestiary t-z wave): raised 8819 → 8945 (+126 KiB) for the t-z tranche's
// 46 statblocks (Tarrasque…Young White Dragon — the tarrasque + vampire (with xpInLair) +
// unicorn legendaries, the five lycanthropes, and the nine young metallic/chromatic dragons) —
// the EN/IT `monsters` catalogue shards grew by the wave's bilingual trait/action prose (still
// LAZY, precached for offline-first, NOT an eager regression: the eager closure is unchanged at
// ~771.4 KB gz, the corpus rides the `srd-monsters`/`monsters` lazy chunks). Measured 8934.23 KiB
// (285 entries) on the COMPOSED lane — the larger of the two; the SRD-only lane is smaller under
// the same shared ceiling. +~10 KiB deterministic headroom (never exact-fit).
// +22 KiB 2026-07-30 (the account-level homebrew library) — the feature's own code, all
// LAZY: the Custom tab (list · detail · the three prefilled form legs) rides the cockpit
// chunk, and the listener/store/model/IO ride a 1.1 KB gz `libraryStore` chunk behind the
// lazy `LibraryMount` (the `GlobalCombatMount` pattern), so the ENTRY and EAGER closure
// are UNCHANGED — 61.8 KB gz / 775.6 KB gz across the same 14 chunks. Only the precache
// (which counts every chunk, eager or not) grows. Measured 8978.07 KiB (296 entries) on
// the composed lane, +~11 KiB never-exact-fit headroom.
// +20 KiB 2026-07-30 (binding corners): 8989 → 9020 — the four hero-frame corner-fitting
// SVG masks externalized to `public/assets/ornaments/` (the eager CSS sheds the inline
// data-URIs; the fittings precache for offline-first). Recorded 9009.5 KiB (300 entries).
// +13 KiB 2026-07-30 (the quickbuild wave): 9020 → 9033 — the preset record, applicator,
// randomizer and the wave's bilingual strings grew EXISTING lazy chunks. Recorded 9022.6
// KiB (300 entries). [Both raises landed with only the ARCHITECTURE.md cell updated —
// these two lines are the back-fill that puts the two trails back in step.]
// +22 KiB 2026-07-30 (MM-2025 bestiary pilot, wave 1 — pack 978f48ba/9c29f498): 9033 →
// 9055 for the pilot's 10 statblocks EN+IT. A/B on ONE app SHA with ONLY the pack varying
// (pre-pilot 9b88eba5 vs pilot 9c29f498, both as `content-pack` symlink targets):
//   precache  9023.64 KiB / 300 entries  →  9044.06 KiB / 301 entries   (+20.42, +1 entry)
//   eager gz     776.64 KB / 14 chunks   →     777.88 KB / 14 chunks    (+1.24)
//   entry gz          61.81              →          61.82               (+0.01)
// The pre-pilot figure lands on the quickbuild line's recorded 9022.6 KiB, so that
// baseline was CORRECT and this is a genuine growth event. Ceiling = the measured 9044.06
// +~11 KiB never-exact-fit headroom.
// METHOD NOTE (a confound that cost a wrong first attribution): a task worktree's
// `content-pack` may be a symlink to a SCRATCHPAD pack worktree, not the shared sibling
// checkout. `git -C <sibling> checkout <sha>` then bisects nothing — every build keeps
// reading the symlink target. Always `readlink content-pack` first and vary THAT.
//
// ✅ SEAM DEBT CLOSED 2026-07-31 — pack monsters were DOUBLE-SHIPPED into the eager closure.
// The defect: `src/data/monsters/index.ts` is lazy (the `srd-monsters` chunk) and its
// docblock forbids eager importers, but it composed `packMonsters` from the `@pack` BARREL
// (`content-pack/index.ts`) — which the always-eager Grant engine also reaches — and
// Rolldown places whatever that barrel re-exports in the EAGER chunk no matter which
// `manualChunks` bucket the source module claims. So the pack corpus sat in the eager
// `cockpit-engine` chunk while the lazy `srd-monsters` chunk merely imported it back.
// The fix: `packMonsters` now arrives through the pack's ONE sub-entry alias,
// `@pack/monsters` (`scripts/content-pack-mode.ts` → `packMonstersAliasTarget()`, mirrored
// in the vite/vitest alias maps + the three tsconfig `paths`), and is REMOVED from the
// barrel — so the corpus is reachable only from the lazy aggregate. SRD-only resolves the
// sub-entry to the same typed-empty stub. docs/ARCHITECTURE.md → "The content-pack seam".
// Measured on ONE app SHA with ONE pinned pack worktree, only the seam varying (composed):
//   eager gz        777.87 KB / 14 chunks  →  776.50 KB / 14 chunks   (−1.37)
//   cockpit-engine      387.7 KB gz        →      386.3 KB gz         (−1.4)
//   entry gz              61.81            →        61.81             (unchanged)
//   precache        9044.06 KiB / 301      →  9044.04 KiB / 301       (−0.02: the corpus
//     MOVED chunks rather than being written to disk twice, so the precache is flat)
//   the wave-1 pilot's statblock ids in an EAGER chunk:  YES → NO — they now appear only in
//     the lazy `srd-monsters` data chunk + the two lazy `monsters-*` catalogues. (Probe them
//     by grepping dist for ids read out of the pack's own corpus; PI names stay out of this
//     public repo — content-pack-partition.guard.test.ts enforces that.)
// The SRD-only lane measures 627.87 KB gz eager / 7850.02 KiB precache (282 entries) —
// smaller, under the same shared ceilings.
// The EAGER ceiling is NOT lowered for this (ratchets, not trackers): the freed ~1.4 KB is
// recorded slack, and EAGER_CEILING_KB stays the regression guard — putting `packMonsters`
// back on the barrel returns the whole corpus to the eager closure, which at MM wave-2 size
// (the manifest's remaining 163 statblocks, ~20 KB gz) trips it loudly.
//
// +11 KiB 2026-07-31 (share-links wave — feat/share-links's OWN feature, NOT the pilot):
// 9055 → 9066. main ALREADY stepped the ceiling to 9055 for the MM bestiary pilot and then
// closed the seam above, so its composed base is 9044.04 KiB / 301 entries. The overflow on
// this branch is the share-links feature's OWN new lazy chunks the PWA precaches —
// SharedCharacterView, SharePopover, the two `share-*` chunks, invite-code, and the anonymous
// /view read seam:
//   precache  9044.04 KiB / 301 entries (main, seam-fixed)  →  9055.07 KiB / 307 entries
//             (+11.01 KiB, +6 entries — all lazy route/component chunks)
// EAGER (776.50 KB gz) and ENTRY (61.8 KB gz) are UNCHANGED and stay under their ceilings —
// the feature added only lazy chunks. Measured 9055.07 KiB (307 entries) on the COMPOSED
// lane; +~11 KiB never-exact-fit headroom → 9066.
// +449 KiB 2026-08-02 (the full pack bestiary + 5 choice-damage monsters): 9066 → 9515.
// The 9066 line was the wave-1 PILOT baseline (10 pack statblocks, 307 entries). Since then
// the pack bestiary was authored to ~160 statblocks across the a-b…t-z tranches — but that
// authoring lands in the PACK repo (`d20-folio-content`), which has NO pre-push budget gate,
// so the composed lazy `monsters-*` catalogue shards (one precache entry per tranche × locale,
// ~16 new entries) and their bilingual prose grew UNTRACKED here; this is the first PUBLIC
// composed push to surface the accumulated drift. A/B on ONE app SHA with only the pack
// varying (origin/main pack vs this branch's 5 new monsters, `content-pack` symlink target):
//   precache  9481.90 KiB / 323 entries (pack origin/main)  →  9503.94 KiB / 323 entries
//             (+22.04 KiB, +0 entries — the 5 choice-damage monsters' EN+IT prose grew the
//              EXISTING e-g/t-z shards; no new image, font, or entry)
// The bulk (9055.07 → 9481.90, +426.83 KiB / +16 entries) is the pre-existing pack-tranche
// growth described above — all LAZY (fetched only when the codex Monsters wing opens),
// precached for offline-first; the EAGER closure is unchanged (the corpus rides the
// `@pack/monsters` lazy sub-entry, never the eager barrel — "The content-pack seam"). Ceiling =
// the measured 9503.94 +~11 KiB never-exact-fit headroom → 9515.
//
// 2026-08-02 (the first-load precache trim, pre-GA item 3 — `PROGRESS.md` → the soft-launch
// charter): by this point main had drifted to 9481.90 KiB / 323 entries (the difficulty-calc
// / encounter-budget waves grew several lazy chunks without a ceiling bump — this trim's
// LOWER new ceiling below closes that drift too, not just banks the win). The 12 heavy
// scene/backdrop plates (`public/assets/backgrounds/*.webp`, ~1.3 MiB combined) moved from
// the precache glob to a dedicated "scene-art" CacheFirst runtime route (`vite.config.ts`) —
// still offline-capable after the one visit that painted a scene (the #59 F14 lesson: EXCLUDE
// would 404 offline; RUNTIME-CACHE keeps the guarantee), but no longer force-fetched into
// every fresh install regardless of which routes that visitor ever opens. EAGER (776.50 KB gz)
// and ENTRY (61.8 KB gz) are UNCHANGED — the plates were never part of the JS bundle. Landed TOGETHER with the
// same-day pack-bestiary growth above, so the ceiling is the fresh COMPOSED measurement of
// the MERGED tree (grown bestiary − the 12 plates) + the usual +~11 KiB never-exact-fit
// headroom: measured 8207.56 KiB / 311 entries on the merged tree (the pack sibling's
// choice-damage prose, +22 KiB, landed between first measure and the push gate) → 8219.
//
// 2026-08-02 (custom-monster library + monster portraits): raised 8219 → 8255 (+36 KiB)
// for the owner-approved monster-art feature. The growth is the new LAZY UI chunks
// precached for offline-first — the custom-monster editor (encounter-custom-monsters),
// the height-matched Option-B portrait plate (MonsterPortraitPanel / MonsterArtHeader),
// the useMonsterPortrait crop hook, and the Option-B folio.css — none eager (the eager
// closure grew only marginally, see EAGER_CEILING_KB below). Measured 8243.51 KiB / 313
// entries on the merged (rebased) tree; +~11.5 KiB never-exact-fit headroom → 8255.
//
// 2026-08-02 (combat-chronicle epic): raised 8255 → 8300 (+45 KiB) for the owner-approved
// auto-narrated combat chronicle. The growth is the new LAZY campaign/sheet chunks precached
// for offline-first — the chronicle recorders + reconciler (combat-chronicle / chronicle-
// reconcile), the EN/IT presenter (combat-chronicle-view), the party-chronicle live feed, and
// the in-encounter declaration panel (AttackDeclaration); the eager entry grew +1 KB (its own
// row) but the eager CLOSURE chunk families are unchanged (the Firebase apply-damage write is a
// dynamic import). Measured 8287.80 KiB / 315 entries on the merged (rebased) tree; +~12 KiB
// never-exact-fit headroom → 8300.
//
// 2026-08-02 (canonical Living Bestiary portraits): the 503 WebPs emit under
// `assets/monsters/` and are EXCLUDED from first install, entering a one-year CacheFirst
// runtime cache only when viewed. The necessary lazy `monster-art` URL index remains
// precached so an already-available campaign/compendium route can resolve hashed portrait
// URLs offline. Measured 8340.67 KiB / 315 entries (+52.87 KiB, +0 entries from the
// combat-chronicle base); +~12 KiB never-exact-fit headroom → 8353.
const PRECACHE_CEILING_KIB = 8353;
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
