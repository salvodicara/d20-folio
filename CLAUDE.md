# d20 Folio — agent briefing

`AGENTS.md` is a symlink to this file: Claude Code and Codex read the same instructions.

d20 Folio is a digital character sheet and session companion for the owner's two D&D 2024 groups,
who play at the table or on Owlbear. **`main` is the product and is live**: friends play on it
with real characters. Read before product work:

- [docs/VISION.md](docs/VISION.md) — what Folio is becoming: the session log, minimal
  declaration, the phased scope and the interaction decisions.
- [docs/GOLDEN_RULES.md](docs/GOLDEN_RULES.md) — the owner's taste and the way of
  working, approved 2026-10-08. The newest dated owner line wins.

The `v2` rewrite is archived (tag `archive/2026-10-08-v2`): a quarry for specific parts, recovered
one at a time onto `main`, never a base to resume. Its docs describe that branch, not this one.

## Working here

- One session = one clearly named branch off fresh `origin/main` in this checkout, so the owner
  can follow the diff. Worktrees only for genuinely parallel sessions.
- Setup: `scripts/program-supervisor/bootstrap-worktree.sh` (Node 24.16.0, pnpm 11.2.2, hooks).
  Commands live in the `justfile` (`just dev`, `just test`, `just ci`).
- Small Conventional Commits, the owner as sole author. The pre-commit hook requires a staged
  `.changeset/*.md` (an empty `---\n---` one is fine for docs-only work) and formats with Prettier.
  The `main` pre-push gate is authoritative; run every hook.
- Behaviour changes are test-first (`tdd`); bugs go through `diagnosing-bugs`. A test takes its
  cases from the thing it checks and is proven by breaking the code on purpose.
- UI is verified in a real browser (`playwright-cli`), with before/after screenshots shown in chat.
  A visible change reaches `main` only after the owner approves it.

## Owner-gated, always

- Push to `main`, deploy (`just deploy`, `firebase deploy`, the deploy workflow) and release.
- Live data: stored characters are never lost. Migrations go snapshot → dry-run → idempotent apply
  → verify; applying to real data needs the owner's yes each time.
- Licensing: SRD material is public; everything else lives in the private `content-pack/`. Run
  `just ci-srd-only` when that boundary is touched; update the pack in the same change when a seam
  it consumes moves.
- Every user-visible string ships in English and Italian; store IDs, render labels.
- Secrets never enter the repo, logs, docs or agent memory.

The production-code docs (`docs/ARCHITECTURE.md`, `docs/MECHANICS.md`, `DESIGN.md`, `PRODUCT.md`)
describe today's code but predate the 2026-10-08 direction; when they disagree with the two
documents above, those win and the old doc gets fixed in the same change.
