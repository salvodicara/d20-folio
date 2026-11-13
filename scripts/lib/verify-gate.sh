# shellcheck shell=bash
# A red main stops the line by itself (coordinator, 2026-11-12: main's Verify was red for
# hours while PRs kept merging, because PR CI runs no e2e). `verify_gate <repo> <pr>`
# allows a merge only when the newest finished Verify on main passed, or when the PR
# carries the `verify-fix` label (the fix for that red). A cancelled run decides nothing:
# the newest passed-or-failed one counts. Fails CLOSED: a read that errors, or no
# finished run at all, refuses.
# The newest run that passed or failed (gh lists newest first); "" when none did.
VERIFY_GATE_JQ='[.[]|select(.status=="completed" and (.conclusion=="success" or .conclusion=="failure"))][0].conclusion // ""'

# The private pack every Verify composes with.
VERIFY_PACK_REPO="salvodicara/d20-folio-content"

# `lockstep_proves_main <repo>`: true when a passed Verify dispatched by a lockstep merge
# (its run name carries «+ pack <sha>») ran on the very trees main and the pack's main
# have now. A squash merge of an up-to-date pair puts exactly that tree on main, and
# main's own Verify of it takes ~45 minutes (coordinator, 2026-11-13). Main's own
# finished Verify of its current commit still decides; any read that fails says no.
lockstep_proves_main() {
  local repo="$1" main_sha main_tree pack_tree decided runs sha title pack
  main_sha="$(gh api "repos/$repo/commits/main" --jq .sha)" || return 1
  [ -n "$main_sha" ] || return 1
  decided="$(gh run list --repo "$repo" --workflow verify.yml --branch main --limit 30 \
    --json status,conclusion,headSha \
    --jq '[.[]|select(.status=="completed" and (.conclusion=="success" or .conclusion=="failure"))][0].headSha // ""')" ||
    return 1
  [ "$decided" = "$main_sha" ] && return 1
  main_tree="$(gh api "repos/$repo/commits/$main_sha" --jq .commit.tree.sha)" || return 1
  pack_tree="$(gh api "repos/$VERIFY_PACK_REPO/commits/main" --jq .commit.tree.sha)" ||
    return 1
  [ -n "$main_tree" ] && [ -n "$pack_tree" ] || return 1
  runs="$(gh api "repos/$repo/actions/workflows/verify.yml/runs?event=workflow_dispatch&status=success&per_page=30" \
    --jq '.workflow_runs[]|"\(.head_sha) \(.display_title)"')" || return 1
  while read -r sha title; do
    pack="${title##*+ pack }"
    [ -n "$sha" ] && [ "$pack" != "$title" ] || continue
    [ "$(gh api "repos/$repo/commits/$sha" --jq .commit.tree.sha)" = "$main_tree" ] || continue
    if [ "$(gh api "repos/$VERIFY_PACK_REPO/commits/$pack" --jq .commit.tree.sha)" = "$pack_tree" ]; then
      echo "main's tree passed Verify as a lockstep run ($sha + pack $pack)." >&2
      return 0
    fi
  done <<<"$runs"
  return 1
}

verify_gate() {
  local repo="$1" pr="$2" verdict labelled
  if ! verdict="$(gh run list --repo "$repo" --workflow verify.yml --branch main --limit 30 \
    --json status,conclusion --jq "$VERIFY_GATE_JQ")"; then
    echo "✗ #$pr: could not read main's Verify runs (nothing merged)." >&2
    return 1
  fi
  if [ "$verdict" != success ] && lockstep_proves_main "$repo"; then verdict=success; fi
  case "$verdict" in
    success) return 0 ;;
    failure)
      if ! labelled="$(gh pr view "$pr" --repo "$repo" --json labels \
        --jq '[.labels[].name]|any(. == "verify-fix")')"; then
        echo "✗ #$pr: could not read its labels (nothing merged)." >&2
        return 1
      fi
      if [ "$labelled" = true ]; then
        echo "#$pr: main's Verify is red; merging as a verify-fix." >&2
        return 0
      fi
      echo "✗ #$pr: main's newest Verify failed: only a PR labelled verify-fix merges until it is green (nothing merged)." >&2
      return 1
      ;;
    *)
      echo "✗ #$pr: no finished Verify on main to judge by (nothing merged)." >&2
      return 1
      ;;
  esac
}

# The check-runs a branch's own dispatched Verify left on the PR head (`gh workflow run
# verify.yml --ref <branch>`, how a fix is proven) carry other lanes' reds while main is
# red. For a PR labelled verify-fix they are reported in one line and do not block: the
# gate is the PR's own CI. For any other PR they still block, so a lane cannot ignore
# its own red Verify (coordinator, 2026-11-13).
#
# `filter_branch_verify <runs> <verify-suite-ids> <labelled>`: `runs` is the head's
# check-runs as [{name,status,conclusion,started_at,suite}], `verify-suite-ids` the
# check-suite ids of the Verify workflow runs on that head, `labelled` "true" or not.
# Prints the runs the merge is judged by.
filter_branch_verify() {
  local runs="$1" suites="$2" labelled="$3" dropped
  if [ "$labelled" != true ]; then
    printf '%s' "$runs"
    return 0
  fi
  dropped="$(jq -r --argjson s "$suites" \
    '.[]|select(.suite as $id|$s|index($id))|select(.conclusion!="success")|.name' <<<"$runs" |
    paste -sd ',' -)"
  [ -n "$dropped" ] && echo "  (the branch's own Verify, not blocking a verify-fix: $dropped)" >&2
  jq -c --argjson s "$suites" '[.[]|select(.suite as $id|$s|index($id)|not)]' <<<"$runs"
}

# `branch_verify_suites <repo> <head>`: the check-suite ids of the Verify runs on head.
branch_verify_suites() {
  gh api "repos/$1/actions/runs?head_sha=$2&per_page=100" \
    --jq '[.workflow_runs[]|select(.name=="Verify")|.check_suite_id]'
}

# `pr_is_verify_fix <repo> <pr>`: "true" when the PR carries the verify-fix label.
pr_is_verify_fix() {
  gh pr view "$2" --repo "$1" --json labels --jq '[.labels[].name]|any(. == "verify-fix")'
}
