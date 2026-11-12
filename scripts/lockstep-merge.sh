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
# main's ruleset requires the app branch up to date with main. So a branch that is
# behind (its own main, or the pack's) is brought up to date here (`gh pr
# update-branch`), its checks are awaited on the new head and the pair is verified
# again; the same happens if main moves while Verify runs. At most 4 rounds.
#
# The app PR names its pack PR with ONE line in its body:   Pack: #114
# (two or more refuse, unless the pack PR is passed as the second argument).
#
# Usage: scripts/lockstep-merge.sh <app PR number> [pack PR number]
# Needs: gh (authenticated with access to both repos). Never touches production.
set -euo pipefail

APP_REPO="salvodicara/d20-folio"
PACK_REPO="salvodicara/d20-folio-content"
app="${1:?usage: lockstep-merge.sh <app PR number> [pack PR number]}"
# shellcheck source=lib/lockstep-pack.sh
source "$(dirname "$0")/lib/lockstep-pack.sh"

body="$(gh pr view "$app" --repo "$APP_REPO" --json body --jq .body)"
# Exactly one pack: a body with two `Pack:` lines (one pasted from another PR) once
# paired an app with the wrong pack (2026-11-12).
pack="$(resolve_pack_pr "$body" "${2:-}")" || exit 1
branch="$(gh pr view "$app" --repo "$APP_REPO" --json headRefName --jq .headRefName)"
packBranch="$(gh pr view "$pack" --repo "$PACK_REPO" --json headRefName --jq .headRefName)"
echo "App #$app (branch $branch) ↔ pack #$pack (branch $packBranch)"

behindMain() { # repo, branch → commits the branch lacks from that repo's main
  local main
  main="$(gh api "repos/$1/commits/main" --jq .sha)"
  gh api "repos/$1/compare/$main...$2" --jq .behind_by
}

# Bring a PR's branch up to date with its main and wait until its head moves.
updateBranch() { # repo, PR
  local before
  before="$(gh pr view "$2" --repo "$1" --json headRefOid --jq .headRefOid)"
  echo "$1#$2 is behind its main: updating the branch…"
  if ! gh pr update-branch "$2" --repo "$1" >/dev/null 2>&1; then
    echo "✗ $1#$2 does not merge cleanly with main: resolve it by hand (nothing merged)." >&2
    exit 1
  fi
  until [ "$(gh pr view "$2" --repo "$1" --json headRefOid --jq .headRefOid)" != "$before" ]; do
    sleep 10
  done
}

state="$(gh pr view "$pack" --repo "$PACK_REPO" --json state --jq .state)"
if [ "$state" != "OPEN" ]; then
  echo "✗ pack #$pack is $state: the pair must be verified before the pack merges." >&2
  exit 1
fi

