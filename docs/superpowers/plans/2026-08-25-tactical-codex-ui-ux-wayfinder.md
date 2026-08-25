# Tactical Codex App-Wide UI/UX Implementation Wayfinder

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for this orchestration and create the named detailed `superpowers:writing-plans` plan before coding each vertical slice. Use `impeccable` for every UI slice, `image-to-code` for atlas-to-app comparison, `superpowers:test-driven-development` while implementing, `superpowers:systematic-debugging` for regressions, and `superpowers:verification-before-completion` before handoff.

**Goal:** Replace the entire live UI with the approved Tactical Codex system across every product capability, viewport, locale, theme, meaningful state, and overlay without changing product semantics or exposing a hybrid public experience.

**Architecture:** B00 establishes the licensed visual foundation first. A00 then defines the single responsive shell; A16/B01 supply one adaptive task-surface and motion grammar. Each independently reviewable slice lands on `main` as an inert, tree-shaken candidate module reachable only through a dev/test specimen. The legacy UI remains the only production runtime owner until the complete system passes every gate; one final route/shell commit atomically activates Tactical Codex and deletes the legacy UI plus specimen scaffolding.

**Tech Stack:** React 19, strict TypeScript, React Router, Tailwind v4 plus scoped CSS modules, Radix primitives, Zustand, Firebase, i18next, Vitest, Playwright, Chrome with the owner's authenticated Google session, GitHub Actions.

**Spec:** [Automation-first product reset](../../plans/2026-08-24-automation-first-product-reset.md), [DESIGN.md](../../../DESIGN.md), [Tactical Codex atlas](../../design/tactical-codex-atlas/README.md), [Product Constitution](../../PRODUCT_CONSTITUTION.md), [Product](../../../PRODUCT.md).

## Global Constraints

- [ ] Treat the atlas boards and `DESIGN.md` as the approved visual contract. Existing `folio.css`, legacy components, and the dev prototype are evidence only.
- [ ] Preserve product invariants: no generated dice results, EN+IT by construction, offline-first behavior, SRD/content-pack partition, stored-character compatibility, and WCAG 2.2 AA.
- [ ] Do not invent, duplicate, or parse mechanics in UI. Action surfaces consume the deterministic semantic command/result seam delivered by the architecture reset.
- [ ] Do not use a production-visible design flag, per-route opt-in, or mixed legacy/new shell. Candidate modules may be imported only from a compile-time DEV/TEST specimen entry so production tree-shakes them; cut over only when every route family is complete.
- [ ] Do not use the Codex in-app browser for authenticated acceptance. Google login is performed in the user's Chrome; the Chrome session is then used for final navigation and screenshots.
- [ ] Do not deploy merely to review visuals. Prefer an authenticated Chrome tab against the local candidate. GitHub Actions is the production deployment path only after the candidate SHA has owner-approved screenshots and the repository's per-change deploy gate is satisfied.
- [ ] Every user-visible string is bilingual and tests never use display text as identity. During inert build-out, paired candidate catalogues live under `src/i18n/tactical-codex/{en,it}/*.json` and load only in the DEV/TEST specimen; Task 15 promotes them into `src/i18n/{en,it}/ui/*.json` so production locale chunks remain unchanged before cutover.
- [ ] Every slice starts with a failing behavior/a11y/visual-state test, removes superseded candidate/prototype code, records its exact production-legacy deletion set for the atomic cutover, carries one uniquely named `.changeset/*.md`, and remains small enough for a fresh worker plus a fresh reviewer.
- [ ] Every slice plan names exact files, routes, states, deletion targets, commands, expected RED/GREEN output, and the screenshots it owes. No `TBD`, placeholder copy, placeholder art, speculative component, or deferred cleanup is allowed.
- [ ] During build-out, only the legacy route is a production runtime owner; candidate presenters consume the same canonical views/stores but stay unmounted. A slice may not add a second listener, store, persistence path, or mechanics owner. Delete candidate-local duplicates immediately; delete the still-live legacy presenter/CSS/tests in the final atomic cutover using the slice's reviewed deletion ledger.
- [ ] Do not modify Firebase rules or stored schemas as part of visual work. If a surface exposes a missing model capability, stop that slice and route it to the architecture/persistence plan with migration fixtures and rules tests.

## Atlas Coverage Contract

| Board         | Product surface                                                          | Owning slice |
| ------------- | ------------------------------------------------------------------------ | ------------ |
| B00           | Newsreader/Inter, logo, mechanics icons, art taxonomy/provenance, tokens | 1            |
| A00           | Desktop rail, mobile bottom nav, responsive shell, immersive shell       | 2            |
| A16 + B01     | Dialogs, sheets, trays, pickers, popovers, save/undo/focus/motion        | 3            |
| A08           | Spell-first candidate; F1–F6 extend the same ActionFlow; atomic cutover  | 4, 8, 11, 15 |
| A01           | Login, public share, recovery, legal, error/revoked states               | 5            |
| A02–A03       | Multi-character roster, import/export, select, bulk/data actions         | 6            |
| A04 + A09     | Character creation and level-up                                          | 7            |
| A05–A07       | Five cockpit anatomies, resources, companions, conditions, effects       | 8            |
| A10–A12 + S01 | Multi-campaign roster, role-aware workspace, records, planner            | 9–10         |
| A13           | Encounter preparation, initiative, live play, pause, end, summary        | 11           |
| A14           | Compendium, bestiary, detail, add-to-character/campaign                  | 12           |
| S02           | Typed, versioned Homebrew Studio                                         | 13           |
| A15           | Account, preferences, data, admin, safeguards                            | 14           |

The atlas PNGs under `docs/design/tactical-codex-atlas/boards/` are design inputs only. They are never bundled into the app, cropped into fake assets, or treated as runtime UI.

## Delivery Model and File Ownership

