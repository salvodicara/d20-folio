# `v2` architecture reset against the steering — implementation plan (2026-09-03)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile every architecture document on `v2` with `PRODUCT.md` §Steering, give every
module the merge carried onto `v2` a named fate, and delete now what nothing reads — before any
dice code is written.

**Architecture:** Documents only, plus deletions. The target engine (log-first, entity-generic,
undoable reducer) stays; its scope is bounded to the four acceptance stories, the three campaign
automation levels become a property of outcome application, rolls become log actions with
provenance, and the shared encounter log is the campaign document. Superseded programs (K1,
Wayfinder, program supervisor, migration phases P2–P5, the old end-to-end suites) are retired
from the documents and, where nothing reads them, from the tree.

**Tech Stack:** Markdown, git, `just ci` (typecheck, lint, Vitest fast+slow, Functions, build).

**Spec:** `PRODUCT.md` §Steering (owner, 2026-09-03); the owner's standing rule "no dead weight:
everything present has a reason and is optimal; when the conditions change, the architecture
changes"; `docs/superpowers/plans/2026-09-03-v2-next-session-handoff.md` → "First task".

## Global Constraints

- `main` is production and is never touched; every commit lands on `v2` only (push
  `HEAD:refs/heads/v2`); no deploy, no release.
- Conventional Commits, owner sole author, one `.changeset/*.md` per commit, the owning document
  reconciled in the same commit; never `--no-verify`.
- Public documents carry no product-identity term (the partition guard
  `tests/unit/content-pack-partition.guard.test.ts` scans `docs/**`); the one sanctioned
  reference is the nominative "Baldur's Gate 3". Private fixtures are named by role only.
- Nothing is deleted "because it looks complete": every deletion below cites the evidence (zero
  readers) recorded in the inventory of task 1. What is still read gets a fate, not a deletion.
- No product code and no screens in this plan; `just ci` green at the end (composed mode) and
  `just ci-srd-only` green because `functions/` and `scripts/` change.

## Evidence (inventories of 2026-09-03, `v2` at `90a4d8e`)

Reverse import graph over `src/`, `tests/`, `scripts/`, `functions/` with an app-entry
reachability walk from `src/App.tsx` + `src/main.tsx`:

