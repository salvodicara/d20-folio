#!/usr/bin/env bash
# Merge an app PR that needs a content-pack PR (a "lockstep" pair) without leaving main
# red in between.
#
# Why: main's Verify composes the pack's main at the moment it starts. Merged one after
# the other with a ~25-minute Verify in between, either order leaves main composing a
# pack and an app that don't match. So the pair is verified together BEFORE anything
# merges: Verify runs on the app PR's branch composing the pack PR's head commit. Only
# when that is green, and neither the pack's main nor either PR moved since, are the
# pack and then the app merged back to back (seconds apart).
#
# The app PR names its pack PR with a line in its body:   Pack: #114
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
packBranch="$(gh pr view "$pack" --repo "$PACK_REPO" --json headRefName --jq .headRefName)"
echo "App #$app (branch $branch) ↔ pack #$pack (branch $packBranch)"

behindMain() { # repo, branch → commits the branch lacks from that repo's main
  local main
  main="$(gh api "repos/$1/commits/main" --jq .sha)"
  gh api "repos/$1/compare/$main...$2" --jq .behind_by
}

# 0. Both branches must contain their repo's main: what is verified is then exactly
#    what main becomes once both merge.
if [ "$(behindMain "$APP_REPO" "$branch")" != "0" ]; then
  echo "✗ $branch is behind main: rebase it first (nothing merged)." >&2
  exit 1
fi
state="$(gh pr view "$pack" --repo "$PACK_REPO" --json state --jq .state)"
if [ "$state" != "OPEN" ]; then
  echo "✗ pack #$pack is $state: the pair must be verified before the pack merges." >&2
  exit 1
fi
if [ "$(behindMain "$PACK_REPO" "$packBranch")" != "0" ]; then
  echo "✗ pack branch $packBranch is behind the pack's main: rebase it first (nothing merged)." >&2
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

# 2. Verify the pair: the app branch composed with the pack PR's head commit.
appHead="$(gh pr view "$app" --repo "$APP_REPO" --json headRefOid --jq .headRefOid)"
packHead="$(gh pr view "$pack" --repo "$PACK_REPO" --json headRefOid --jq .headRefOid)"
packMainBefore="$(gh api "repos/$PACK_REPO/commits/main" --jq .sha)"
since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run verify.yml --repo "$APP_REPO" --ref "$branch" -f pack_sha="$packHead"
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
echo "Verify run $run: $branch (${appHead:0:8}) + pack ${packHead:0:8}…"
gh run watch "$run" --repo "$APP_REPO" --interval 120 >/dev/null || true
conclusion="$(gh run view "$run" --repo "$APP_REPO" --json conclusion --jq .conclusion)"
if [ "$conclusion" != "success" ]; then
  echo "✗ Verify $run: $conclusion. Nothing merged." >&2
  exit 1
fi
dir="$(mktemp -d)"
gh run download "$run" --repo "$APP_REPO" --name verified-pack --dir "$dir"
composed="$(cat "$dir/verified-pack.txt")"
rm -rf "$dir"
if [ "$composed" != "$packHead" ]; then
  echo "✗ Verify composed pack ${composed:0:8}, not the pack PR's head ${packHead:0:8}." >&2
  exit 1
fi

# 3. The pair may not have moved while Verify ran: neither PR's head, nor the pack's
#    main (the pack squash-merges onto it, so the verified pack must stay main + PR).
#    App main may move: merging onto a newer main is what any PR does, and the app
#    must not be behind main when the pair merges (checked again below).
if [ "$(gh api "repos/$PACK_REPO/commits/main" --jq .sha)" != "$packMainBefore" ] ||
  [ "$(gh pr view "$app" --repo "$APP_REPO" --json headRefOid --jq .headRefOid)" != "$appHead" ] ||
  [ "$(gh pr view "$pack" --repo "$PACK_REPO" --json headRefOid --jq .headRefOid)" != "$packHead" ]; then
  echo "✗ the pack's main or a PR moved during Verify: rebase and run again (nothing merged)." >&2
  exit 1
fi
# Right before the pack: the app PR must still merge cleanly onto today's main
# (another merge may have landed meanwhile). GitHub computes this lazily, so wait for
# a verdict; anything but MERGEABLE + CLEAN stops here, before the pack is touched.
for _ in $(seq 1 20); do
  verdict="$(gh pr view "$app" --repo "$APP_REPO" --json mergeable,mergeStateStatus \
    --jq '.mergeable + " " + .mergeStateStatus')"
  case "$verdict" in UNKNOWN* | *" UNKNOWN") sleep 15 ;; *) break ;; esac
done
if [ "$verdict" != "MERGEABLE CLEAN" ]; then
  echo "✗ #$app is not cleanly mergeable onto main ($verdict): rebase and run again (nothing merged)." >&2
  exit 1
fi

# 4. The pair, back to back.
gh pr merge "$pack" --repo "$PACK_REPO" --squash --delete-branch
gh pr merge "$app" --repo "$APP_REPO" --squash --delete-branch
echo "pack #$pack: $(gh pr view "$pack" --repo "$PACK_REPO" --json state --jq .state) · app #$app: $(gh pr view "$app" --repo "$APP_REPO" --json state --jq .state)"
