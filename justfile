# d20 Folio — Development Commands
# Run `just` to see all available recipes

# Default: list recipes
default:
    @just --list

# ─── Setup ─────────────────────────────────────────────────

# First-time setup (installs deps + git hooks)
setup:
    pnpm install
    git config core.hooksPath .githooks
    @echo "✓ Git hooks installed (.githooks/pre-push)"

# ─── Development ───────────────────────────────────────────

# Start dev server (http://localhost:5173, opens browser)
dev:
    pnpm dev --open

# Start dev server with Firebase emulators
dev-emulators:
    pnpm dev:emulators --open

# Preview production build locally
preview: build
    pnpm preview --open

# ─── Quality ──────────────────────────────────────────────

# Typecheck (no emit)
check:
    pnpm typecheck

# Run all tests
test:
    pnpm test

# Run tests in watch mode
test-watch:
    pnpm test:watch

# Lint (zero warnings tolerance)
lint:
    pnpm lint --max-warnings 0

# Format code
fmt:
    pnpm format

# Full CI check (typecheck + lint + test + build)
ci: check lint test build

# The SRD-only lane — the composition the public repo snapshot builds:
# `@pack` pinned to the typed-empty stub (VITE_CONTENT_PACK=0), pack suites
# skipped, no coverage floors (those are pack-mode-only).
ci-srd-only:
    pnpm typecheck:srd-only
    pnpm test:srd-only
    pnpm build:srd-only

# ─── Build ────────────────────────────────────────────────

# Production build
build:
    pnpm build

# ─── Deploy (the FULL-matrix gate before users get code) ──────────────────────
# The deploy seam is the natural backstop for the heavy lane the pre-push hook
# DROPS (owner mandate 2026-06-12 — "keep it SAFE, but don't have CI checks run
# forever"). Users only get code through a deploy — so the full Playwright e2e
# matrix (chromium + mobile + portrait-sw) runs at the deploy seam, once per
# deploy, instead of on every push. Every behavioural check still runs
# MANDATORILY before a user sees the code. Deploys are ALWAYS explicitly
# owner-triggered (golden rule 22) — never ambient, never on push.
#
# THIS recipe is the PRIMARY deploy path (local); the remote twin is
# `gh workflow run deploy.yml --ref main` (the same gate + deploy on a GitHub
# runner — see .github/workflows/deploy.yml):
#
#   just deploy                   full gate + full e2e matrix + firebase deploy
#   FOLIO_SKIP_E2E=1 just deploy  skip the local e2e (use ONLY when this exact
#                                 SHA already has a green full e2e run
#                                 — ONE flow, no double-running)
#
# Gated deploy: full gate + full Playwright e2e matrix + firebase deploy (reuses `just ci`)
deploy: ci
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -n "${FOLIO_SKIP_E2E:-}" ]; then
        echo "→ skipping local e2e (FOLIO_SKIP_E2E set — trusting this commit's remote CI)"
    else
        echo "→ full e2e matrix (chromium + mobile + portrait-sw) — the deploy gate…"
        pnpm exec playwright install chromium >/dev/null 2>&1
        pnpm exec playwright test
    fi
    echo "→ deploying to Firebase Hosting + Firestore/Storage rules…"
    firebase deploy --only hosting,firestore:rules,storage --project d20-folio

# ─── Release (owner-triggered, agent-executed — THE release flow, permanently) ─
# There is no release workflow in CI: the changelog section is SYNTHESIZED —
# curated grouped entries (golden rule 17), a judgment step no version-PR bot
# can perform — so the agent runs the whole ritual locally on the owner's go.
# This recipe encodes the MECHANICAL steps; the two judgment gates — SYNTHESIZING
# the changelog (golden rule 17, agent-written; the owner may review wording) and
# DEPLOYING (golden rule 22 — never without explicit owner permission) — are
# explicit echoed prompts, NOT automated. Full flow: docs/RELEASE.md.
#
#   just release          bump via changesets, then PAUSE for the changelog
#                         synthesis, tag + push the tag, open the GitHub release
#
# Order: (1) bump+consume changesets → (2) PAUSE to synthesize the CHANGELOG.md
# section + commit → (3) tag & push → (4) gh release → then deploy SEPARATELY
# with `just deploy`.
release:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "→ bumping version + consuming changesets (pnpm changeset version)…"
    pnpm changeset:version
    version="v$(node -p "require('./package.json').version")"
    echo ""
    echo "⏸  SYNTHESIZE NOW (golden rule 17): rewrite the freshly-prepended CHANGELOG.md"
    echo "    section into curated, grouped professional entries — never ship the"
    echo "    verbose auto-dump. Then commit package.json + CHANGELOG.md + pnpm-lock.yaml:"
    echo "      git commit -am \"chore(release): $version\""
    read -r -p "    Press Enter once the release commit is made to tag $version… " _
    echo "→ tagging $version and pushing the tag…"
    git tag "$version"
    git push origin "$version"
    echo "→ opening the GitHub release for $version (curated notes auto-projected from CHANGELOG.md)…"
    notes_file="$(mktemp -t d20-relnotes.XXXXXX)"
    trap 'rm -f "$notes_file"' EXIT
    node scripts/release-notes.mjs "${version#v}" > "$notes_file"
    gh release create "$version" --title "$version" --notes-file "$notes_file"
    echo ""
    echo "✓ $version tagged + released. FINAL STEP (separate): deploy ONLY with explicit"
    echo "  owner permission (golden rule 22) — 'just deploy'."