# One round: up to date → app checks → Verify the pair → still unmoved and clean.
# Returns 0 when the pair may merge now (appHead and packHead set), 2 to go again.
round() {
  # 0. Both branches contain their repo's main: what is verified is then exactly
  #    what main becomes once both merge.
  if [ "$(behindMain "$APP_REPO" "$branch")" != "0" ]; then updateBranch "$APP_REPO" "$app"; fi
  if [ "$(behindMain "$PACK_REPO" "$packBranch")" != "0" ]; then
    updateBranch "$PACK_REPO" "$pack"
  fi

  # 1. The app PR's own checks (the CI the ruleset requires) must all be finished and
  #    green on its head. Fail CLOSED: an empty or failed read means wait, never go on.
  local appHead0 runs bad run conclusion dir composed since packMainBefore verdict
  appHead0="$(gh pr view "$app" --repo "$APP_REPO" --json headRefOid --jq .headRefOid)"
  while :; do
    runs="$(gh api "repos/$APP_REPO/commits/$appHead0/check-runs?per_page=100" \
      --jq '[.check_runs[]|{name,status,conclusion,started_at}]|group_by(.name)|map(max_by(.started_at))' 2>/dev/null || true)"
    if [ -n "$runs" ] && [ "$(jq length <<<"$runs")" -gt 0 ] &&
      [ "$(jq '[.[]|select(.status!="completed")]|length' <<<"$runs")" -eq 0 ]; then
      break
    fi
    sleep 30
  done
  bad="$(jq -r '.[]|select(.conclusion!="success" and .conclusion!="skipped" and .conclusion!="neutral")|.name' <<<"$runs")"
  if [ -n "$bad" ]; then
    echo "✗ #$app checks not green: $bad" >&2
    exit 1
  fi

  # 2. Verify the pair: the app branch composed with the pack PR's head commit.
  appHead="$(gh pr view "$app" --repo "$APP_REPO" --json headRefOid --jq .headRefOid)"
  if [ "$appHead" != "$appHead0" ]; then
    echo "#$app moved while its checks ran: going again."
    return 2
  fi
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
  #    If something moved, or app main moved so the branch is behind, go again.
  if [ "$(gh api "repos/$PACK_REPO/commits/main" --jq .sha)" != "$packMainBefore" ] ||
    [ "$(gh pr view "$app" --repo "$APP_REPO" --json headRefOid --jq .headRefOid)" != "$appHead" ] ||
    [ "$(gh pr view "$pack" --repo "$PACK_REPO" --json headRefOid --jq .headRefOid)" != "$packHead" ]; then
    echo "The pack's main or a PR moved during Verify: going again."
    return 2
  fi
  if [ "$(behindMain "$APP_REPO" "$branch")" != "0" ]; then
    echo "main moved during Verify: going again."
    return 2
  fi
  # Right before the pack: the app PR must merge cleanly onto today's main. GitHub
  # computes this lazily, so wait for a verdict; anything but MERGEABLE + CLEAN stops
  # here, before the pack is touched.
  for _ in $(seq 1 20); do
    verdict="$(gh pr view "$app" --repo "$APP_REPO" --json mergeable,mergeStateStatus \
      --jq '.mergeable + " " + .mergeStateStatus')"
    case "$verdict" in UNKNOWN* | *" UNKNOWN") sleep 15 ;; *) break ;; esac
  done
  if [ "$verdict" = "MERGEABLE BEHIND" ]; then return 2; fi
  if [ "$verdict" != "MERGEABLE CLEAN" ]; then
    echo "✗ #$app is not cleanly mergeable onto main ($verdict): resolve it (nothing merged)." >&2
    exit 1
  fi
  return 0
}

appHead=""
packHead=""
ready=""
for _ in 1 2 3 4; do
  if round; then
    ready=1
    break
  fi
done
if [ -z "$ready" ]; then
  echo "✗ main kept moving: try again later (nothing merged)." >&2
  exit 1
fi

# 4. The pair, back to back. main's ruleset requires the app branch up to date and its
#    8 CI checks green on that head; both were checked above, and the pack merge does
#    not touch the app branch. The app merges pinned to the head Verify saw. If it is
#    refused anyway (main moved in the seconds between), say so loudly: the pack is in.
gh pr merge "$pack" --repo "$PACK_REPO" --squash --delete-branch
if ! gh api -X PUT "repos/$APP_REPO/pulls/$app/merge" -f merge_method=squash -f sha="$appHead" \
  -f commit_title="$(gh pr view "$app" --repo "$APP_REPO" --json title --jq .title) (#$app)" >/dev/null; then
  echo "✗ pack #$pack is merged but app #$app was refused (main moved, or a check is not green)." >&2
  echo "  main now composes the new pack with the old app: run scripts/merge-pr.sh $app now." >&2
  exit 1
fi
gh api -X DELETE "repos/$APP_REPO/git/refs/heads/$branch" >/dev/null 2>&1 || true
echo "pack #$pack: $(gh pr view "$pack" --repo "$PACK_REPO" --json state --jq .state) · app #$app: $(gh pr view "$app" --repo "$APP_REPO" --json state --jq .state)"