- [ ] For each slice, the orchestrator creates a short worktree from fresh `origin/main` with `just wt-new tactical-codex-<nn>-<slice> feat`; after review and gates, rebase and integrate that small inert slice before starting work that depends on it.
- [ ] Before each slice, the orchestrator writes its detailed plan at `docs/superpowers/plans/2026-08-25-tactical-codex-<nn>-<slice>.md`, reviews it against this Wayfinder, then starts a fresh implementation worker with no inherited implementation session.
- [ ] Candidate presentation and candidate catalogues are imported only by `src/app/routes/tactical-codex-specimens.tsx` behind `import.meta.env.DEV || import.meta.env.MODE === "test"`. Production route code and `src/i18n/loaders.ts` must not import them, even behind a runtime flag.
- [ ] Each implementation worker owns only the exact candidate files named by its child plan, paired `src/i18n/tactical-codex/{en,it}/<family>.json` shards, colocated `specimen.tsx`, tests, scoped styles, deletion ledger, and changeset. It does not edit production routes/shell, `src/main.tsx`, `src/styles/folio.css`, shared primitives, the central specimen registry, or another slice's census file.
- [ ] Task 2 alone owns `src/app/tactical-codex/TacticalCodexShell.tsx`, `TacticalCodexRail.tsx`, `TacticalCodexBottomNav.tsx`, `TacticalCodexImmersiveShell.tsx`, `specimen-i18n.ts`, `src/app/routes/tactical-codex-specimens.tsx`, and the DEV/TEST-only router branch. The serial specimen integrator alone owns `src/app/tactical-codex/specimen-registry.ts`; Task 15 alone owns the production route tree, `AppShell.tsx`, live shell files, `src/main.tsx`, and global style activation.
- [ ] The asset owner alone owns Tactical Codex fonts, brand/icon APIs, provenance, and tokens. The design-system owner alone owns candidate adaptive overlays, B01 motion utilities, and their tests; neither edits the live legacy equivalents before cutover.
- [ ] Each feature worker owns one census fragment under `tests/e2e/surface-census/<family>.ts`. Test Wayfinder Task 7 alone owns `surface-census/index.ts`, `surface-manifest.ts`, `surfaces.ts`, graders/audit, and the schema; Test Task 8 alone owns visual/motion configs, specs, scripts, and commands. UI workers only consume those frozen interfaces.
- [ ] Feature styling is colocated in a CSS module or feature-owned stylesheet imported by that feature. New selectors never enter `src/styles/folio.css`.
- [ ] After every implementation worker, start a short cleanup worker that removes obsolete candidate/prototype files and writes `docs/superpowers/plans/deletions/tactical-codex-<nn>-<slice>.md` with exact live files, selectors, imports, and test candidates. Every test candidate is classified through Test Portfolio D1–D7; only durable outcome signals are replaced, while representation-only behavior is explicitly retired. It must not remove the current production owner early.
- [ ] Start a fresh reviewer with `superpowers:requesting-code-review`; fix High/Medium findings before rebasing the slice and integrating it to `main` as inert code.
- [ ] Before each inert integration, run the focused suite plus `just ci`, `pnpm visual:review`, and `pnpm visual:motion` when motion applies; compare the production manifest against the pre-slice manifest so no candidate JS/CSS/font/image/locale chunk is reachable. Obtain owner screenshot approval for that exact candidate commit before rebasing.
- [ ] Rebase the approved candidate on fresh `origin/main`, rerun the focused/composed gates, and compare curated-output hashes with the approved commit. If rendered output differs, recapture with `visual:review`/`visual:motion` and obtain renewed approval; otherwise record byte-equivalent evidence. Then push explicit `HEAD:main`, confirm the SHA, remove the worktree, and do not deploy the inert slice.
- [ ] Before each slice integration, the orchestrator adds a `PROGRESS.md` update to that slice's final commit stating exactly what is integrated, that it is DEV/TEST-only, and which dependency blocks activation. Do not describe inert code as shipped.
- [ ] Assign non-overlapping changeset names: `tactical-assets`, `tactical-shell`, `tactical-overlays`, `tactical-action-flow`, `tactical-access`, `tactical-roster`, `tactical-character-growth`, `tactical-cockpit`, `tactical-campaigns`, `tactical-campaign-records`, `tactical-encounters`, `tactical-compendium`, `tactical-homebrew`, `tactical-settings`, and `tactical-cutover`.

### Skill routing

- [ ] Superpowers exclusively owns lifecycle: discovery, child plan, worktree, TDD/debugging, fresh review, verification, rebase and integration. The design/QA skills below do not create a parallel delivery process.
- [ ] Use `impeccable` as the governing atlas-conformance, accessibility, responsive and motion critique for every UI slice; it owns design-system acceptance, not product/domain semantics.
- [ ] Use `design-taste-frontend` only for implementation-level composition, typography, density and anti-slop polish within the approved atlas; it may not invent a competing visual direction or tokens.
- [ ] Use `ui-ux-pro-max` only for interaction-pattern and usability heuristic review of navigation, forms, pickers and task flows; `impeccable` remains the final visual/accessibility authority.
- [ ] Use `image-to-code` only to extract and compare hierarchy, measurements, typography, color and responsive transforms from the approved boards to rendered output; it does not generate a new concept.
- [ ] Use `imagegen` only for owner-approved bitmap art under B00 provenance, never for vector marks/icons or text-bearing UI.
- [ ] Use `browser-qa` only for automated state traversal, behavior, accessibility and layout evidence; use `chrome:control-chrome` only for authenticated real-session navigation and owner screenshots. Never substitute the Codex browser for the Chrome gate.
- [ ] Use `web-design-guidelines` only for the independent standards/compliance review after slice behavior is green; findings return to the owning UI slice.
- [ ] Use `web-perf` only for post-fidelity Chrome performance/Core Web Vitals and interaction-cost measurement; it may tune delivery/rendering but not alter approved anatomy or domain behavior.
- [ ] Use `security-review` for access, sharing, destructive data, admin, campaign-role, and homebrew publish surfaces. Use `ponytail-review` on each cleanup/cutover diff.

### Cross-Wayfinder serial chokepoint registry

