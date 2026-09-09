# v2 knowledge-base reset — implementation plan (2026-09-09)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** one program, one ledger, one design reference and one shared knowledge base for
d20 Folio `v2`, readable identically by Claude Code and Codex, with the v1 documentation
archived, every map document rewritten short from the v2 code, a committed graphify graph kept
current by a post-commit hook, archify diagrams in the map documents, and the global skill layer
reduced to the skills the repository routes.

**Architecture:** the repository is the only knowledge base. Everything an agent must obey (the
P01–P30 program, the delivery checklist, dated owner decisions, the handoff, the frozen manifest
of the approved mock) lives under `docs/program/` and is named by path from `CLAUDE.md`
(= `AGENTS.md`). Harness-private folders hold evidence only. Size caps on the owner documents are
enforced by a unit test so the documentation cannot regrow.

**Tech Stack:** git worktrees, pnpm/Vitest (doc-budget test), graphify 0.8.33 (`~/.local/bin/graphify`),
archify 2.17 (`~/.agents/skills/archify/bin/archify.mjs`, Node), `npx skills` CLI, prettier.

**Spec:** the eight owner decisions ratified in chat on 2026-09-09 (recorded in Task B1's
`docs/program/DECISIONS.md` under "2026-09-09 — knowledge-base reset") and the owner request
"install archify; review installed skills and steering; delete what is superfluous; clean
everything for v2; clarify every discrepancy; always keep a graphify graph current; Codex and
Claude must share the same knowledge base and skills".

## Global Constraints

- Repository language: English (code, docs, commits, changesets). Conversation with the owner: Italian.
- Every commit: Conventional Commit, owner sole author, no trailer, one `.changeset/*.md` staged
  (pre-commit hook enforces it), the owning document reconciled in the same commit. Never `--no-verify`.
- Destination branch: `v2` only (`git push origin HEAD:v2`). `main` receives exactly one
  documentation-only pointer commit (Task B8), nothing else.
- Worktree: `~/Workspace/Codex/d20-folio-v2-knowledge-reset`, branch
  `task/v2-knowledge-base-reset-20260909`, based on `origin/v2` at `08f8af0b`.
- Size caps (bytes, enforced by `tests/unit/docs-budget.test.ts`): `CLAUDE.md` ≤ 12,000;
  `PRODUCT.md` ≤ 24,000; `docs/PROGRAM_STATUS.md` ≤ 12,000; `docs/program/NEXT.md` ≤ 6,000;
  every other file in the Map role ≤ 40,000; `docs/GOLDEN_RULES.md` ≤ 18,000.
- Nothing is deleted from history: v1 documents move to `docs/archive/v1/` with `git mv`;
  external evidence moves to `~/Workspace/Codex/archive-2026-09-09/`; uncommitted work from
  removed worktrees is already saved as patches in
  `~/Workspace/Codex/archive-2026-09-09/dirty-worktree-patches/`.
- Owner gates untouched: no deploy, no staging deploy, no data migration, no release.
- The private pack twin is not touched (documentation-only change; rule 28 not triggered).

---

## Track A — global tooling (outside the repository; orchestrator executes inline)

### Task A1: one skill layer, symlinks only

**Files:**

- Canonical: `~/.agents/skills/` (read natively by Codex 0.153 and by Claude via symlinks)
- Modify: `~/.claude/skills/` (symlinks only after this task), `~/.codex/skills/` (emptied)

**Keep (canonical, 11):** `archify`, `find-skills`, `graphify`, `grill-me`, `impeccable`,
`playwright-cli`, `ponytail`, `ponytail-review`, `task-observer`, plus the two plugins that both
harnesses load (`superpowers`, `claude-mem`). `frontend-design` plugin stays enabled on both.

**Delete from `~/.agents/skills` (39):** `algorithmic-art`, `architecture-decision-records`,
`automation-audit-ops`, `awesome-design-skills`, `better-icons`, `brand-guidelines`, `browser-qa`,
`canvas-design`, `claude-md-optimizer`, `competitive-platform-analysis`, `context-budget`,
`design-taste-frontend`, `domain-modeling`, `eval-harness`, `firecrawl`, `firecrawl-crawl`,
`firecrawl-scrape`, `firecrawl-search`, `grilling`, `high-end-visual-design`, `image-to-code`,
`living-docs-governance`, `open-pencil`, `pdf`, `ponytail-audit`, `ponytail-debt`,
`ponytail-gain`, `ponytail-help`, `product-lens`, `prototype`, `research`, `security-review`,
`setup-matt-pocock-skills`, `skill-stocktake`, `theme-factory`, `to-spec`, `to-tickets`,
`wayfinder`, `web-design-guidelines`, `workspace-surface-audit`.

