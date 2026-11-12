#!/usr/bin/env bash
# Refuse a content-pack PR whose commits would have failed the pack's pre-commit
# (scripts/pack-hooks/pre-commit), judged on what lands (the pack squash-merges, so one
# commit, the PR's whole diff): it adds a changeset, and every file it changes is
# formatted with the app's Prettier. Run before merging any pack PR;
# scripts/lockstep-merge.sh runs it for a pair. A commit made without the hook is
# caught here instead of relying on someone noticing.
#
# Usage: scripts/pack-pr-check.sh <pack PR number>
# Prints file paths only (never their contents).
set -euo pipefail

PACK_REPO="salvodicara/d20-folio-content"
pr="${1:?Usage: scripts/pack-pr-check.sh <pack PR number>}"
app="$(cd "$(dirname "$0")/.." && pwd -P)"

work="$(mktemp -d "${TMPDIR:-/tmp}/pack-pr-check.XXXXXX")"
cleanup() { rm -rf "$work"; }
trap cleanup EXIT

head="$(gh pr view "$pr" --repo "$PACK_REPO" --json headRefOid --jq .headRefOid)"
base="$(gh pr view "$pr" --repo "$PACK_REPO" --json baseRefName --jq .baseRefName)"
git clone --quiet --filter=blob:none "https://github.com/$PACK_REPO.git" "$work/pack"
git -C "$work/pack" fetch --quiet origin "$head"
range="origin/$base...$head"

bad=0
# 1. The PR stages a changeset. The pack squash-merges, so what lands on main is one
#    commit, the PR's whole diff: that is what the pre-commit would have checked.
if ! git -C "$work/pack" diff --name-only "$range" | grep -qE '^\.changeset/[^/]+\.md$'; then
  echo "✗ the PR adds no changeset"
  bad=1
fi

# 2. Every file the PR changes is formatted (at the PR's head).
git -C "$work/pack" checkout --quiet "$head"
files=()
while IFS= read -r f; do
  case "$f" in *.ts | *.tsx | *.json | *.md) [ -f "$work/pack/$f" ] && files+=("$f") ;; esac
done < <(git -C "$work/pack" diff --name-only "$range")
if [ "${#files[@]}" -gt 0 ]; then
  if ! (cd "$work/pack" && "$app/node_modules/.bin/prettier" --config "$app/.prettierrc" --check "${files[@]}"); then
    bad=1
  fi
fi

if [ "$bad" -ne 0 ]; then
  echo "✗ pack #$pr would have failed the pack's pre-commit: fix it on its branch before merging."
  exit 1
fi
echo "✓ pack #$pr: a changeset, and every changed file formatted."