| Chokepoint                                                                      | Serial owner order                                                                          | Handoff gate                                                                                    |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `package.json`, `pnpm-lock.yaml`                                                | Test T3 → T4 → T8A → UI Task 1 → UI Task 15                                                 | Prior commit integrated; scripts/dependencies and lockfile green; next owner rebases            |
| `src/app/router.tsx`                                                            | UI Task 2 DEV/TEST branch → UI Task 15 complete production tree                             | Production route snapshot unchanged after Task 2; Task 15 owns the only public switch           |
| `src/app/tactical-codex/specimen-registry.ts`                                   | UI Task 2 create → serial specimen integrator after each slice → UI Task 15 delete          | Colocated specimen export reviewed; registry change contains no feature logic                   |
| `src/i18n/loaders.ts`, live `src/i18n/{en,it}/ui/*`                             | UI Task 15 only                                                                             | Candidate catalogues stay outside the production glob; parity and bundle proof before promotion |
| `playwright.config.ts`, `playwright.critical.config.ts`                         | Test Tasks 3 → 4                                                                            | Zero-retry and authenticated critical contracts frozen; UI never edits them                     |
| `surface-census/index.ts`, manifest/surfaces, surface graders                   | Test Task 7 bootstrap/freeze → Test Task 7 serial registrations/parity → UI Task 15 consume | Schema published before UI work; feature workers own fragments only; no second manifest         |
| `playwright.visual.config.ts`, `tests/visual/*`, `scripts/qa/*`, visual scripts | Test Task 8 only                                                                            | `visual:review` and `visual:motion` list and run with zero retries before UI Task 1 approval    |
| `.github/workflows/*`                                                           | Test Tasks 3 → 6 → 14                                                                       | Each workflow owner integrates and rebases; UI consumes gates and never edits workflows         |
| `PROGRESS.md`                                                                   | Integrated Automation producer → matching UI slice status → Automation X1 → UI Task 15      | One status owner at a time; inert means DEV/TEST-only, final means verified live candidate      |
| `docs/TEST_PORTFOLIO.md`                                                        | Test Tasks 1 → 7/8 → 10/14                                                                  | UI supplies D1–D7 evidence in deletion ledgers; Test Wayfinder alone reconciles the portfolio   |

- [ ] Test Task 7 freezes a bootstrap census schema/index without waiting for the full Tactical corpus; Test Task 8 builds the final visual/motion runners on that interface. UI fragments then populate the registry, so visual infrastructure precedes UI approval without a Test↔UI dependency cycle.
- [ ] B00 remains the first Tactical Codex implementation slice; completing Test Tasks 7–8 beforehand is test infrastructure, not a competing visual foundation.

## Dependency DAG and Waves

```text
Automation:  C1 spell kernel ─► U1 headless flow ───────────────► UI 4 spell visual
             F1..F6 headless family exits ──────────────────────► UI 8 family adapters
             A2 canonical session records ──────────────────────► UI 10 records/S01
             H1 typed/versioned homebrew ───────────────────────► UI 13 Homebrew/S02

UI Wave 0:   [1 B00 asset foundation]
                              |
UI Wave 1:          +---------+----------+
                    |                    |
               [2 A00 shell]       [3 A16/B01 primitives]
                    |                    |
                    +---------+----------+
                              |
UI Wave 2:   [4 spell ActionFlow]  [5 Access]  [6 Roster]
                              |
UI Wave 3:   [7 Growth] [9 Campaigns] [12 Compendium] [14 Settings]
                 [8 non-mechanical cockpit anatomy + F1..F6 adapters]
                                   |              |
UI Wave 4:               [10 Records/S01]   [13 Homebrew/S02]
                                   |
                     [11 Encounter + F1/F3/F4 adapters]
                                   |
UI Wave 5:              [15 atomic app-wide cutover]
```

- [ ] Wave 0 is strictly first; no UI slice starts before its assets, licenses, tokens, and provenance tests are accepted.
- [ ] After Wave 0, shell and primitives may run in parallel because their file ownership does not overlap.
- [ ] Task 4 waits for Tasks 1–3 plus the integrated Automation C1 spell vertical and Automation U1 headless flow contract. It does not precede, replace, or become a dependency of either automation slice.
- [ ] Wave 3 feature workers may run in parallel from the same fresh base when their candidate directories do not overlap. Integrate them one at a time after rebasing; only Task 15 may edit or delete legacy global CSS.
- [ ] Automation F1–F6 depend only on the Automation headless contracts, never on UI Task 4. Each family enters the Tactical Codex candidate only after its Automation exit gate and the matching UI adapter/review gate below; therefore the graph has no UI↔automation cycle.
- [ ] Task 10 waits for Task 9 and Automation A2's canonical session/record contract. Task 11 waits for Tasks 9–10, the canonical encounter model, and the admitted F1/F3/F4 UI adapters. Task 13 waits for Task 12 and Automation H1's typed/versioned Homebrew contract.
- [ ] The specimen/census integrator runs after each wave, not concurrently with feature workers. This keeps central dev/test files single-owned while making completed slices immediately inspectable without changing production routes.

### ActionFlow family admission gates

| Automation exit  | Candidate behavior admitted afterward                               | UI owner and proof                             |
| ---------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| C1 + headless U1 | Spell configure/target/observe/review/commit/result/undo            | Task 4; spell-only A08 specimen matrix         |
| F1               | Vitals, deterministic healing/damage, death/exhaustion observations | Task 8; Task 11 for NPC encounter presentation |
| F2               | Resource availability, alternative payment, recovery and caps       | Task 8 resource anatomy                        |
| F3               | Effect create/replace/stack/concentration/expiry/dispel             | Task 8; Task 11 for encounter effects          |
| F4               | Action economy, reactions, rest and clocks                          | Task 8; Task 11 for round/turn clocks          |
| F5               | Equipment, charges, attunement and item-granted actions             | Task 8 inventory anatomy                       |
| F6               | Legal-action discovery and semantic grouping across sources         | Task 8 action discovery anatomy                |

- [ ] A UI family adapter maps the reviewed headless view/events into the one Task 4 visual grammar; it may not create a reducer, request/result type, persistence call, availability cache, or translated identity.
- [ ] No family control appears in the candidate—even disabled—before its Automation exit. Task 15 waits for every required row; no family reaches a live call site earlier.

### Cross-program producer matrix