**Delete from `~/.claude/skills` (real copies, 39):** every directory that is not a symlink and
is not in the keep list, including the 17 `*-extras` (after Task B5 has mined them),
`production-incident-containment`, `scripted-edit-discipline`, `prototype`, `research`,
`domain-modeling`, `image-to-code`, `design-taste-frontend`, `web-design-guidelines`,
`brand-guidelines`, `canvas-design`, `algorithmic-art`, `theme-factory`, `pdf`,
`claude-md-optimizer`, `grilling`, `ponytail-audit/debt/gain/help`.

**Delete from `~/.codex/skills` (all 9):** `cloudflare`, `design-dna`, `icon-system`,
`impeccable`, `pplx-cli`, `ui-ux-pro-max`, `web-perf`, `workers-best-practices`, `wrangler`.

- [ ] **Step 1: for each kept skill that exists as a real copy in `~/.claude/skills`, keep the newer of the two copies in `~/.agents/skills`, then replace the `~/.claude/skills` copy with a symlink**

```bash
for s in find-skills graphify grill-me playwright-cli ponytail ponytail-review task-observer; do
  a=~/.agents/skills/$s; c=~/.claude/skills/$s
  [ -L "$c" ] && continue
  if [ -d "$a" ]; then diff -rq "$a" "$c" >/dev/null && echo "$s identical" || echo "$s DIFFERS (inspect before choosing)"; fi
done
```

For a differing pair, `diff` the two `SKILL.md` files, keep the one with the higher `version:`
(or the newer mtime when unversioned), `rm -rf` the other, then
`ln -s ../../.agents/skills/$s ~/.claude/skills/$s`.

- [ ] **Step 2: delete the listed skills** with `rm -rf` in all three directories; leave the
      `archify` and `impeccable` symlinks in `~/.claude/skills` untouched.
- [ ] **Step 3: verify** — `ls ~/.agents/skills` prints exactly the 9 kept skills;
      `find ~/.claude/skills -maxdepth 1 -type d -not -name skills` prints nothing (only symlinks);
      `ls ~/.codex/skills` prints nothing.
- [ ] **Step 4: record** the kept list in `CLAUDE.md` "Tool routing" (Task B5) so the next agent
      knows the catalogue is deliberate.

### Task A2: one global briefing for both harnesses

**Files:**

- Modify: `~/.claude/CLAUDE.md` (add the Codex workspace section verbatim from `~/.codex/AGENTS.md`;
  replace the ECC and Find Skills bullets with the kept catalogue; add graphify-first and archify
  bullets; add the "repo is the only memory" bullet)
- Replace: `~/.codex/AGENTS.md` → symlink to `~/.claude/CLAUDE.md`

- [ ] **Step 1:** write the merged file (≤ 3,500 bytes). Bullets, in order: Superpowers owns the
      lifecycle · the skill catalogue is the 9 kept skills + 3 plugins, nothing else is installed
      without find-skills evidence · graphify graph first for any codebase question · archify for
      every diagram in a map document · claude-mem is search, never authority · task-observer log at
      `~/.agents/state/d20-folio/skill-observations/log.md` · the repository is the only memory for
      decisions and state; harness memories hold hazards and pointers only · workspace/cloud-sync
      safety (verbatim from Codex).
- [ ] **Step 2:** `mv ~/.codex/AGENTS.md ~/Workspace/Codex/archive-2026-09-09/codex-AGENTS.md.bak && ln -s ~/.claude/CLAUDE.md ~/.codex/AGENTS.md`
- [ ] **Step 3: verify** `diff ~/.claude/CLAUDE.md ~/.codex/AGENTS.md` prints nothing.

### Task A3: memory hygiene

**Files:**

- Modify: `~/.claude/projects/-Users-salvatoredicara-Workspace-d20-folio/memory/` — delete every
  file except `ops-hazards.md`; rewrite `MEMORY.md` as two lines: the ops-hazards pointer and
  "everything else lives in the repo: `CLAUDE.md` → `docs/program/NEXT.md`".
- Modify: `~/.agents/state/d20-folio/skill-observations/` — move the 30 `log.md.bak*`,
  `log.*.bak`, `log-before-*` files and the `backups/` directory to
  `~/Workspace/Codex/archive-2026-09-09/skill-observation-backups/`; keep `log.md`, `archive/`,
  `cross-cutting-principles.md`, `last-review-date.txt`.

- [ ] **Step 1:** move and delete as listed.
- [ ] **Step 2: verify** `ls` of the memory dir shows `MEMORY.md ops-hazards.md`; the
      observations dir shows exactly the four kept entries.

### Task A4: worktrees, branches and external evidence

