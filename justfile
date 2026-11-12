# d20 Folio — Development Commands
# Run `just` to see all available recipes

# Default: list recipes
default:
    @just --list

# ─── Setup ─────────────────────────────────────────────────

# First-time setup (installs deps + git hooks)
setup:
    pnpm install
    npm --prefix functions ci --prefer-offline --no-audit
    git config core.hooksPath .githooks
    @echo "✓ Git hooks installed (.githooks/pre-commit)"

# ─── Development ───────────────────────────────────────────

# Start dev server (http://localhost:5173, opens browser)
dev:
    pnpm dev --open

# Start the complete seeded local sandbox (Auth + Firestore + Storage + Functions).
# One process owns the emulator lifecycle, seeds deterministic users/campaign data,
# starts Vite, and shuts everything down together on Ctrl-C.
dev-emulators:
    pnpm dev:emulators

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

# Run Cloud Functions tests
test-functions:
    pnpm test:functions

# Run tests in watch mode
test-watch:
    pnpm test:watch

# Lint (zero warnings tolerance)
lint:
    pnpm lint --max-warnings 0

# Format code
fmt:
    pnpm format

# Full CI check (typecheck + lint + app tests + Functions tests + build)
ci: check lint test test-functions build

# The SRD-only lane — the composition the public repo snapshot builds:
# `@pack` pinned to the typed-empty stub (VITE_CONTENT_PACK=0), pack suites
# skipped, no coverage floors (those are pack-mode-only).
ci-srd-only:
    pnpm typecheck:srd-only
    pnpm test:srd-only
    pnpm build:srd-only

# The runtime content pack end to end on the emulators: an allowlisted account
# sees every team sheet exactly as the bundled build does, offline after the first
# load, and behind a loading notice while the download fails. Needs content-pack.
e2e-pack:
    bash scripts/pack/e2e-pack.sh

# The release rehearsal: a player's whole journey on the new-UI build (VITE_NEW_UI +
# the v0.26 combat effects) against the seeded emulators. Run it under the heavy lock.
e2e-rehearsal *args:
    bash scripts/e2e-rehearsal.sh {{args}}

# Merge app PRs the way main's ruleset requires (up to date, the 8 CI checks green on that
# head), one after the other. A PR that needs a pack PR: scripts/lockstep-merge.sh.
merge-pr +prs:
    bash scripts/merge-pr.sh {{prs}}

# Open or edit a PR through the private-text scan (no licensed-setting term, no identity
# value in the title or body; GitHub keeps every revision). Needs the linked pack.
#   just pr-create --title "…" --body-file body.md [--base main --head branch …]
#   just pr-edit 1234 --title "…" --body-file body.md
[positional-arguments]
pr-create *args:
    bash scripts/pr-text.sh create "$@"

[positional-arguments]
pr-edit pr *args:
    bash scripts/pr-text.sh edit "$@"

# ─── Build ────────────────────────────────────────────────

# Production build
build:
    pnpm build

# Fetch the linked pack checkout's origin and stop if it lags origin/main (never pulls).
pack-fresh:
    #!/usr/bin/env bash
    set -euo pipefail
    [ -e content-pack ] || exit 0
    top="$(git -C "$(cd content-pack && pwd -P)/.." rev-parse --show-toplevel)"
    git -C "$top" fetch --quiet origin main || echo "! could not fetch the pack origin; checking the last fetched state"
    node --import ./scripts/alias-loader.mjs -e 'import("./scripts/pack/pack-freshness-setup.ts").then((m) => m.default())'

# The bundle budget on the COMPOSED build, the one `deploy.yml` ships. CI's `build +
# budget` job builds SRD-only, so the private pack's growth (its EN text rides the
# eager closure) is measured here, in CI's `build + budget (composed)` PR job, in
# Verify's `conformance + budget (composed)` job and at deploy time. Needs `content-pack` linked to the pack's origin/main.
budget-pack: pack-fresh
    @test -e content-pack/index.ts || { echo "✗ content-pack is not linked: link the pack (its origin/main) first."; exit 1; }
    pnpm build
    pnpm test:budget

# ─── Deploy (dispatch the sole production path — GOLDEN_RULES Vincoli #2) ─────
# CI + Verify prove main ambiently; deploy.yml promotes that exact SHA, backs up
# Firestore, deploys Functions + Hosting + rules, and checks Functions/SAFE-01.
# There is deliberately no local Firebase-deploy twin to drift from the workflow.
deploy:
    #!/usr/bin/env bash
    set -euo pipefail
    [ -z "$(git status --porcelain)" ] || { echo "✗ working tree is dirty"; exit 1; }
    git fetch origin main --quiet
    local_sha="$(git rev-parse HEAD)"
    remote_sha="$(git rev-parse origin/main)"
    [ "$local_sha" = "$remote_sha" ] || {
        echo "✗ HEAD is not the current origin/main; refusing to dispatch"
        exit 1
    }
    gh workflow run deploy.yml --ref main
    echo "✓ Deploy workflow dispatched for $remote_sha"

# ─── Release (owner-triggered, agent-executed — THE release flow, permanently) ─
# There is no release workflow in CI: the changelog section is SYNTHESIZED —
# curated grouped entries (docs/RELEASE.md), a judgment step no version-PR bot
# can perform — so the agent runs the whole ritual locally on the owner's go.
# This recipe encodes the MECHANICAL steps; the two judgment gates — SYNTHESIZING
# the changelog (docs/RELEASE.md, agent-written; the owner may review wording) and
# DEPLOYING (GOLDEN_RULES Vincoli #2 — never without explicit owner permission) — are
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
    echo "⏸  SYNTHESIZE NOW (docs/RELEASE.md): rewrite the freshly-prepended CHANGELOG.md"
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
    echo "  owner permission (GOLDEN_RULES Vincoli #2) — 'just deploy'."

# ─── SAFE-01 billing kill-switch (arm · status · restore) ─────────────────────
# One script (scripts/safe-01.sh) wraps the whole £15-cap lifecycle. Every recipe is
# idempotent + owner-run (they touch billing + IAM). Full runbook: docs/BUG_REPORTING.md
# § SAFE-01. Defuse mechanism + IAM rationale are documented there.

# One-shot idempotent setup: APIs · budget-kill topic · £15 budget wired to it · the
# detach IAM grant · deploy onBudgetAlert.
# Run once to arm the £15 kill-switch — then you're protected; re-running is always safe.
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

# ─── Worktrees ─────────────────────────────────────────────
# A parallel session gets its worktree from the agent harness; set it up with
# `scripts/program-supervisor/bootstrap-worktree.sh` (pins, deps, hooks, its own pack).

# List every worktree
wt-list:
    @echo "=== worktrees ===" && git worktree list