| UI task             | Automation producer                          | Frozen interface consumed                                                                              | Gate before UI integration                                                               |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1 Assets            | None                                         | B00 atlas/tokens/provenance contract                                                                   | Asset/license tests and Test Task 8 visual lane green                                    |
| 2 Shell/Home        | P1 + A1 for Home data; none for shell chrome | Canonical character summary and campaign capability/read client                                        | Producer exits recorded; no new listener/store; A00 matrix approved                      |
| 3 Primitives/Motion | None                                         | A16 task-surface semantics and B01 frame ledger                                                        | Test Tasks 7–8 schemas/commands frozen                                                   |
| 4 Spell ActionFlow  | K1 + C1 + headless U1                        | `SemanticCommand`, `ActionFlowState`, `ActionFlowView`, semantic events/answers                        | C1/U1 contract lanes green; DEV/TEST import proof; spell matrix approved                 |
| 5 Access/Public     | P1 plus existing Auth/share seams            | Canonical public character projection and existing auth capability                                     | P1 fixture/public-read proof and access security review                                  |
| 6 Roster            | P1                                           | Canonical character identity/build/material summaries and existing import/export seam                  | Six-fixture round trip, sync/offline proof, roster matrix approved                       |
| 7 Creation/Growth   | O1 domain, which consumes K1 + P1            | `CreationDraft`, locale-free resolution/view/events, atomic-create result                              | O1 headless/domain/persistence gates green; Task 7 alone owns React/i18n/screenshots     |
| 8 Cockpit           | P1 + headless U1 + F1–F6                     | `CharacterMaterialState`, `ActionFlowView`, each frozen family projection/event set                    | Corresponding F exit precedes each adapter; full cockpit matrix approved                 |
| 9 Campaigns         | A1                                           | Canonical campaign/membership/capability types and thin read clients                                   | A1 migration/Rules/listener gates green; role matrix approved                            |
| 10 Records/S01      | A1 + A2                                      | Canonical campaign refs plus session proposal/availability/RSVP/calendar/record views and commands     | A2 contract and persistence gates green; no second calendar store                        |
| 11 Encounters       | A1 + S1 + A2 + F1/F3/F4                      | Encounter aggregate/read client, shared-command receipt/revision, record append, admitted family views | Shared emulator/Rules and family gates green; encounter matrix approved                  |
| 12 Compendium       | K1 plus existing typed catalogue presenters  | Versioned `RuleDefinition`/provenance and SRD/private-pack presenter seam                              | Kernel codec and both composed/SRD-only gates green                                      |
| 13 Homebrew/S02     | H1 + K1                                      | Typed draft/version/provenance/library/share contract compiling to `RuleDefinition`                    | H1 validation/persistence/security gates green; Homebrew matrix approved                 |
| 14 Settings/Admin   | None beyond existing Auth/admin I/O          | Existing theme, locale, identity, sign-out, admin query/mutation capabilities                          | Retained behavior/security tests green; no unapproved account capability                 |
| 15 Cutover          | All rows above                               | Frozen aggregate of approved candidate exports; no new domain interface                                | All producer/UI gates, D1–D7 ledgers, full visual/motion matrix and owner approval green |

- [ ] Automation O1 owns only creation/growth domain, view data and atomic persistence; UI Task 7 exclusively owns its React flow, visual state, bilingual copy, responsive behavior and screenshots.

## Mandatory Slice-Plan Template

Every detailed slice plan must include these sections before implementation begins:

- [ ] `Consumes`: exact existing engine/view/store interfaces and prior Tactical Codex primitives.
- [ ] `Produces`: exact candidate components, specimen paths, eventual production routes, exports, i18n groups, census states, and deletion guarantees.
- [ ] `Does not own`: mechanics, persistence, rules, other route families, shared shell/primitives.
- [ ] `State matrix`: loading, empty, content, selected/editing, permission variant, recoverable error, offline/sync, busy, success, and destructive confirmation where meaningful.
- [ ] `RED`: focused unit/component/a11y tests and exact command that must fail for the intended reason.
- [ ] `GREEN`: minimum implementation, candidate-local deletions, reviewed final-cutover deletion ledger, focused tests, `pnpm i18n:check`, and build/typecheck.
- [ ] `Atlas comparison`: board panel, actual route/state, viewport, locale/theme, structural/type/spacing/color/control assessment, and accepted deviations.
- [ ] `Chrome proof`: authenticated navigation path, real-data setup, screenshot names, focus order, keyboard/touch checks, and teardown that leaves live data unchanged.
- [ ] `Review`: self-review, fresh reviewer, complexity deletion check, and changeset.
- [ ] If an anatomy or meaningful state is not resolved by the atlas/system grammar, pause before code, produce a detailed atlas addendum, and obtain owner visual approval; do not fill the gap with an improvised placeholder.

## Visual, Screenshot, and Motion Gates

### Deterministic automation matrix

- [ ] Every surface/state enters exactly one `tests/e2e/surface-census/<family>.ts` fragment with stable setup independent of translated copy.
- [ ] Minimum pairwise visual matrix for every changed layout:
  - IT dark, desktop `1440x900`.
  - EN light, desktop `1440x900`.
  - IT light, mobile `390x844`.
  - EN dark, mobile `390x844`.
  - Tablet `1024x768` in both themes/locales only where the layout changes at that breakpoint.
- [ ] Task 4 runs the spell vertical through all eight locale × theme × desktop/mobile combinations for closed, opening, payment, target, observation/save input, review, busy, success/effect, recoverable error, and undo. Each later F1–F6 adapter reruns all eight combinations for the states it adds; Task 15 reruns the complete combined matrix.
- [ ] Each family covers meaningful combinations of loading, empty, sparse, dense, long EN/IT content, offline, pending sync, sync error, permission denied, revoked/deleted, and reduced motion; avoid meaningless Cartesian duplication.
- [ ] `pnpm exec playwright test surface-audit` proves composable behavior/a11y/i18n/layout signal; `pnpm visual:review` captures curated states and `pnpm visual:motion` captures B01 frames through Test Task 8's final lane. Never create a second capture manifest.

### Image-to-code comparison

- [ ] For each slice, inspect the full source board at original resolution; do not crop or regenerate it.
- [ ] Capture the implemented route/state at the board's matching viewport and write `artifacts/visual-review/<candidate-sha>/<slice>/comparison.md` with a row for hierarchy, typography, spacing, color/material, controls/icons, responsive transformation, and intentional deviation.
- [ ] Put the board path, actual PNG path, result (`match`, `intentional deviation`, or `fix`), and evidence in every row. A `fix` blocks the slice.
- [ ] Review the side-by-side result at normal size and 200% zoom. Pixel snapshots guard regressions; human comparison guards semantic fidelity to the conceptual atlas.

### Chrome-authenticated owner gate

