#!/usr/bin/env bash
# Merge an app PR that needs a content-pack PR (a "lockstep" pair) without ever leaving
# main red in between.
#
# Why: main's Verify composes the pack's main at the moment it starts. Merging the app
# first ran Verify against the OLD pack (red until the pack landed); a pack merge alone
# triggers no app Verify. So the pack goes first, and the app merges only after a
# composed Verify of the app PR's own branch has passed against that merged pack.
#
# The app PR names its pack PR with a line in its body:   Pack: #114
#
# Steps: the app PR's own checks green → the pack PR merged (merged here if still open)
# → Verify dispatched on the app PR's branch, pinned to a pack commit that contains the
# pack merge, and green → the app PR merged.
#
# Usage: scripts/lockstep-merge.sh <app PR number>
# Needs: gh (authenticated with access to both repos). Never touches production.
set -euo pipefail

APP_REPO="salvodicara/d20-folio"
PACK_REPO="salvodicara/d20-folio-content"
app="${1:?usage: lockstep-merge.sh <app PR number>}"

body="$(gh pr view "$app" --repo "$APP_REPO" --json body --jq .body)"
pack="$(grep -oE '^Pack: #[0-9]+' <<<"$body" | head -1 | grep -oE '[0-9]+' || true)"
if [ -z "$pack" ]; then
  echo "✗ #$app names no pack PR (add a line 'Pack: #<number>' to its description)." >&2
  exit 1
fi
branch="$(gh pr view "$app" --repo "$APP_REPO" --json headRefName --jq .headRefName)"
echo "App #$app (branch $branch) ↔ pack #$pack"

# 0. The app branch must contain main's head: a branch cut before an engine change the
#    pack already uses fails its composed typecheck AFTER the pack has merged.
mainHead="$(gh api "repos/$APP_REPO/commits/main" --jq .sha)"
behind="$(gh api "repos/$APP_REPO/compare/$mainHead...$branch" --jq .behind_by)"
if [ "$behind" != "0" ]; then
  echo "✗ $branch is $behind commit(s) behind main: rebase it first (nothing merged)." >&2
  exit 1
fi

# 1. The app PR's own checks (the SRD-only CI) must be green; right after a push
#    they take a moment to register.
for _ in $(seq 1 40); do
  [ "$(gh pr checks "$app" --repo "$APP_REPO" --json name --jq length 2>/dev/null || echo 0)" -gt 0 ] && break
  sleep 15
done
gh pr checks "$app" --repo "$APP_REPO" --watch --interval 60 >/dev/null || true
bad="$(gh pr checks "$app" --repo "$APP_REPO" --json name,state \
  --jq '.[]|select(.state!="SUCCESS" and .state!="SKIPPED")|.name')"
if [ -n "$bad" ]; then
  echo "✗ #$app checks not green: $bad" >&2
  exit 1
fi

# 2. The pack PR first (a pack merge alone triggers no app Verify).
state="$(gh pr view "$pack" --repo "$PACK_REPO" --json state --jq .state)"
if [ "$state" = "OPEN" ]; then
  gh pr merge "$pack" --repo "$PACK_REPO" --squash --delete-branch
  state="$(gh pr view "$pack" --repo "$PACK_REPO" --json state --jq .state)"
fi
if [ "$state" != "MERGED" ]; then
  echo "✗ pack #$pack is $state, not merged." >&2
  exit 1
fi
packMerge="$(gh pr view "$pack" --repo "$PACK_REPO" --json mergeCommit --jq .mergeCommit.oid)"
echo "Pack #$pack merged as ${packMerge:0:8}"

# 3. A composed Verify of the app branch, pinned to a pack that contains that merge.
since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run verify.yml --repo "$APP_REPO" --ref "$branch"
run=""
for _ in $(seq 1 20); do
  sleep 15
  run="$(gh run list --repo "$APP_REPO" --workflow verify.yml --branch "$branch" \
    --event workflow_dispatch --json databaseId,createdAt \
    --jq "[.[]|select(.createdAt >= \"$since\")][0].databaseId // empty")"
  [ -n "$run" ] && break
done
if [ -z "$run" ]; then
  echo "✗ the dispatched Verify on $branch never appeared." >&2
  exit 1
fi
echo "Verify run $run on $branch…"
gh run watch "$run" --repo "$APP_REPO" --interval 120 >/dev/null || true
conclusion="$(gh run view "$run" --repo "$APP_REPO" --json conclusion --jq .conclusion)"
if [ "$conclusion" != "success" ]; then
  echo "✗ Verify $run on $branch: $conclusion. Not merging #$app." >&2
  exit 1
fi
dir="$(mktemp -d)"
gh run download "$run" --repo "$APP_REPO" --name verified-pack --dir "$dir"
composed="$(cat "$dir/verified-pack.txt")"
rm -rf "$dir"
status="$(gh api "repos/$PACK_REPO/compare/$packMerge...$composed" --jq .status)"
case "$status" in
  identical | ahead) ;;
  *)
    echo "✗ Verify composed pack ${composed:0:8}, which does not contain #$pack (${packMerge:0:8}): $status." >&2
    exit 1
    ;;
esac
echo "Verify $run green on pack ${composed:0:8} (contains #$pack)"

# 4. Only now the app.
gh pr merge "$app" --repo "$APP_REPO" --squash --delete-branch
echo "#$app: $(gh pr view "$app" --repo "$APP_REPO" --json state --jq .state)"