- [ ] **Step 1: remove 14 worktrees** (patches of the dirty ones are already archived):
      `d20-folio-design-reset-foundation`, `d20-folio-p01-reconciliation`,
      `d20-folio-p02-identity-data`, `d20-folio-p02-identity-privacy`, `d20-folio-p02-roster`,
      `d20-folio-program-control`, `d20-folio-s01-arcane-shell`, `d20-folio-s01-astra`,
      `d20-folio-structural-automation-baseline`, `d20-folio-structural-automation-fixes`,
      `d20-folio-wayfinder-b00-successor` (all under `~/Workspace/Codex`),
      `~/Workspace/d20-folio-tactical-codex-design-lab`, and under `.claude/worktrees/`:
      `combat-p1-data-safety-eb6f82`, `v2-stage-2-positions-areas-3ebdca`. Use
      `git worktree remove --force <path>` from the main checkout, then `git worktree prune`.
- [ ] **Step 2: delete the local branches** `feat/design-reset-foundation`,
      `codex/p01-reconciliation-20260906`, `codex/p02-identity-data-20260906`,
      `codex/p02-identity-privacy-20260906`, `codex/p02-roster-20260906`, `feat/s01-arcane-shell`,
      `codex/s01-astra`, `fix/structural-automation-fixes`, `feat/wayfinder-b00-successor`,
      `feat/tactical-codex-design-lab` with `git branch -D`. Only `main`, `v2` and the task branch remain.
- [ ] **Step 3: re-point the long-lived v2 worktree** `.claude/worktrees/d20-folio-combat-arch-db1941`:
      `git -C <path> fetch origin && git -C <path> reset --hard origin/v2` (it is clean and 110 commits behind).
- [ ] **Step 4: archive evidence:** move every `~/Workspace/Codex/d20-folio-p*-evidence`,
      `d20-folio-*-evidence`, `d20-folio-program*.json`, `runtime-*.json`, `*.log`, `d20-folio-b00-*`,
      `d20-folio-g0-*`, `d20-folio-forensics-*`, `d20-folio-worktree-audit`, `wayfinder-program-controller`,
      `d20-folio-program-events-k1-integrate`, `d20-folio-program` (bare repo), `d20-folio-private-coordination`,
      `d20-folio-content-e2e-contract-reset`, `d20-folio-content-structural-automation-fixes`,
      `d20-folio-local-preview`, `v2-adversarial-review-2026-09-05`, `d20-product-diagnosis-20260906`
      into `~/Workspace/Codex/archive-2026-09-09/`. Leave `d20-design-dialogue` (the lab, named by
      path from the repo), `d20-folio-v2-knowledge-reset` (this task) and non-d20 projects in place.
- [ ] **Step 5: verify** `git worktree list` shows exactly: main checkout, the v2 worktree, this
      task's worktree.

---

## Track B — repository changes (worktree `~/Workspace/Codex/d20-folio-v2-knowledge-reset`)

### Task B0: graph, hook, plan

**Files:**

- Modify: `.gitignore:72-73` (drop `graphify-out/`, add `graphify-out/graph.html`,
  `graphify-out/*.svg`, `graphify-out/cache/`, `graphify-out/wiki/` — commit only `graph.json` and
  `GRAPH_REPORT.md`)
- Create: `.githooks/post-commit`
- Create: `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md` (generated)
- Create: `.changeset/v2-knowledge-graph.md`

- [ ] **Step 1:** `graphify . --no-viz` in the worktree (already launched); confirm
      `graphify-out/graph.json` exists and note its size in the changeset.
- [ ] **Step 2:** write `.githooks/post-commit`:

```bash
#!/usr/bin/env bash
# Keep the committed graphify graph current: re-extract only the code files this commit changed.
# The graph is a committed, generated artifact (graphify-out/graph.json + GRAPH_REPORT.md);
# the follow-up amend is intentional — the graph rides with the commit that changed the code.
set -euo pipefail
command -v graphify >/dev/null 2>&1 || exit 0
[ -n "${GRAPHIFY_HOOK_RUNNING:-}" ] && exit 0
if git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -qE '^(src|tests|functions|scripts)/.*\.(ts|tsx|js|mjs)$'; then
  GRAPHIFY_HOOK_RUNNING=1 graphify . --update --no-viz >/dev/null 2>&1 || exit 0
  if ! git diff --quiet -- graphify-out/graph.json graphify-out/GRAPH_REPORT.md; then
    git add graphify-out/graph.json graphify-out/GRAPH_REPORT.md
    GRAPHIFY_HOOK_RUNNING=1 git commit --amend --no-edit --quiet
  fi
fi
```

`chmod +x .githooks/post-commit`. Test: make a throwaway commit touching a `.ts` file and confirm
the amended commit contains `graphify-out/graph.json`; then `git reset --hard HEAD~1`.

- [ ] **Step 3:** commit this plan, the ignore change, the hook and the graph:
      `git add docs/superpowers/plans/2026-09-09-v2-knowledge-base-reset.md .gitignore .githooks/post-commit graphify-out/graph.json graphify-out/GRAPH_REPORT.md .changeset/v2-knowledge-graph.md && git commit -m "chore(kb): commit the graphify graph, keep it current from a post-commit hook, add the reset plan"`.

