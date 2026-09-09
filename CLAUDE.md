# d20 Folio — agent briefing for the `main` checkout

**You are on `main` = production.** This branch receives production fixes only. The product, the
program and the knowledge base live on the long-lived branch `v2` (owner decision 2026-09-03,
reset 2026-09-09). `AGENTS.md` is a symlink to this file, so it binds Claude Code and Codex alike.

## Before any other work

1. Read `origin/v2:CLAUDE.md` (`git show origin/v2:CLAUDE.md`) — the single router for the
   product: direction, authority roles, invariants, delivery workflow, knowledge base, tool routing.
2. Read `origin/v2:docs/program/NEXT.md` — the only handoff: current block, closed blocks with
   SHAs, open gates, recent owner decisions, the five-line opening prompt.
3. Work on `v2` from a fresh topic worktree off `origin/v2` (`origin/v2:docs/WORKTREES.md`).
   Never edit in this checkout, never merge `v2` into `main`, never push `HEAD:main` from a `v2`
   task.

## Production fixes (the only work that belongs here)

- Setup: `scripts/program-supervisor/bootstrap-worktree.sh`. This pinned idempotent bootstrap
  verifies Node 24.16.0 and pnpm 11.2.2, installs the root and standalone `functions/`
  dependencies, and configures `core.hooksPath=.githooks`.
- Branch from fresh `origin/main` with `just wt-new <slug> <kind>`; small Conventional Commits,
  owner sole author, one `.changeset/*.md` per commit; never `--no-verify`; the `main` pre-push
  gate is authoritative; `just ci-srd-only` when the licensing seam is touched.
- Live users: preserve stored characters; migrations follow snapshot → dry-run → idempotent apply
  → verify. Every visual change is owner-approved from curated screenshots before integration.
- Deploy and release are owner-gated, always: never `firebase deploy`, `just deploy` or
  `gh workflow run deploy.yml` without the owner's explicit word for that change.
- Cherry-pick a production fix into `v2` when it matters there (rule in `origin/v2:PRODUCT.md`
  §Steering, delivery posture).

## What still applies on this branch

The v1 documents in this checkout (`docs/ARCHITECTURE.md`, `docs/MECHANICS.md`, `PROGRESS.md`,
`DESIGN.md`, …) describe the production code as it runs today; they are history on `v2`
(`origin/v2:docs/archive/v1/`). Secrets never go in the repo or in agent memory. The licensing
partition (public SRD vs private `content-pack/`) and the bilingual EN+IT rule hold everywhere.