| Module                                                                                            | Lines  | Readers                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/combat/**` (P2 prototype)                                                                | 2,657  | its 9 tests + 2 helpers only; unreachable from the app                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/lib/combat-io.ts`                                                                            | 101    | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/data/combat/prototype-catalogue.ts`                                                          | 277    | combat tests, `combat-variants.test.ts`, the coverage helper                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/lib/mechanics-*.ts`, `mechanic-occurrence*.ts` (kernel)                                      | 29,301 | production through 7 entry modules (`mechanics-world-store`, `-world`, `-transcription`, `-coordinator`, `-command`, `-program-effects`, `-action`) read by `stores/characterStore.ts`, `features/character/{useMechanicsCast,useMechanicsPulse,rest-world-boundary,engine-undo}.ts`, `PlayTab`, `EngineActionFlow`, the spells engine flows, `party-world-lease.ts`, `ResourceConversions.tsx`; 47 test files; `mechanics-trigger.ts` (49 lines) has one test and no other reader |
| `src/lib/command/**` (K1)                                                                         | 1,456  | 2 tests; `scripts/build-functions.ts` bundles it into `functions/lib/command-kernel.cjs`; `functions/src/index.ts` exports wrappers no handler calls; orphan types `src/types/{command,rule-definition,effect-instance}.ts`                                                                                                                                                                                                                                                        |
| `scripts/program-supervisor/{state,runtime,cli}.ts`                                               | 4,731  | 3 tests + 4 `package.json` scripts no hook, workflow or document invokes                                                                                                                                                                                                                                                                                                                                                                                                           |
| `scripts/program-supervisor/{worktree.ts,adapter-preflight.sh,bootstrap-worktree.sh}`             | 176    | `justfile` (`wt-new`, `wt-rm`), `CLAUDE.md`, `docs/WORKTREES.md`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `scripts/migrate-custom-identity.ts`, `migrate-character-parents.ts`, `migrate-item-resources.ts` | 2,473  | their unit tests + one emulator test; manual invocation on `main` only (`docs/RELEASE.md`)                                                                                                                                                                                                                                                                                                                                                                                         |
| `parseLegacyCombatChild`, `applyLegacyCombatToSession`                                            | —      | `migrate-character-parents.ts` and tests only; `architecture-direction.guard.test.ts` fences them                                                                                                                                                                                                                                                                                                                                                                                  |
| `scripts/migrate-shared-notes.ts`, `backfill-*.ts`, `drop-playerhandle.ts`                        | 730    | tests only; whether they are spent on production is provable only from `main`                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/lib/dice-formula.ts`, `src/types/dice-formula.ts`, `integer-expression.ts`, `d20-test.ts`    | 2,178  | production: `stores/characterStore.ts → lib/resources.ts`; `CombatResolver.tsx → combat-test-context.ts → d20-test.ts`; the kernel                                                                                                                                                                                                                                                                                                                                                 |
| `src/lib/automation-corpus.ts`, `automation-compiler.ts`                                          | 1,158  | tests only, including the guards of `docs/AUTOMATION_COVERAGE.md` (root and pack twin)                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/lib/cost-engine.ts`                                                                          | 298    | production via `mechanics-command.ts`; type-only from `src/data/types.ts`                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tests/e2e/*.spec.ts` (62 specs, 386 tests)                                                       | —      | `verify.yml` on pushes to `main` only; no workflow runs on `v2`; `just ci` never runs them                                                                                                                                                                                                                                                                                                                                                                                         |
| `tests/e2e/a11y*.spec.ts` + `surfaces.ts` + `surface-census/`; `tests/visual/**`                  | —      | the accessibility sweep and the owner's screenshot lane the steering keeps                                                                                                                                                                                                                                                                                                                                                                                                         |

Randomness in `src/`: ids (`crypto.randomUUID`), one invite-code token (`campaign-io.ts`), one
character-generation seed (`quickbuild-random.ts`), one id fallback (`diagnostics-io.ts`). No dice.

## Fates (recorded in the stage-1 plan by task 9)

| Module                                                                                                                                    | Fate                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/combat/**`, `src/data/combat/prototype-catalogue.ts`                                                                             | **keep** — the base of the dice seam (stage 1) and of the story reducer (stage 3); the prototype catalogue is the test catalogue until stage 3                      |
| `src/lib/combat-io.ts`                                                                                                                    | **delete now**; stage 4 writes the append/subscribe/checkpoint adapter it needs                                                                                     |
| mechanics kernel (31 files)                                                                                                               | **dies at stage 6** with the old play surfaces that read it; frozen now: a guard pins its importer set so no new reader appears; `mechanics-trigger.ts` deleted now |
| K1 `src/lib/command/**` + Functions bundle + wrappers + orphan types                                                                      | **delete now**                                                                                                                                                      |
| program supervisor `state/runtime/cli` + tests + npm scripts                                                                              | **delete now**; the worktree helpers move to `scripts/worktree/`                                                                                                    |
| P1/P3 migration scripts + legacy readers + their tests and fence                                                                          | **delete now on `v2`** (they run from `main`; `main` deletes its own copies after its deploy, ADR-0009)                                                             |
| older one-off scripts (`migrate-shared-notes`, `backfill-*`, `drop-playerhandle`)                                                         | **keep until `main` proves them spent**; then deleted on `main` and cherry-picked                                                                                   |
| `dice-formula`, `integer-expression`, `d20-test`                                                                                          | **replaced by the dice seam (stage 1)**; die at stage 6 with their readers                                                                                          |
| `automation-corpus`, `automation-compiler`, `docs/AUTOMATION_COVERAGE.md`                                                                 | **replaced at stage 3** by the derived coverage (spec §10); the knowledge they guard is salvaged as typed data                                                      |
| `cost-engine.ts`                                                                                                                          | dies at stage 6 with the kernel; `CostSpec` stays as data                                                                                                           |
| old end-to-end specs (60 of 62)                                                                                                           | **delete now**; a11y sweep and the screenshot lane stay and are rebuilt screen by screen from stage 6                                                               |
| Wayfinder/K1/supervisor/P2-prototype plans and status records, Phase-2 handoff, agent-first operating model, `docs/AUTOMATION_HANDOFF.md` | **delete now** (git history is the history role)                                                                                                                    |
| migration program (`2026-09-02-total-combat-automation-migration.md`)                                                                     | **keep as history**; P2–P5 marked superseded, survivors folded into stages 1–4 and 7                                                                                |

---

### Task 1: Reconcile the target spec and the authoring spec with the steering

**Files:**

- Modify: `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` (§0, §1, §3.1,
  §3.2, §4, §7, §8, §12, §14, header)
- Modify: `docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md` (header, §1.3, new §6)

- [ ] **Step 1: Header and §0.** Status becomes "reconciled to `PRODUCT.md` §Steering
      2026-09-03; owner of the engine target for stages 1–4 of
      `docs/superpowers/plans/2026-09-03-new-app-stage-1.md`". §0 states that the three
      executors are replaced by one reducer, that the scope is the four acceptance stories, and
      that the migration program's P2–P5 are superseded by the stages.
- [ ] **Step 2: §1 invariants.** Add: (a) the three campaign automation levels `full-auto`,
      `propose-and-confirm`, `log-only` are a table setting read by the reducer when it applies
      outcomes; (b) the DM's last word: `override` and `undo` exist on every surface and every
      action; (c) every roll is a `roll` action with formula, faces, total, seed, roller, source
      (`app | manual`) and `hidden`; (d) `campaigns/{id}/encounters/{eid}` is the shared document
      of play and the source of the recap and chronicle.
- [ ] **Step 3: §3.1 actions.** Add the `roll` kind (fields as in ADR-0010) and the `Answer`
      form `{ roll: ActionId }` for `d20` and `dice` inputs. §3.2 gains the paragraph "Outcome
      application by automation level": `full-auto` applies transitions; `propose-and-confirm`
      records the action as `proposed` until a `confirm` by the DM (or the actor when the DM
      allows) applies it; `log-only` records the receipt and applies nothing — stage 3 builds
      the first and the third, stage 6 the confirm surface.
- [ ] **Step 4: §4 and §7 bounded.** Split the vocabulary and the 22 hard cases into three
      tiers: **stage 3** (what stories 1 and 2 need: move, weapon attack, cantrip, levelled area
      save spell, monster multiattack, conditions, concentration, damage and 0 HP, opportunity
      attack window, override, undo, automation levels), **later stage** (Hunter's Mark, Sneak
      Attack, Shield, Counterspell, readied actions, summons, auras, transforms, Extra Attack,
      items, rests, contested actions, death saves, Legendary and Recharge), **out** (nothing
      is out; a later tier is scheduled by the jobs table). Keep the walkthrough text; add the
      tier in front of each case.
- [ ] **Step 5: §8 test strategy.** Replace the E2E row with "Accessibility sweep (axe, one
      spec) and the owner's screenshot lane; no end-to-end journeys on `v2`" and set the gate
      target "under 15 minutes". §12: mark the constitution and `CLAUDE.md` items as done on
      2026-09-03; §14: replace "Two active agents" with "Scope creep beyond the stories →
      the stage plan's tier list; a mechanic outside the tier is `later`, never built early".
- [ ] **Step 6: Authoring spec.** Header status "v1, bounded 2026-09-03 to the stage-3 tier";
      §1.3: a `d20` or `dice` input is answered by a `roll` action id; add §6 "Vocabulary tiers"
      naming which triggers, costs, steps and lifetimes stage 3 implements and which wait.
- [ ] **Step 7: Commit** with changeset `v2-spec-reconciled.md` ("docs(spec): reconcile the
      combat target and authoring specs with the steering").

### Task 2: Amend the ADRs and add ADR-0010 and ADR-0011

**Files:**

- Modify: `docs/adr/0001…0007` (status → `accepted (owner steering 2026-09-03)`; dated
  amendment paragraph each), `docs/adr/README.md`
- Create: `docs/adr/0010-dice-seam-rolls-are-log-actions.md`,
  `docs/adr/0011-campaign-automation-levels.md`

- [ ] **Step 1: Amendments.** 0001: scope bounded to the stories; the reducer applies outcomes
      by automation level (ADR-0011). 0002: `roll` is an action; hidden rolls live in the same
      log (concealed by presenters, ADR-0010). 0003: the kernel dies at stage 6 with its readers;
      the importer guard freezes it. 0004: K1 deleted on `v2` on 2026-09-03; the program
      supervisor retired the same day. 0005: the threat model explicitly includes reading hidden
      faces from the shared document (trust at the table). 0006: vocabulary tiers. 0007: the
      `v2` gate = unit + rules + golden replays + one a11y sweep + the screenshot lane; no e2e;
      under 15 minutes. 0008, 0009 unchanged but accepted.
- [ ] **Step 2: ADR-0010** (Nygard format): rolls are `roll` actions with formula (Foundry
      grammar subset: `NdS`, `kh`/`kl`, ± integers), faces, total, `seed`, `source`, `hidden`,
      `roller`, `purpose`; randomness lives only in `src/lib/dice.ts`; `app` rolls derive faces
      from the seed with a pure generator so every client verifies them and the fold rejects a
      tampered roll; `manual` rolls carry `seed: null`; `hidden` = faces visible to the DM and
      the roller (the pattern of Roll20 `/gmroll` and Foundry "GM Roll"), never hidden from the
      roller (constitution §2.2). Alternatives: faces inside the intent (rejected: no log line,
      no propose-and-confirm); a DM-private document for hidden faces (rejected: the fold would
      diverge between clients; no server to filter).
- [ ] **Step 3: ADR-0011**: the three levels as a table setting (`table:settings`), applied at
      outcome application; the DM changes it mid-session; `override`/`undo` on every action.
      Alternative rejected: a per-mechanic flag (the owner's line is per campaign).
- [ ] **Step 4: README table** updated; commit with changeset `v2-adrs-accepted.md`.

### Task 3: Mark migration phases P2–P5 superseded

**Files:**

- Modify: `docs/superpowers/plans/2026-09-02-total-combat-automation-migration.md`

- [ ] **Step 1:** Banner under the title: "**Superseded 2026-09-03** for P2–P5 by stages 1–4 and
      7 of `2026-09-03-new-app-stage-1.md`; P0 and P1 are history (P1 integrated on `main`
      `7b95f24`, migrations applied 2026-09-03, deploy pending on `main`)". Phase map rows
      P2–P5 gain a "Superseded by" column value. Each of P2–P5 gets one line after its heading:
      what survives and where (P2 → stage 3 replays and adapter, stage 1 dice; P3 follow-ups →
      legacy readers deleted now on `v2`, `includeMetadataChanges` measurement → stage 4,
      rules-case budget → stage 4; P4 → stage 4; P5 → stage 7).
- [ ] **Step 2:** Commit with changeset `v2-migration-p2-p5-superseded.md`.

### Task 4: Delete K1

**Files:**

- Delete: `src/lib/command/**`, `src/types/command.ts`, `src/types/rule-definition.ts`,
  `src/types/effect-instance.ts`, `scripts/build-functions.ts`,
  `tests/unit/resolve-command.contract.test.ts`, `tests/unit/resolve-command.golden.test.ts`
- Modify: `functions/src/index.ts` (remove `CommandKernel`, `requireCommandKernel`,
  `loadCommandKernel`, `resolveCommand`, `canonicalResolutionJson`), `functions/package.json`
  (`build` → `tsc`; `gcp-build` checks `lib/index.js` only), `functions/.gitignore` if it lists
  the artifact, `docs/MECHANICS.md` (delete "Automation-first command kernel (K1)")

- [ ] **Step 1:** `grep -rn "command-kernel\|lib/command\|resolveCommand\|canonicalResolutionJson" src tests scripts functions/src docs CLAUDE.md justfile package.json` — every hit is in the list above or is deleted with it.
- [ ] **Step 2:** Delete and edit; `pnpm typecheck && pnpm lint --max-warnings 0`; `npm --prefix functions run build && npm --prefix functions test`.
- [ ] **Step 3:** Commit with changeset `v2-delete-k1.md`.

### Task 5: Retire the program supervisor

**Files:**

- Delete: `scripts/program-supervisor/{state,runtime,cli}.ts`,
  `tests/unit/program-supervisor-{state,runtime,worktree}.test.ts`
- Move: `scripts/program-supervisor/{worktree.ts,adapter-preflight.sh,bootstrap-worktree.sh}` → `scripts/worktree/`
- Modify: `package.json` (remove `program:*`), `justfile` (paths), `CLAUDE.md` (setup line;
  the "Delivery workflow" bullet about supervisor adapters), `docs/WORKTREES.md`,
  `docs/CONTRIBUTING.md`, `docs/TEST_PORTFOLIO.md` (task 8 rewrites it)
- Delete: `docs/plans/2026-08-25-agent-first-operating-model-design.md`,
  `docs/plans/2026-08-24-automation-first-product-reset.md`,
  `docs/superpowers/plans/2026-08-26-program-supervisor-foundation.md`

- [ ] **Step 1:** `grep -rn "program-supervisor\|program:\(init\|validate\|append\|rebuild\)\|agent-first-operating-model\|automation-first-product-reset" --include=*.md --include=*.json --include=*.ts --include=*.sh --include=justfile -r . --exclude-dir=node_modules --exclude-dir=.git` and fix every hit.
- [ ] **Step 2:** Rewrite `tests/unit/program-supervisor-worktree.test.ts` as
      `tests/unit/worktree-helper.test.ts` only if `worktree.ts` has behaviour worth a test
      (it computes candidate/path strings; keep the existing cases, retargeted).
- [ ] **Step 3:** `just wt-list` still works; `pnpm typecheck && pnpm lint --max-warnings 0`.
- [ ] **Step 4:** Commit with changeset `v2-retire-program-supervisor.md`.

### Task 6: Delete the P1/P3 migration scripts, the legacy readers and the Phase-2 handoff

**Files:**

- Delete: `scripts/migrate-custom-identity.ts`, `scripts/migrate-character-parents.ts`,
  `scripts/migrate-item-resources.ts`, their tests (`tests/unit/migrate-*.test.ts` for those
  three, `tests/rules/migrate-character-parents.emulator.test.ts`),
  `docs/superpowers/plans/2026-09-03-next-session-handoff.md`, `docs/AUTOMATION_HANDOFF.md`
- Modify: `src/lib/combat-state-codec.ts` (remove `parseLegacyCombatChild` and what only it
  uses), `src/lib/combat-state.ts` (remove `applyLegacyCombatToSession`),
  `tests/unit/architecture-direction.guard.test.ts` (remove the fence),
  `tests/unit/combat-state-io-roundtrip.test.ts`, `tests/unit/combat-state.test.ts`,
  `tests/unit/combat-resilience.test.ts` (remove the legacy cases), `docs/RELEASE.md` ("Migrate
  before you deploy" states that the scripts and their runbook live on `main`; `v2` keeps only
  `scripts/audit-codec-loss.ts`), `docs/PROGRAM_STATUS.md` (task 8), `docs/CHARACTER_SCHEMA.md`
  and `docs/ARCHITECTURE.md` lines that name the deleted scripts.

- [ ] **Step 1:** `grep -rn "migrate-custom-identity\|migrate-character-parents\|migrate-item-resources\|parseLegacyCombatChild\|applyLegacyCombatToSession\|AUTOMATION_HANDOFF\|next-session-handoff" -r . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist` — fix every hit (the `v2` handoff keeps its own name).
- [ ] **Step 2:** `scripts/lib/migration-kit.ts` stays (the audit reads it); delete helpers inside it that only the deleted scripts used, if any (`grep` each export).
- [ ] **Step 3:** `pnpm typecheck && pnpm lint --max-warnings 0 && pnpm test --run tests/unit/combat-state tests/unit/architecture-direction`.
- [ ] **Step 4:** Commit with changeset `v2-delete-p1-migration-scripts.md`.

### Task 7: Cut the old end-to-end suites and the dead engine satellites

**Files:**

- Delete: every `tests/e2e/*.spec.ts` except `a11y.spec.ts` and `a11y-hp-states.spec.ts`;
  `tests/e2e/visual-gate.ts` and any helper only the deleted specs import (check `fixtures/`);
  `src/lib/combat-io.ts`; `src/lib/mechanics-trigger.ts` + `tests/unit/mechanics-trigger.test.ts`;
  `docs/superpowers/plans/2026-08-25-{automation-first-wayfinder,automation-k1-kernel-contract,g0-automation-readiness,tactical-codex-ui-ux-wayfinder,test-portfolio-reset,wayfinder-orchestration-reconciliation}.md`,
  `docs/superpowers/plans/2026-09-02-p2-prototype-vertical.md`,
  `docs/superpowers/status/2026-08-25-{automation-capability-ledger,causal-branch-disposition,worktree-consolidation}.md`,
  `docs/superpowers/status/2026-09-02-p2-prototype-report.md`
- Modify: `playwright.config.ts` (projects keep `chromium` and `mobile` for the two a11y specs;
  remove the portrait projects), `package.json` (`test:e2e:visual`, `test:e2e:all:visual`
  removed; `test:e2e` stays for the sweep), `.github/workflows/verify.yml` (unchanged: it runs
  on `main` only; add a comment that `v2` runs the sweep by hand until stage 6),
  `docs/superpowers/status/2026-09-02-combat-rules-surface.md` line 8 (dice constraint
  reversed), every document that links a deleted file (grep).
- Create: `tests/unit/mechanics-kernel-freeze.guard.test.ts` — reads every file under `src/`
  that imports `@/lib/mechanics-` or `@/lib/mechanic-occurrence`, and asserts the set equals the
  committed importer list (the 7 entry modules' readers); a new importer fails with the message
  "the mechanics kernel dies at stage 6; build on `src/lib/combat`".

- [ ] **Step 1:** `ls tests/e2e/*.spec.ts | grep -v a11y | xargs git rm`; `grep -rn "from \"./" tests/e2e/a11y*.spec.ts tests/e2e/surfaces.ts` → keep exactly those helpers.
- [ ] **Step 2:** Write the freeze guard RED (assert an empty set), run it to see the real set, commit the real set as the expected list.
- [ ] **Step 3:** `grep -rln "2026-08-25-\|p2-prototype\|combat-io\|mechanics-trigger" docs CLAUDE.md PROGRESS.md README.md` → fix every link.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint --max-warnings 0 && pnpm exec playwright test --list | tail -3` (lists only the two a11y specs).
- [ ] **Step 5:** Commit with changeset `v2-cut-old-e2e-and-dead-satellites.md`.

### Task 8: Rewrite the status owners for `v2`

**Files:**

- Modify: `docs/PROGRAM_STATUS.md` — becomes the `v2` program ledger: reconciliation snapshot
  (branch, integration SHAs), "`v2` — stage 0" (kept verbatim), new "`v2` — stage 1
  (architecture reset + dice seam)", "Pending on `main`" (one paragraph: the P1 deploy and its
  migrations are owned by `main`'s `docs/PROGRAM_STATUS.md`), delete zone reduced to worktrees
  and branches that still exist. Every charter, lease, frontier and supervisor section is
  deleted.
- Modify: `docs/TEST_PORTFOLIO.md` — the `v2` portfolio: lanes and counts after the cuts, the
  gate definition (`just ci`, `pnpm test:rules`, `vite build && pnpm test:budget`; a11y sweep and
  screenshot lane by hand until stage 6), the golden-replay contract (`tests/unit/combat/replays`),
  the deletion ledger of this reset (files, counts, the representation each died with).
- Modify: `docs/ARCHITECTURE.md` — "What this app deliberately doesn't do → Roll dice" replaced
  by "Roll dice outside the dice seam (`src/lib/dice.ts`)"; "Canonical mechanics runtime cutover
  (active)" retitled "Mechanics kernel (legacy runtime of the old play surfaces; dies at stage 6)"
  with a two-sentence lead; every "golden rule 21" citation → rule 32 with the reversed meaning;
  line ~974 and the d20-test paragraph reworded as "today's surfaces enter faces; the dice seam
  (stage 1) rolls them".
- Modify: `docs/MECHANICS.md` — cross-cutting rule 4 becomes "Every roll is a logged `roll`
  action (rule 32); the engine consumes rolls by id and never draws randomness itself";
  rule-21 citations → rule 32; the K1 section is already gone (task 4).
- Modify: `docs/superpowers/status/2026-09-02-combat-rules-classification.md` header: one line
  noting the executors it cites die at stage 6.

- [ ] **Step 1:** Edit the five documents; `pnpm test --run tests/unit/content-pack-partition.guard.test.ts tests/unit/architecture-direction.guard.test.ts`.
- [ ] **Step 2:** Commit with changeset `v2-status-owners-rewritten.md`.

### Task 9: Stage-1 plan inventory, `CLAUDE.md` direction, CI on `v2`

**Files:**

- Modify: `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` — new section "Module fates
  (architecture reset, 2026-09-03)" carrying the Fates table above with the evidence column;
  stage 1 text points at `2026-09-03-v2-stage-1-dice-seam.md`; stage 3 names the tier list of
  spec §4/§7; stage 7 lists only what remains after this reset (kernel and its tests, old play
  surfaces, `cost-engine`, `dice-formula`/`d20-test`, `automation-corpus`, `POSITIONING.md`, the
  atlas authority); ground rules gain "no end-to-end spec on `v2`, the sweep and the screenshot
  lane are the only browser suites".
- Modify: `CLAUDE.md` — the Direction block: "**Direction (2026-09-03):** the new app grows on
  `v2` under `PRODUCT.md` §Steering; the engine target is the reconciled
  `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` (log-first reducer,
  rolls with provenance, three automation levels, DM last word) executed by
  `docs/superpowers/plans/2026-09-03-new-app-stage-1.md`. `src/lib/combat` is the engine base;
  the mechanics kernel and the old play surfaces are legacy that dies at stage 6; randomness for
  dice exists only in `src/lib/dice.ts`." Also drop the sentence "Shipped code still enforces
  the older 'no dice' rule…" in favour of "production (`main`) still ships the no-dice
  surfaces; `v2` owns the dice seam". Update the authority table (Operations row: remove the
  operating model; add the stage plan under Status).
- Modify: `.github/workflows/ci.yml` — `on.push.branches: [main, v2]`; comment updated.

- [ ] **Step 1:** Edit; run `pnpm test --run tests/unit/content-pack-partition.guard.test.ts`.
- [ ] **Step 2:** Commit with changeset `v2-stage-1-plan-inventory.md`.

### Task 10: Gate and push

- [ ] **Step 1:** `just ci` (composed) — record wall time in `docs/PROGRAM_STATUS.md` "`v2` — stage 1".
- [ ] **Step 2:** `just ci-srd-only` (Functions/scripts changed) and `pnpm test:rules` (the emulator test was deleted).
- [ ] **Step 3:** `git push origin HEAD:refs/heads/v2 && git ls-remote origin refs/heads/v2`.