- [ ] Start the current slice locally, open its protected `/_specimens/tactical-codex/<family>` path in the user's Chrome, and preserve the user's existing Google session. If Chrome is signed out, pause and ask the user to sign in there; never inspect or copy cookies/local storage.
- [ ] Exercise one real multi-character account, multiple campaigns with player/DM roles, public share, compendium/bestiary, homebrew, live encounter, settings, and admin only if the logged-in account has that role.
- [ ] Capture curated PNGs named `<board>-<route>-<state>-<locale>-<theme>-<viewport>.png` into `artifacts/visual-review/<candidate-sha>/chrome/` and deliver the actual images in chat for phone review.
- [ ] Owner approval is by integrated slice SHA during build-out and by the atomic cutover candidate SHA at release. Any UI-affecting commit invalidates affected screenshots and requires recapture.

### B01 frame-by-frame motion gate

- [ ] For task surface entry, exit, interruption, card expand/collapse, save/sync, undo, and encounter-turn transition, capture six deterministic frames: `entry`, `mid`, `settled`, `interrupted`, `exit`, `reduced`.
- [ ] Assert desktop transition durations remain in the approved `120–160ms` band and mobile transitions in `140–220ms`; no layout-affecting animation may exceed the board contract.
- [ ] Verify focus moves on entry, stays trapped only for truly modal tasks, returns to the invoker on exit/interruption, and announces completion/error without duplicate live-region output.
- [ ] With `prefers-reduced-motion: reduce`, capture the final-state transition and prove transform/parallax/continuous decorative motion is absent.

## Wave 0 — B00 Asset Foundation