# ─── SAFE-01 billing kill-switch (arm · status · restore) ─────────────────────
# One script (scripts/safe-01.sh) wraps the whole £1-cap lifecycle. Every recipe is
# idempotent + owner-run (they touch billing + IAM). Full runbook: docs/BUG_REPORTING.md
# § SAFE-01. Defuse mechanism + IAM rationale are documented there.

# One-shot idempotent setup: APIs · budget-kill topic · £1 budget wired to it · the
# detach IAM grant · deploy onBudgetAlert.
# Run once to arm the £1 kill-switch — then you're protected; re-running is always safe.
safe-arm:
    scripts/safe-01.sh arm

# Preview `safe-arm` without touching the project — prints every command it would run
safe-arm-dry:
    SAFE01_DRY_RUN=1 scripts/safe-01.sh arm

# Read-only: run anytime to check the switch → ARMED / NOT ARMED / FIRED
safe-status:
    scripts/safe-01.sh status

# DEFUSE (drop the detach grant) → re-link billing → re-enable APIs → re-arm (gated).
# Run this when it FIRES (billing detached); safe to run anytime, it no-ops if nothing fired.
safe-restore:
    scripts/safe-01.sh restore

# ─── Data ─────────────────────────────────────────────────

# Count all SRD entries
stats:
    @echo "=== SRD Data Stats ==="
    @echo -n "Spells:      " && grep -c '"id":' src/data/spells/*.ts 2>/dev/null || echo "0"
    @echo -n "Feats:       " && grep -c '"id":' src/data/feats.ts 2>/dev/null || echo "0"
    @echo -n "Species:     " && grep -c '"id":' src/data/races.ts 2>/dev/null || echo "0"
    @echo -n "Backgrounds: " && grep -c '"id":' src/data/backgrounds.ts 2>/dev/null || echo "0"
    @echo -n "Magic Items: " && grep -c '"id":' src/data/magic-items.ts 2>/dev/null || echo "0"
    @echo -n "Classes:     " && ls src/data/classes/*.ts 2>/dev/null | wc -l | tr -d ' '
    @echo ""

# ─── Parallel worktrees (branch off main → agent merge, NO PRs) ─────────────
# The repo standard for every change (docs/WORKTREES.md, golden rule 11). Each
# task gets its own worktree + branch off the freshest main; after gate-green +
# ponytail-review convergence (golden rule 12) the agent merges it FROM the
# worktree — `git rebase origin/main && git push origin HEAD:main` — polls
# origin for the SHA, then tears down:
#   just wt-new <slug> [kind]   create ../<project>-<slug> on <kind>/<slug> off origin/main
#   (cd into it; work; commit per step — hooks run the gate)
#   just wt-rm <slug>           remove the worktree once its merge has landed
#   just wt-list                show every worktree

# Create a new task worktree + branch off the freshest origin/main (kind defaults to "feat")
wt-new slug kind="feat":
    #!/usr/bin/env bash
    set -euo pipefail
    main_root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
    parent="$(dirname "$main_root")"
    project="$(basename "$main_root")"
    dest="$parent/$project-{{slug}}"
    branch="{{kind}}/{{slug}}"
    if [ -e "$dest" ]; then echo "✗ $dest already exists — pick another slug or 'just wt-rm {{slug}}'"; exit 1; fi
    if git -C "$main_root" show-ref --verify --quiet "refs/heads/$branch"; then echo "✗ branch $branch already exists"; exit 1; fi
    echo "→ fetching origin/main…"
    git -C "$main_root" fetch origin main --quiet
    echo "→ creating worktree $dest on branch $branch (off origin/main)…"
    git -C "$main_root" worktree add -b "$branch" "$dest" origin/main
    if [ -f "$main_root/.env.local" ]; then cp "$main_root/.env.local" "$dest/.env.local"; echo "→ copied .env.local (dev preview)"; fi
    # Content-pack symlink → COMPOSED-mode gate (docs/CONTRIBUTING.md → "The two build modes").
    # The maintainer's private pack lives in a sibling checkout, symlinked into the main checkout as
    # `content-pack` (a relative `../d20-folio-content/content-pack`). Replicate that SAME target into
    # the new worktree — sibling dirs, so it resolves identically — so its pre-push gate runs COMPOSED
    # (pack tests included), closing the gap where a pack-absent worktree silently gated SRD-only and
    # let a public API change break the pack. No pack sibling (external contributors) → skipped
    # silently → SRD-only, unchanged. Guarded on the target resolving, so it never links a dangle.
    pack_link="$(readlink "$main_root/content-pack" 2>/dev/null || true)"
    if [ -n "$pack_link" ] && [ -e "$main_root/content-pack" ]; then
        ln -s "$pack_link" "$dest/content-pack"
        echo "→ linked content-pack ($pack_link) → COMPOSED mode (pack tests gate here)"
    else
        echo "→ no content pack → SRD-only mode (external-contributor gate)"
    fi
    echo "→ installing deps + git hooks…"
    ( cd "$dest" && pnpm install --silent && git config core.hooksPath .githooks )
    echo ""
    echo "✓ worktree ready: $dest   (branch $branch)"
    echo "  next:  cd $dest  →  work + commit per step  →  converge  →  rebase + push origin HEAD:main"

# Remove a task worktree once its merge has landed (safe: refuses if it has uncommitted changes)
wt-rm slug:
    #!/usr/bin/env bash
    set -euo pipefail
    main_root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
    dest="$(dirname "$main_root")/$(basename "$main_root")-{{slug}}"
    git -C "$main_root" worktree remove "$dest"
    echo "✓ removed worktree $dest"
    echo "  branch kept — once its merge has landed on origin/main, delete it: git branch -d <branch>"

# List every worktree
wt-list:
    @echo "=== worktrees ===" && git worktree list