### Task B1: `docs/program/` — the program, in the repo

**Files:**

- Create: `docs/program/README.md` (≤ 2 KB: what each file owns, reading order)
- Create: `docs/program/PROGRAM.md` (≤ 30 KB) — English rendition of
  `~/Workspace/Codex/d20-design-dialogue/full-lab/docs/AGENT-PROGRAM.md`: the common session
  contract (one paragraph), the block table P01–P30 with dependencies / owned modules / exit
  acceptance (one row each, condensed), the deterministic next-block selection (four numbered
  rules), the E01–E22 → P14a/b/c assignment table, the cross-cutting contracts table. Add the new
  block **PD — Engagement and progressive disclosure design** between P10 and P11a with entry
  conditions from the owner's 2026-09-09 feedback (BG3 and D&D Beyond studied for real; the
  character-creation journey redesigned as the representative path; raster art direction for
  spells and combat actions with concrete examples; proof of speed for the expert and discovery
  for the beginner; owner verdict closes PD; P11a does not start before).
- Create: `docs/program/CHECKLIST.md` (≤ 8 KB) — the delivery checklist (sections A–D) in English,
  present tense, without the historical 0.9 receipts.
- Create: `docs/program/DECISIONS.md` (≤ 12 KB) — dated owner decisions, newest first, each ≤ 6
  lines, quoting the owner's Italian words where they were quoted in the sources: 2026-09-09
  (engagement / progressive disclosure / raster art / short handoffs; and the eight reset decisions
  of this session), 2026-09-08 (standing delivery delegation; clarity and familiar patterns; custom
  automation and editable combat), 2026-09-07 (shell/Account corrections; dark only), 2026-09-06
  (new application rebuilt from zero; mock 0.9.3 is the reference; withdrawn 28 screenshots;
  push authorization), 2026-09-05 (immersive-v2 accepted as base; brand d20 Folio + D20 kept),
  2026-09-03 (steering; giants' shoulders; dice reversal; CI under 15 min; no dead weight),
  2026-09-02 (architecture round rulings). Sources: `product-memory/PRODUCT-MEMORY.md`,
  `LEGGIMI.md`, `shell-review-20260907/DECISIONS.md`, `PRODUCT.md` sections dated 6–8 September,
  `docs/superpowers/plans/2026-09-03-new-app-stage-1.md`.
- Create: `docs/program/NEXT.md` (≤ 6 KB) — the only handoff, with fixed headings:
  `## Current block`, `## Closed (SHA)`, `## Open`, `## Recent owner decisions (dates)`,
  `## Opening prompt`. The opening prompt is five lines: read `CLAUDE.md`, read this file, start
  the block under "Current block", follow `docs/program/PROGRAM.md` for the next selection,
  end the session by rewriting this file. Current block after this task: **PD**.
- Create: `docs/program/reference/README.md`, `docs/program/reference/mock-0.9.3-manifest.json`
  (copy of `full-lab/RELEASE-MANIFEST.json`), `docs/program/reference/shell-r2-decisions.md`
  (English rendition of `shell-review-20260907/DECISIONS.md`), and 12 curated screenshots
  converted to WebP ≤ 150 KB each (`cwebp -q 80`): `01-campaign-1440`, `02-character-1440`,
  `03-inventory-1440`, `04-target-1440`, `06-applied-1440`, `07-correction-1440`,
  `dm-workspace-desktop`, `hud-slots-it-1440`, `final-review-calendar-1440`,
  `screen-account-it-dark-1440`, `character-390`, `nav-phone` from `full-lab/evidence/`, plus
  `r2-preferences-desktop.png` and `campaign-desktop.png` from `shell-review-20260907/`.
- Create: `.changeset/v2-program-in-repo.md`

- [ ] **Step 1:** write the files. Every fact carries its source path in a trailing
      `<!-- source: ... -->` comment on first use so the translation is auditable.
- [ ] **Step 2:** run `pnpm exec prettier --check docs/program` and fix.
- [ ] **Step 3:** commit: `docs(program): bring the P01–P30 program, checklist, decisions and handoff into the repository`.

### Task B2: `docs/PROGRAM_STATUS.md` — one page

**Files:**

- Modify: `docs/PROGRAM_STATUS.md` (144 KB → ≤ 12 KB)
- Create: `docs/archive/v1/PROGRAM_STATUS-2026-09-09.md` (the full previous file, `git mv` then rewrite)

- [ ] **Step 1:** `git mv docs/PROGRAM_STATUS.md docs/archive/v1/PROGRAM_STATUS-2026-09-09.md`.
- [ ] **Step 2:** write the new file: `## Frontier` (PD open; P11a next; what P10 delivered in
      four lines with SHA `59b20e75`), `## Closed blocks` table (block · closed on · integration SHA
      · evidence path — one row for stages 0–6 as one line "engine base, stages 0–6, `24d9fbf6`",
      one row per P01…P10 with the SHAs from the archived file), `## Open gates` (Google provider on
      staging; PD verdict), `## Delete zone` (kept from the archived file, only entries still alive).
- [ ] **Step 3:** commit with `.changeset/v2-program-status-one-page.md`:
      `docs(program): collapse the ledger to one page; archive the stacked history`.

### Task B3: archive the v1 documentation and dead artifacts

**Files (git mv to `docs/archive/v1/`):** `PROGRESS.md`, `DESIGN.md`, `docs/ARCHITECTURE.md`,
`docs/MECHANICS.md`, `docs/CHARACTER_SCHEMA.md`, `docs/AUTOMATION_COVERAGE.md`,
`docs/AUTOMATION_BACKLOG.md`, `docs/BUG_REPORTING.md`, `docs/POSITIONING.md`,
`docs/TEST_PORTFOLIO.md`, `docs/CONTRIBUTING.md`, `docs/automation-engine-explainer.html`,
`docs/automation-coverage*.json`, `docs/design/tactical-codex-atlas/` (35 MB of PNG boards —
`git mv` keeps history; the boards are the "old visual atlases" the steering cut),
`docs/superpowers/plans/2026-09-02-*.md`, `docs/superpowers/plans/2026-09-03-*.md`,
`docs/superpowers/plans/2026-09-04-*.md`, `docs/superpowers/status/2026-08-26-*.md`,
`docs/superpowers/status/2026-09-02-*.md`, `docs/superpowers/status/2026-09-03-*.md`,
`docs/superpowers/specs/2026-09-03-ui-redesign-design.md`,
`docs/superpowers/specs/2026-09-0{3,4}-v2-stage-*.md`, `docs/plans/`, `docs/AUTOMATION_HANDOFF.md`.

**Files kept in place:** `docs/adr/`, `docs/IT_NAME_REGISTRY.md`, `docs/RELEASE.md`,
`docs/WORKTREES.md`, `docs/GOLDEN_RULES.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/homebrew-*.md`,
`docs/character-creation-*.md`, `docs/source-acquisition.md`, `docs/superpowers/research/`,
`docs/superpowers/specs/2026-09-02-*.md` (engine design, still the engine's owner),
`docs/superpowers/specs/2026-09-0{6,7,8}-p*.md`, `docs/superpowers/plans/2026-09-0{6,7,8}-p*.md`,
`CHANGELOG.md`, `README.md`, `docs/assets/`.

- [ ] **Step 1:** `git mv` as listed; create `docs/archive/v1/README.md` (≤ 1 KB: "v1 documents,
      frozen 2026-09-09; history only; salvage list: typed automation data, coverage tables, grants").
- [ ] **Step 2:** `grep -rn` the repository (excluding `docs/archive`) for every moved path and fix
      each link to the new path or to the rewritten successor.
- [ ] **Step 3:** commit with `.changeset/v2-archive-v1-docs.md`:
      `docs: archive the v1 documentation set and the visual atlas under docs/archive/v1`.

### Task B4: the docs-budget test (TDD)

**Files:**

- Create: `tests/unit/docs-budget.test.ts`
- Modify: `vitest.config.ts` only if `tests/unit/**/*.test.ts` is not already included (it is).

- [ ] **Step 1: write the failing test**

```ts
import { readFileSync, statSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const caps: Record<string, number> = {
  "CLAUDE.md": 12_000,
  "PRODUCT.md": 24_000,
  "docs/PROGRAM_STATUS.md": 12_000,
  "docs/program/NEXT.md": 6_000,
  "docs/GOLDEN_RULES.md": 18_000,
  "docs/ARCHITECTURE.md": 40_000,
  "docs/MECHANICS.md": 40_000,
  "docs/CHARACTER_SCHEMA.md": 40_000,
  "DESIGN.md": 40_000,
  "PROGRESS.md": 8_000,
  "docs/CONTRIBUTING.md": 24_000,
  "docs/WORKTREES.md": 8_000,
  "docs/TEST_PORTFOLIO.md": 16_000,
};

describe("documentation budget (no dead weight, owner 2026-09-03; caps ratified 2026-09-09)", () => {
  for (const [file, cap] of Object.entries(caps)) {
    it(`${file} stays under ${cap} bytes`, () => {
      expect(statSync(file).size).toBeLessThanOrEqual(cap);
    });
  }
  it("the handoff file carries the five fixed headings", () => {
    const text = readFileSync("docs/program/NEXT.md", "utf8");
    for (const h of [
      "## Current block",
      "## Closed (SHA)",
      "## Open",
      "## Recent owner decisions",
      "## Opening prompt",
    ])
      expect(text).toContain(h);
  });
  it("the committed graph exists and is not empty", () => {
    expect(existsSync("graphify-out/graph.json")).toBe(true);
    expect(statSync("graphify-out/graph.json").size).toBeGreaterThan(10_000);
  });
});
```

- [ ] **Step 2:** `pnpm test --run tests/unit/docs-budget.test.ts` → expected FAIL (the map files
      are not rewritten yet / do not exist after B3).
- [ ] **Step 3:** the test goes green only when Tasks B5 and B6 are done; commit it with B6.

### Task B5: constitution and router — `CLAUDE.md`, `PRODUCT.md`, golden rules, constitution, worktrees, contributing

**Files:**

- Modify: `CLAUDE.md` (≤ 12 KB). Structure: title · one "Direction" block (v2 = the new
  application rebuilt from zero on branch `v2`, program in `docs/program/`, design reference =
  approved mock 0.9.3 + 7 Sept shell corrections, 9 Sept engagement feedback open as block PD;
  `main` = production, fixes only) · Authority table (Constitution: PRODUCT §Steering,
  PRODUCT_CONSTITUTION, GOLDEN_RULES · Program: `docs/program/PROGRAM.md`, `CHECKLIST.md`,
  `DECISIONS.md`, `NEXT.md`, `docs/PROGRAM_STATUS.md` · Map: ARCHITECTURE, MECHANICS,
  CHARACTER_SCHEMA, DESIGN, IT registry, `graphify-out/GRAPH_REPORT.md` · History: CHANGELOG,
  `docs/archive/v1/`, git) · Invariants (unchanged list) · Architecture in one breath (v2 only;
  remove the main paragraph) · Stack · Delivery workflow (v2 topic worktree from fresh
  `origin/v2`, harness-neutral branch prefix `task/`; main fixes via `just wt-new`) ·
  Knowledge base and memory (repo is the only memory; graph first: "before answering any question
  about the code, run `graphify query`"; archify for diagrams; handoff = NEXT.md; harness
  memories hold hazards and pointers) · Tool routing (the 9 skills + 3 plugins, each one line; the
  project-local Firebase skills under `.agents/skills/firebase-*` for Firebase work) · Common commands.
  Remove the two dated prologue sections and "Current P01–P30 routing" (their content moves to
  DECISIONS.md and the Direction block).
- Modify: `PRODUCT.md` (≤ 24 KB): `## Steering` first, then `## V2 delivery and owner review`,
  `## Clarity and familiar interaction patterns`, `## Homebrew automation and editable combat`,
  `## Users`, `## Product Purpose`, `## Brand Personality`, `## Anti-references`,
  `## Design Principles`, `## Accessibility & Inclusion`. The dated sections of 6–8 September
  collapse to one dated line each pointing at `docs/program/DECISIONS.md`.
- Modify: `docs/GOLDEN_RULES.md` (≤ 18 KB): keep numbering; rewrite 11 (worktree from fresh
  `origin/v2` for v2, `task/` prefix, never another task's checkout), 25 (visual changes: curated
  runtime screenshots as chat images; v2 integrates under the 8 Sept standing delegation), 16
  (add the Program role to the four roles → five roles). Add 36 **Contracts live in the
  repository** (every contract an agent must obey is under `docs/program/`; harness-private
  folders hold evidence only), 37 **One ledger, one numbering** (PROGRAM_STATUS is one page; a
  closed frontier collapses to one row with a SHA), 38 **The graph is always current**
  (`graphify-out/graph.json` is committed, the post-commit hook keeps it current, graph queries
  come before file reads), 39 **Diagrams are archify sources** (every map diagram has its JSON
  source and SVG under `docs/diagrams/`). Remove the stale rule text that still says "no dice".
- Modify: `docs/PRODUCT_CONSTITUTION.md` (≤ 40 KB): reconcile with the same four facts; drop the
  light-theme and two-theme obligations (dark only, 7 Sept); drop the P-block prologues.
- Modify: `docs/WORKTREES.md` (≤ 8 KB): harness-neutral v2 procedure (five steps, as today but
  `task/<slug>` branches, evidence under `~/Workspace/Codex/<task>-evidence` until integration
  then archived) + the production-fix adapter in ten lines pointing at `just wt-new`.
- Create: `docs/CONTRIBUTING.md` (≤ 24 KB) — rewritten from the archived one: gates (pre-commit,
  pre-push on main, `just ci`, `just ci-srd-only`, `pnpm test:rules`, budget), commit and
  changeset rules, review lifecycle, plus a `## Lessons that became rules` section of at most 30
  one-line rules mined from the 17 `~/.claude/skills/*-extras/SKILL.md` files (keep only rules
  that still apply to v2 and are not already golden rules; each line names the situation and the
  rule; drop session anecdotes).
- Create: `.changeset/v2-steering-reconciled.md`

- [ ] **Step 1:** write the files in the order CLAUDE → PRODUCT → GOLDEN_RULES → CONSTITUTION →
      WORKTREES → CONTRIBUTING.
- [ ] **Step 2:** `grep -n "no dice\|No dice\|stage-1 program plan\|program-supervisor\|Wayfinder\|K1" CLAUDE.md PRODUCT.md docs/GOLDEN_RULES.md docs/PRODUCT_CONSTITUTION.md docs/WORKTREES.md docs/CONTRIBUTING.md` → no hits except inside explicit history sentences.
- [ ] **Step 3:** `pnpm exec prettier --check` on the files; commit:
      `docs(steering): one direction, one program, one knowledge base for v2`.

### Task B6: map documents rewritten from the v2 code, with diagrams

**Files:**

- Create: `docs/ARCHITECTURE.md` (≤ 40 KB), `docs/MECHANICS.md` (≤ 40 KB),
  `docs/CHARACTER_SCHEMA.md` (≤ 40 KB), `DESIGN.md` (≤ 40 KB), `PROGRESS.md` (≤ 8 KB),
  `docs/TEST_PORTFOLIO.md` (≤ 16 KB)
- Create: `docs/diagrams/README.md`, and for each diagram `docs/diagrams/<name>.json` (archify
  source) + `docs/diagrams/<name>.svg` (exported): `system-architecture` (architecture: app shell,
  features, lib/combat engine, stores, Firestore documents, staging/production projects, pack
  seam), `encounter-dataflow` (dataflow: intent → dispatch → reducer → log → projection → HUD),
  `intent-sequence` (sequence: player · client · Firestore `encounters/live` · DM client for one
  attack with a reaction), `encounter-lifecycle` (lifecycle: draft → active → paused → closed
  with undo/correction), `character-persistence` (dataflow: creation → five-document write →
  snapshots → import/reconcile).
- Modify: `.gitignore` (add `docs/diagrams/*.html`)

**Method (each document):** run `graphify query "<question>"` for the section's question before
opening files; cite files by path; every section ≤ 1 page; every "how it works" claim traceable
to a file. Diagrams: author the JSON per the archify skill (`schemas/`, one example), validate
with `node ~/.agents/skills/archify/bin/archify.mjs validate <type> <json> --quality showcase --json`
(all 9 checks, 0 errors, 0 warnings), export SVG with `deliver` + the export step the skill
documents, commit JSON + SVG, embed as `![...](diagrams/<name>.svg)`.

**ARCHITECTURE.md outline:** 1 Purpose and boundaries (v2, staging, production untouched) ·
2 Layers and dependency direction (data/types/stores/lib → views → features/UI) with
`system-architecture.svg` · 3 The engine (`src/lib/combat`: reducer, log, dice seam, projections)
with `encounter-dataflow.svg` · 4 Shared play (`campaigns/{id}/encounters/live`, lease,
automation levels ADR-0011) with `intent-sequence.svg` and `encounter-lifecycle.svg` · 5 Identity,
roster, membership (P02, `src/lib/identity`, rules) · 6 Library, homebrew, versions (P04–P08,
`src/lib/homebrew`, `src/features/library`) · 7 Creation and import (P10,
`src/lib/character-creation`) with `character-persistence.svg` · 8 Shell and navigation (P09) ·
9 Persistence, offline, rules (`firestore.rules`, `storage.rules`, codecs, unknown-key
preservation) · 10 Licensing partition and the pack seam · 11 Gates and budgets · 12 ADR index.

**MECHANICS.md outline:** the mechanics authoring format (from
`docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md`, absorbed here as the steering
required), the vocabulary the reducer executes today (actions, effects, costs, reactions), the
E01–E22 families and where each is implemented or pending (table with file paths), the manual
resolution contract, the dice seam.

**CHARACTER_SCHEMA.md outline:** the v2 stored shapes only (character parent, snapshots,
library instances, creation receipts, encounter documents), codec rules (closed world, unknown-key
preservation, `instanceId`), the six team fixtures as the validation set, migration protocol.

**DESIGN.md outline:** the V2 visual contract as built (keep the frontmatter tokens actually used
by `src/index.css`; the dark-only palette; the four scopes; the mock 0.9.3 as reference with links
into `docs/program/reference/`; the standing corrections from 7 Sept; the 9 Sept engagement
feedback as the open design question); everything about the v1 atlas and the light theme moves
to the archive.

**PROGRESS.md outline:** milestone sentence · current block (link NEXT.md) · release state of
`main` · what v2 is not yet (deploy, migration, cutover).

**TEST_PORTFOLIO.md outline:** the v2 gate (unit, rules, golden replays, accessibility sweep,
screenshot lane), measured durations at `08f8af0b`, the 15-minute target, what was deleted and why.

- [ ] **Step 1:** author and validate the five diagrams first (they are the spine of ARCHITECTURE).
- [ ] **Step 2:** write ARCHITECTURE, then MECHANICS, CHARACTER_SCHEMA, DESIGN, PROGRESS, TEST_PORTFOLIO.
- [ ] **Step 3:** `pnpm test --run tests/unit/docs-budget.test.ts` → PASS.
- [ ] **Step 4:** commit with `.changeset/v2-map-docs-rewritten.md`:
      `docs(map): rewrite the map documents from the v2 code with archify diagrams; add the docs budget test`.

### Task B7: repository skill directories

**Files:**

- Delete: `.claude/skills/impeccable/` (vendored 3.9.1; the global 4.1.1 is canonical),
  `.agents/skills/impeccable` (symlink to it)
- Keep: `.agents/skills/firebase-*` (official Firebase agent skills, project-scoped, both harnesses), `skills-lock.json`
- Modify: `.prettierignore` (drop the `.claude/skills/impeccable/` line)

- [ ] **Step 1:** `git rm -r .claude/skills/impeccable .agents/skills/impeccable`; edit `.prettierignore`.
- [ ] **Step 2:** `grep -rn "\.claude/skills/impeccable\|npx impeccable" --exclude-dir=node_modules --exclude-dir=docs/archive .` → fix any hit.
- [ ] **Step 3:** commit with `.changeset/v2-drop-vendored-impeccable.md`:
      `chore(skills): drop the vendored impeccable copy; the global skill layer is canonical`.

### Task B8: gates, integration, main pointer

- [ ] **Step 1:** `just ci` in the worktree → exit 0 (record durations); `just ci-srd-only` is not
      required (no public module changed) — run `pnpm typecheck` only.
- [ ] **Step 2:** `git fetch origin && git rebase origin/v2`; rerun `pnpm test --run tests/unit/docs-budget.test.ts`.
- [ ] **Step 3:** `git push origin HEAD:v2`; `git ls-remote origin refs/heads/v2` equals local HEAD.
- [ ] **Step 4 (main pointer):** from a fresh worktree off `origin/main`
      (`just wt-new kb-pointer chore` from the main checkout, which is clean and on `main`), replace
      `CLAUDE.md` with a ≤ 2 KB router: "this checkout is `main` = production; production fixes only
      (rule 11 adapter `just wt-new`); the product and the program live on `v2` — read
      `origin/v2:CLAUDE.md` and `origin/v2:docs/program/NEXT.md` before any other work; never merge
      `v2` into `main`; deploy is owner-gated". Keep `AGENTS.md` as the symlink. Changeset
      `.changeset/main-router-pointer.md`. The pre-push main gate runs (`just ci` equivalent) — it is
      a documentation-only change and must pass unchanged. Push `HEAD:main`, verify the SHA, remove the worktree.
- [ ] **Step 5:** update `docs/program/NEXT.md` on v2 with the integration SHAs (one more
      documentation commit, pushed `HEAD:v2`), then remove this task's worktree with
      `git worktree remove ~/Workspace/Codex/d20-folio-v2-knowledge-reset` after `git ls-remote` proves
      the SHA is on origin.

### Task A5: task-observer review (after Track B)

- [ ] **Step 1:** load `~/.agents/skills/task-observer/references/weekly-review.md` and run the
      review over the 94 OPEN observations: group by skill; observations whose rule is now a golden
      rule or a CONTRIBUTING lesson → `ACTIONED (2026-09-09) — folded into <doc>`; observations about
      deleted skills or superseded programs → `DECLINED (2026-09-09) — skill removed / program
superseded`; the rest → a ≤ 10-line addition to the kept skill's SKILL.md or leave OPEN with a
      one-line reason. Write `last-review-date.txt` = `2026-09-09`.
- [ ] **Step 2:** archive resolved entries per the skill's archival rule (backup, live re-read,
      header-count invariant).

---

## Self-review

- **Spec coverage:** decision 1 (one program) → B1, B2, B5; decision 2 (archive + rewrite, archify +
  graphify) → B0, B3, B4, B6; decision 3 (skills) → A1, B7; decision 4 (memory) → A2, A3, A5;
  decision 5 (graph committed + hook) → B0, B4, B5 rule 38; decision 6 (worktrees) → A4;
  decision 7 (handoff) → B1 NEXT.md, B5; decision 8 (PD block) → B1, B2; cross-harness parity →
  A1, A2, B5, B8 step 4; archify install → done before the plan (canonical
  `~/.agents/skills/archify`).
- **Placeholders:** none; every task names files, caps, sources and commands.
- **Consistency:** the block name `PD`, the branch `task/v2-knowledge-base-reset-20260909`, the
  headings of `NEXT.md`, and the caps table are identical across B1, B2, B4, B5, B8.
- **Repository guards:** the plan names no private fixture by file name; no secrets; English.