### Task 1: Licensed type, original identity, mechanics iconography, art provenance

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-01-assets.md`

**Owns:** `package.json`, `pnpm-lock.yaml`, new `src/styles/tactical-codex/foundation.css`, new `src/components/tactical-codex/brand/*`, new `src/components/tactical-codex/icons/*`, new `src/assets/tactical-codex/brand/*`, removal of `public/assets/prototype/*`, `docs/assets/ASSET_PROVENANCE.md`, asset tests. Production font imports, brand component, favicon, and install-icon replacement remain in Task 15.

- [ ] Baseline current fonts, logo sizes, icon consumers, PWA/install assets, PDF font dependencies, and every file under `public/assets/prototype/` before changing anything.
- [ ] Add licensed variable `@fontsource-variable/newsreader` and `@fontsource-variable/inter`; record upstream, version, license, and use in the provenance ledger. Keep a PDF-specific font only if the PDF renderer demonstrably requires it.
- [ ] Make Newsreader the candidate editorial/display face and Inter the candidate UI/data face through semantic tokens imported only by the specimen. Record exact Alegreya/Cinzel/Source Serif imports and packages for removal at Task 15; the live UI keeps them until cutover.
- [ ] Implement original, human-authored vector mark, wordmark, full lockup, compact lockup, and monochrome/current-color behavior. Generate candidate favicon and install sizes from that single geometry and verify at `16`, `24`, `32`, `64`, `192`, and `512px`; Task 15 swaps the public files.
- [ ] Implement original 24px mechanics glyphs for attack, spell, concentration, condition, action, bonus action, reaction, movement, rest, undo, save, damage, heal, target, resource, and encounter. Use stable semantic IDs and optical checks at `16/20/24/32px`; retain Lucide only for generic utility actions.
- [ ] Encode B00 art taxonomy and aspect-ratio/fallback rules: portrait `4:5`, campaign scene `16:9`, campaign emblem `1:1`, monster `4:5`, item `1:1`, spell glyph `1:1`, place scene `16:9`.
- [ ] Add provenance metadata types and UI badges for original, uploaded, SRD/public, private-pack, and generated assets. No raster enters production without source, license/permission, author/tool, date, content partition, and replacement policy in `docs/assets/ASSET_PROVENANCE.md`.
- [ ] For any approved portrait, campaign, monster, item, spell, or place bitmap created during execution, use the B00 art brief and `imagegen`, then record provenance and owner approval. Vector identity/mechanics assets are authored directly as original SVG; no third-party tracing or raster-to-vector shortcut.
- [ ] Inventory the ad-hoc Tactical Codex prototype without promoting its code, then delete `public/assets/prototype/` so documentation-only art is not copied into production builds. Record its route/component/style for Task 2 replacement; the approved atlas remains documentation.
- [ ] Record obsolete brand/icon helpers and representation tests, including `src/components/shared/d20-icosahedron.ts`, in the Task 15 deletion ledger; do not break the live brand before cutover.
- [ ] RED/GREEN tests cover font imports/license ledger, SVG uniqueness/viewBox/currentColor, icon registry completeness, PWA dimensions, provenance validation, and no prototype asset in the production bundle.
- [ ] Prove the production build does not contain candidate font CSS, specimen route, or candidate asset chunks. Run focused tests, `pnpm i18n:check`, `pnpm build`, `pnpm test:budget`, then the B00 comparison in the dev specimen.

## Wave 1 — Shared System

### Task 2: A00 canonical responsive shell

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-02-shell.md`

**Owns:** the exact Task 2 shell/specimen files listed in the serial registry, the DEV/TEST-only router branch, new `src/features/home/tactical-codex/HomeCandidatePage.tsx`, `HomeCharacterSummary.tsx`, `HomeCampaignSummary.tsx`, shell/home candidate i18n, tests and census. Task 10/13 export their own later Home cards; Task 15 alone composes them and switches production routes/shell.

- [ ] Make `/home` the eventual authenticated landing route and `/` redirect there at Task 15. In the specimen, desktop exposes exactly Home, Characters, Campaigns, Compendium, Settings in the persistent rail.
- [ ] Mobile exposes exactly Home, Characters, Campaigns, Compendium in the bottom bar; Settings remains in the account menu. Character routes anchor Characters, campaign/session/encounter routes Campaigns, `/homebrew` Compendium, and settings/admin Settings.
- [ ] Add the A00 immersive-shell contract for encounter routes: compact context, explicit return to campaign, live status, emergency/offline affordances, and no accidental global-nav escape during a critical task.
- [ ] Preserve lazy route loading, auth/error boundaries, focus-on-navigation, scroll restoration, safe-area insets, PWA banners, sync states, command palette, and public-shell behavior.
- [ ] Implement Home as an account-level overview of multiple characters, multiple campaigns, current encounter work, compendium entry, pending sync, and meaningful empty/recovery states using P1/A1 view models. Do not show session-planner or Homebrew rows until Tasks 10/13 export approved real views for Task 15 composition.
- [ ] Replace the ad-hoc `/_prototype/tactical-codex` route with the controlled `/_specimens/tactical-codex/*` DEV/TEST entry, then delete `src/app/routes/tactical-codex-prototype.tsx` and `src/styles/tactical-codex-prototype.css`.
- [ ] Delete any superseded candidate shell/prototype code now; record `Topbar`/`MobileBottomNav`/footer/realm CSS and old three-realm tests for Task 15 removal after equivalent A00 behavior is proven.
- [ ] Verify `320–389`, `390`, `768`, `1024`, `1280`, and `1440px`, keyboard landmarks, active-route semantics, long IT labels, offline status, and authenticated Chrome navigation.

### Task 3: A16 adaptive primitives and B01 motion infrastructure

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-03-primitives-motion.md`

**Owns:** new `src/components/tactical-codex/ui/*`, new `src/components/tactical-codex/workflow/*`, shared candidate-overlay tests, motion-frame tests, `tests/e2e/surface-census/overlays.ts`. Existing live primitives remain untouched until Task 15.

- [ ] Define one semantic task-surface API that renders a desktop tray/popover or mobile bottom sheet without changing workflow state, validation, focus ownership, or callbacks.
- [ ] Standardize blocking dialog, destructive confirmation, searchable picker, payment/input sheet, detail preview, command palette, toast/undo, save/sync indicator, tooltip, popover, and nonmodal disclosure.
- [ ] Encode B01 motion tokens, interruption behavior, focus return, live-region announcements, scroll lock, safe-area padding, reduced motion, and touch targets.
- [ ] Re-express the behavior currently covered by `ModalShell`, `ConfirmDialog`, picker shells, `ModalTabSwitcher`, and ad-hoc modal heads through the smallest candidate primitive; keep Radix as the accessibility base.
- [ ] Delete duplicate candidate modal/sheet code immediately. Record live wrapper, CSS, and representation-test removals for Task 15 and add a post-cutover import guard for retired wrappers.
- [ ] Prove nested overlay behavior, Escape/backdrop policy, mobile keyboard/viewport resize, long localized content, screen-reader names/descriptions, and all six B01 frames.

## Wave 2 — Highest-Risk Workflows and Entry Surfaces

### Task 4: A08 spell-first ActionFlow visual state machine

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-04-action-flow.md`

**Depends on:** UI Tasks 1–3 and the integrated Automation C1 + headless U1 spell contract. **Owns:** new `src/features/actions/tactical-codex/*`, a spell-only DEV/TEST specimen adapter, ActionFlow candidate i18n/tests/census. **Does not own:** a command protocol, rules, persistence, live tab call sites, or non-spell family adapters.

- [ ] Render the exact headless spell-flow state and dispatch only the semantic events/observations exported by Automation U1. The visual state machine owns presentation phase, focus and motion only; it does not reinterpret transitions or introduce a second reducer/request/result protocol.
- [ ] Cover the C1 spell vertical only: cantrip/at-will, slot or charge payment, upcast choice, target selection, attack/save/damage observations, formula review without rolling, concentration/effect consequence, insufficient payment, commit busy/success, recoverable error, idempotent retry, and undo.
- [ ] Map inspect → configure → target/observe → review → commit → result/undo 1:1 from the headless view. Skip absent semantic steps; never infer them from spell prose or translated labels.
- [ ] Mount the candidate exclusively at the protected `/_specimens/tactical-codex/action-flow/spell` DEV/TEST path. Do not import it from `SpellsTab`, `PlayTab`, `SpellCard`, any production route, or any existing modal/flow call site.
- [ ] Classify the live tests for `MechanicsCastModal`, `EngineCastFlow`, `EngineActionFlow`, `engine-spell-gate`, `CastLevelModal`, `PaymentPickerModal`, and `CombatResolver` through Test Portfolio D1–D7. Add candidate tests only for durable C1/U1 outcomes; reject component shape/protocol-carrier assertions as retired representation and keep every old test until Task 15 satisfies D6/D7.
- [ ] Assert one authoritative commit/effect/undo result, submit locking, input preservation after recoverable error, focus return, announcements, offline-safe headless behavior, and no UI write to slots, charges, effects, economy, or persistence.
- [ ] Prove the spell-only eight-combination A08 matrix and all six B01 frames. Passing Task 4 authorizes only the inert spell specimen, not any public or non-spell ActionFlow rollout.

### Task 5: A01 access, public share, legal, recovery

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-05-access.md`

**Owns:** new candidate access/public presenters under `src/features/access/tactical-codex/*`, auth/public error states, access i18n/tests/census. Existing `/login`, `/legal`, and shared-character routes switch only in Task 15.

- [ ] Implement logged-out, sign-in busy/error, offline, account recovery guidance, public shared character, revoked/deleted share, legal/attribution, route error, 404, and crash-report entry states.
- [ ] Keep Google auth behavior unchanged and test auth boundaries without bypassing authorization semantics. Use the user's Chrome for the final real Google sign-in check.
- [ ] Delete superseded candidate access code now; record old login/public-share/legal CSS and page-specific duplicate chrome for Task 15 deletion.

### Task 6: A02–A03 multi-character roster, import, and data actions

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-06-roster.md`

**Owns:** new `src/features/roster/tactical-codex/*`, roster/import i18n/tests/census, candidate roster-owned task surfaces.

- [ ] Cover zero, one, many, dense, selected, multi-select, loading, import preview/conflict/error/success, export, duplicate, share, archive/delete confirmation, pending sync, and corrupt-document recovery.
- [ ] Preserve multiple characters per account, bulk-action semantics, live-user fixture compatibility, and original portrait/fallback provenance.
- [ ] Delete obsolete candidate roster variants now; record the live roster card, native-number, duplicate CTA, import modal, and roster CSS/tests for Task 15 deletion once behavior is covered.

## Wave 3 — Core Product Families

### Task 7: A04/A09 character creation and level-up

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-07-character-growth.md`

**Depends on:** integrated Automation O1 domain/headless creation contract; O1 owns no React, i18n or screenshots. **Owns:** new Tactical Codex presenters under `src/features/creation/tactical-codex/*` and `src/features/leveling/tactical-codex/*`, shared candidate wizard pieces, growth i18n/tests/census.

- [ ] Implement start/resume, every required step, search/picker/detail, validation, long-content, rolled-value entry without rolling, review, save busy/error/success, leave confirmation, and level-up/multiclass/subclass branches.
- [ ] Render O1's locale-free `CreationDraft` resolution/view/events and atomic-create result; reuse A16 pickers and ActionFlow-compatible review language without rebuilding domain rules or persistence in React.
- [ ] Delete duplicate candidate wizard pieces in the slice; record the live duplicate ability editor, gallery/picker wrappers, progress chrome, wizard CSS, and representation tests for Task 15 deletion.

### Task 8: A05–A07 character cockpit and five anatomies

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-08-cockpit.md`

**Depends on:** UI Tasks 1–4 for grammar; non-mechanical anatomy may start after them, while each mechanic-bearing adapter waits for its matching Automation F1–F6 exit. **Owns:** new `src/features/character/tactical-codex/*` excluding Task 4's visual machine, candidate character-specific task surfaces, cockpit i18n/tests/census.

- [ ] Implement Play, Spells, Inventory, Features, and Bio as five distinct anatomies within one cockpit grammar on desktop/mobile.
- [ ] Cover HP/dying/death saves, action economy, resources, conditions, concentration, companions/forms, effects, rests, inventory charges, prepared spells, custom notes, edit/read-only/public variants, loading/offline/sync/error, and long bilingual content.
- [ ] Admit F1–F6 controls only through the family gate table: each maps its headless view/events into Task 4's visual grammar and receives a fresh focused plan, worker, reviewer, eight-combination state proof, and deletion ledger. No family clones or extends the protocol in React.
- [ ] Route every admitted mechanic-bearing action through that one candidate grammar; UI may display but never mirror authoritative vitals, economy, resources, effects, inventory, or campaign state.
- [ ] Delete obsolete candidate variants now; record live rails, profile jewel, duplicate card editors/launchers, inactive “Attive” controls, per-tab modal clones, cockpit CSS, and representation tests for Task 15 deletion.

### Task 9: A10–A11 campaigns and role-aware workspace

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-09-campaigns.md`

**Owns:** `src/features/campaigns/tactical-codex/CampaignsCandidatePage.tsx`, `CampaignWorkspaceCandidatePage.tsx`, and only `tactical-codex/{roster,workspace,invites}/*`, plus campaign i18n/tests/census. Task 10 exclusively owns `tactical-codex/records/*`; Task 11 exclusively owns `tactical-codex/encounters/*`; existing routes remain mounted until Task 15.

- [ ] Cover zero/one/many campaigns, create/join/invite, invalid/expired invite, player/DM/owner permissions, party roster, member sheet, empty/dense workspace, pending sync, offline, permission error, and campaign art/fallback provenance.
- [ ] Preserve multiple campaigns per account and one capability model per role; hiding a control is never the authorization boundary.
- [ ] Delete candidate-local duplicates now; record stale campaign snapshot presenters, duplicate player/DM surfaces, campaign modal/card CSS, and UI permission mirrors for Task 15 deletion after canonical role tests pass.

### Task 12: A14 compendium and bestiary

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-12-compendium.md`

**Owns:** new `src/features/compendium/tactical-codex/*`, compendium i18n/tests/census, candidate compendium-specific art presenters.

- [ ] Cover browse/search, each content kind, bestiary, filters/facets, virtualized dense results, no result, loading/lazy locale load, detail, source/provenance, public/private pack seam, and add-to-character/campaign entry points.
- [ ] Preserve SRD-only behavior and lazy monster catalogues; mechanics display comes from typed presenters, never localized prose parsing.
- [ ] Delete duplicate candidate picker/detail chrome now; record live picker shells, codex chrome, monster/item frames, and compendium CSS/tests for Task 15 deletion.
- [ ] Run both `just ci` and `just ci-srd-only` for this slice.

### Task 14: A15 existing settings, account, and administration

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-14-settings.md`

**Owns:** new `src/features/account/tactical-codex/*`, candidate account-menu integrations, settings/admin i18n/tests/census.

- [ ] Cover only shipped settings capabilities: EN/IT language, dark/light/system theme, signed-in identity, sign-out, and the conditional admin entry. Verify the presentation under reduced motion, offline and narrow/zoom states without inventing a new preference or account operation.
- [ ] Cover only shipped admin capabilities: role denial, overview metrics, user/character/campaign search, loading/empty/error, expand/drill-down, block/unblock, existing typed-email administrator deletion, read-only character view, example-character loader, and bug inbox including unavailable GitHub reconciliation.
- [ ] Account-level export-all, import-all and delete-account plus new install/about/cache controls are explicitly out of scope until separately approved; do not render placeholder or disabled rows for them.
- [ ] Keep existing admin mutations capability-gated and confirmed; never expose secrets, weaken auth/rules, or generalize them into self-service account controls.
- [ ] Delete candidate-local preference duplicates now; record the live settings dropdown/page/admin CSS and duplicate controls for Task 15 deletion.

## Wave 4 — Campaign Depth and Authored Content

### Task 10: A12/S01 campaign records and session planner

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-10-campaign-records.md`

**Depends on:** UI Task 9 and the integrated Automation A2 canonical session-planner/record contract. **Owns:** candidate chronicle, sessions, notes, treasury, and planner/calendar presenters under `src/features/campaigns/tactical-codex/records/*`, paired i18n/tests/census; consumes canonical campaign records.

- [ ] Cover empty/populated chronicle, session create/edit/reorder, calendar month/list, conflict/error, shared notes collaboration, treasury, save/sync/offline, permissions, destructive confirmation, and long bilingual records.
- [ ] Render and dispatch only through Automation A2's typed proposal, availability, RSVP, session, calendar and record seams; do not retain mutable member-sheet snapshots or invent a second calendar store/protocol.
- [ ] Delete superseded candidate record editors now; record only live `Sessions`, chronicle, notes, treasury presenters/CSS for Task 15 deletion. Snapshot/persistence adapters remain Automation A2's deletion ownership.

### Task 11: A13 immersive encounter lifecycle

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-11-encounters.md`

**Depends on:** UI Tasks 9–10, the canonical Automation encounter model, and the Task 8 adapters admitted only after Automation F1/F3/F4. **Owns:** candidate encounter and immersive-route presenters under `src/features/campaigns/tactical-codex/encounters/*`, encounter i18n/tests/census; consumes canonical records and the one ActionFlow visual grammar.

- [ ] Cover prepare, bestiary/custom combatant picker, initiative input without rolling, ready, live round/turn, target/HP/condition/effect update, pause/resume, reconnect/conflict, end confirmation, summary/chronicle, and empty/error permissions.
- [ ] Send encounter vitals, effects, round/turn clocks and observations only through the admitted F1/F3/F4 headless adapters; do not add an encounter-specific command protocol or state mirror.
- [ ] Implement the A00 immersive shell on desktop/mobile with explicit return, current campaign/encounter context, offline/reconnect safety, and B01 turn-transition frames.
- [ ] Delete candidate encounter duplicates now; record live `party-encounter`/global-combat presentation paths, `encounter.css`, presentation-local mirrors and representation tests for Task 15 deletion. Canonical/persistence mirrors remain with their Automation owner.

### Task 13: S02 typed and versioned Homebrew Studio

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-13-homebrew.md`

**Depends on:** UI Tasks 3 and 12 plus the integrated Automation H1 typed/versioned Homebrew contract. **Owns:** new `src/features/homebrew/*`, the inert `/homebrew` candidate route component, homebrew i18n/tests/census; consumes H1 and compendium presenters.

- [ ] Cover list/search/filter, zero/draft/published/archived, create/edit/duplicate/preview/validate/version/publish/archive/delete, unsaved leave, conflict, schema migration error, offline/sync, and source/provenance states.
- [ ] Support only approved typed source kinds and stable IDs; homebrew never mutates SRD data or enters public `src/data` as licensed content.
- [ ] Render and dispatch only through Automation H1's compile, validate, version, provenance, library and sharing seams; do not create a UI schema, blob/prose validator, parallel persistence client, or second `RuleDefinition` compiler.
- [ ] Reuse A16 and A14 presentation seams. Delete candidate-local duplicates now and record live ad-hoc custom creation presenters for Task 15 deletion; Automation H1 owns deletion of prose/blob validators, persistence adapters and compilers.

## Wave 5 — Census, Deletion, and Atomic Cutover

### Task 15: Whole-app integration and release candidate

**Detailed plan:** `docs/superpowers/plans/2026-08-25-tactical-codex-15-cutover.md`

**Depends on:** UI Tasks 1–14 and their approved screenshots; integrated Automation C1 + headless U1, every required F1–F6 exit/UI adapter, A2, H1, and the canonical campaign/encounter handoffs. **Owns:** central production route/shell/style activation, census aggregation, all reviewed legacy deletion ledgers, specimen-scaffold deletion, screenshot packaging, release docs/changeset; it does not redesign feature slices.

- [ ] Wire completed route components atomically: `/home`, existing character/campaign/compendium/settings/public routes, `/campaigns/:campaignId/sessions`, `/campaigns/:campaignId/encounters/:encounterId`, and `/homebrew` with correct A00 anchors and lazy boundaries.
- [ ] In that same commit, replace every live spell and admitted F1–F6 action call site with the one reviewed ActionFlow visual grammar over the headless protocol. No call site, shell segment, overlay or route may switch in an earlier task.
- [ ] Promote paired candidate catalogues into domain-owned `src/i18n/{en,it}/ui/*.json` shards, remove the specimen-only locale loader/tree, and prove EN/IT key parity before route activation.
- [ ] Prove every route, nested workflow, role, meaningful state, theme, locale, viewport, offline condition, and reduced-motion branch appears in the census or has a written reason it is behavior-only.
- [ ] Rerun the full combined A08 matrix—not only the Task 4 spell subset—across every admitted F1–F6 state, all eight locale/theme/desktop-mobile combinations, and all six B01 motion frames.
- [ ] Apply every reviewed slice deletion ledger in the same cutover: remove replaced global selectors, legacy presenters, adapters, prototype assets, old font packages/imports, stale representation tests, and obsolete document claims. Delete `tactical-codex-specimens.tsx` and all specimen-only registration/capture scaffolding; keep only canonical production modules and tests.
- [ ] Reconcile `DESIGN.md`, architecture/status owners, user help, and release notes to the implemented candidate rather than duplicating state in a new permanent UI document.
- [ ] Run `pnpm i18n:check`, focused unit suites, `pnpm exec playwright test surface-audit`, all retained behavioral/mobile suites, `pnpm visual:review`, `pnpm visual:motion`, `pnpm test:rules` when a producer's persistence seam changed, `just ci`, and `just ci-srd-only`.
- [ ] Create the short cutover worktree from fresh `origin/main`, activate the already-integrated inert modules, apply deletions, rerun both composed gates, and generate the full Chrome-authenticated screenshot package plus image-to-code comparison reports for the exact cutover commit.
- [ ] Do not integrate until the owner approves the curated screenshots in chat. A rejected frame returns only the owning slice to implementation, cleanup, review, and recapture.
- [ ] Rebase the approved cutover commit on fresh `origin/main`, rerun gates, push explicit `HEAD:main`, and confirm the SHA. Production continues to serve the prior UI until GitHub Actions deploys that complete cutover SHA; never publish an inert intermediate slice or partial route switch.
- [ ] Trigger/observe the GitHub Actions deployment only under the repository's explicit per-change deployment authorization, then smoke-test production in authenticated Chrome and verify the deployed SHA, offline boot, navigation, ActionFlow, campaign/encounter, compendium, and settings.
- [ ] If deployment smoke testing fails, stop rollout through the documented release procedure; do not hot-patch a mixed system in production.

## Completion Definition

- [ ] B00 assets are original/licensed, provenance-complete, correctly partitioned, and absent from runtime when documentation-only.
- [ ] A00 is the only shell, A16 the only overlay grammar, B01 the only motion grammar, and A08 the only mechanic-bearing action flow.
- [ ] Every atlas board A00–A16, B00–B01, S01–S02 maps to implemented routes/states and approved screenshots.
- [ ] Multi-character, multi-campaign, campaign roles, session planning, encounter play, bestiary, homebrew, settings/admin, public access, and all significant dialogs are represented on desktop/mobile, EN/IT, dark/light.
- [ ] No legacy/new hybrid, duplicate state owner, duplicate CTA, placeholder asset/copy, stale representation test, or replaced CSS/component remains.
- [ ] Behavioral, accessibility, i18n, offline, bundle, rules where relevant, SRD-only, visual, motion, Chrome-authenticated, and owner screenshot gates are green for one rebased candidate SHA.
- [ ] Documentation owners describe the shipped system, release history records the cutover, and production deployment—if authorized—matches that exact SHA.
