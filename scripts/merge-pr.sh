#!/usr/bin/env bash
# Merge app PRs onto main, one after the other, the way main's ruleset requires: the
# branch up to date with main and the 8 CI checks green on that exact head. (A merge
# queue would do this for us, but GitHub offers it only on organization-owned repos.)
#
# For each PR:
#   1. bring it up to date with main (`gh pr update-branch`, a merge commit); a conflict
#      stops here, to be resolved by hand;
#   2. wait for every check on the new head to finish, and require each one green;
#   3. merge with the head pinned (`sha`), so a push in the meantime is never merged
#      unchecked. If main moved first (another merge landed), go back to 1.
#
# It fails CLOSED: a read that errors or comes back empty means wait, never merge (an
# empty read once let a red PR through, 2026-11-10).
#
# Usage: scripts/merge-pr.sh <PR> [<PR> ...]      (squash, branch deleted)
# A PR that needs a content-pack PR goes through scripts/lockstep-merge.sh instead.
set -uo pipefail

REPO="salvodicara/d20-folio"
# Mirrors ruleset 26955959 on main (the required status checks).
REQUIRED=(
  "typecheck + lint"
  "unit (SRD-only, shard 1/2)"
  "unit (SRD-only, shard 2/2)"
  "build + budget"
  "build + budget (composed)"
  "rules (emulator)"
  "design rules (Linux)"
  "functions"
)

say() { printf '%s\n' "$*" >&2; }

# Retry a read until it succeeds with a non-empty answer.
read_until() {
  local out
  until out="$("$@" 2>/dev/null)" && [ -n "$out" ]; do sleep 20; done
  printf '%s' "$out"
}

pr_field() { gh pr view "$1" --repo "$REPO" --json "$2" --jq ".$2"; }

behind_main() {
  local head="$1" main
  main="$(read_until gh api "repos/$REPO/commits/main" --jq .sha)"
  read_until gh api "repos/$REPO/compare/$main...$head" --jq .behind_by
}

# Wait until every check on $head has finished (latest run per name); echo "ok" when
# all are green and every required check is among them, else the names that are not.
checks_verdict() {
  local head="$1" runs pending missing bad
  while :; do
    runs="$(gh api "repos/$REPO/commits/$head/check-runs?per_page=100" \
      --jq '[.check_runs[]|{name,status,conclusion,started_at}]|group_by(.name)|map(max_by(.started_at))' 2>/dev/null)"
    if [ -z "$runs" ] || [ "$(jq length <<<"$runs")" -eq 0 ]; then sleep 30; continue; fi
    pending="$(jq '[.[]|select(.status!="completed")]|length' <<<"$runs")"
    missing=""
    for name in "${REQUIRED[@]}"; do
      jq -e --arg n "$name" 'any(.[]; .name == $n)' <<<"$runs" >/dev/null || missing+="$name; "
    done
    if [ "$pending" != "0" ] || [ -n "$missing" ]; then sleep 30; continue; fi
    bad="$(jq -r '.[]|select(.conclusion!="success" and .conclusion!="skipped" and .conclusion!="neutral")|.name' <<<"$runs")"
    if [ -z "$bad" ]; then echo ok; else echo "$bad" | paste -sd ',' -; fi
    return
  done
}

# GitHub's own reason from a refused merge's output ("Pull Request is still a draft").
refusal() { sed -n 's/.*"message":"\([^"]*\)".*/\1/p' <<<"$1" | head -1; }

merge_one() {
  local n="$1" state head behind verdict title branch out
  for attempt in 1 2 3 4 5; do
    state="$(read_until pr_field "$n" state)"
    [ "$state" = MERGED ] && { say "#$n: already merged"; return 0; }
    [ "$state" = OPEN ] || { say "✗ #$n is $state"; return 1; }
    head="$(read_until pr_field "$n" headRefOid)"
    behind="$(behind_main "$head")"
    if [ "$behind" != "0" ]; then
      say "#$n: $behind commit(s) behind main, updating the branch…"
      if ! gh pr update-branch "$n" --repo "$REPO" >/dev/null 2>&1; then
        say "✗ #$n does not merge cleanly with main: resolve the conflict by hand (nothing merged)."
        return 1
      fi
      # Wait for the new head to appear.
      until [ "$(read_until pr_field "$n" headRefOid)" != "$head" ]; do sleep 10; done
      continue
    fi
    say "#$n: up to date at ${head:0:9}, waiting for its checks…"
    verdict="$(checks_verdict "$head")"
    if [ "$verdict" != ok ]; then
      say "✗ #$n not green on ${head:0:9}: $verdict (nothing merged)."
      return 1
    fi
    [ "$(read_until pr_field "$n" headRefOid)" = "$head" ] || { say "#$n moved, checking again"; continue; }
    title="$(read_until pr_field "$n" title)"
    branch="$(read_until pr_field "$n" headRefName)"
    if out="$(gh api -X PUT "repos/$REPO/pulls/$n/merge" -f merge_method=squash -f sha="$head" \
      -f commit_title="$title (#$n)" 2>&1)"; then
      gh api -X DELETE "repos/$REPO/git/refs/heads/$branch" >/dev/null 2>&1 || true
      say "#$n: MERGED (${head:0:9})"
      return 0
    fi
    # Only a moved head or base is worth another try; anything else (a draft, a
    # required review, a conflict) is said as GitHub said it, and nothing merges.
    case "$out" in
      *"HTTP 409"* | *"was modified"*) ;;
      *)
        say "✗ #$n: GitHub refused the merge: $(refusal "$out") (nothing merged)."
        return 1
        ;;
    esac
    say "#$n: main moved before the merge, updating again (attempt $attempt)"
  done
  say "✗ #$n: main kept moving; try again later (nothing merged)."
  return 1
}

[ "$#" -gt 0 ] || { say "usage: scripts/merge-pr.sh <PR> [<PR> ...]"; exit 2; }
for n in "$@"; do merge_one "$n" || exit 1; done
