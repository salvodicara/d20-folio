# shellcheck shell=bash
# A red main stops the line by itself (coordinator, 2026-11-12: main's Verify was red for
# hours while PRs kept merging, because PR CI runs no e2e). `verify_gate <repo> <pr>`
# allows a merge only when the newest finished Verify on main passed, or when the PR
# carries the `verify-fix` label (the fix for that red). A cancelled run decides nothing:
# the newest passed-or-failed one counts. Fails CLOSED: a read that errors, or no
# finished run at all, refuses.
# The newest run that passed or failed (gh lists newest first); "" when none did.
VERIFY_GATE_JQ='[.[]|select(.status=="completed" and (.conclusion=="success" or .conclusion=="failure"))][0].conclusion // ""'

verify_gate() {
  local repo="$1" pr="$2" verdict labelled
  if ! verdict="$(gh run list --repo "$repo" --workflow verify.yml --branch main --limit 30 \
    --json status,conclusion --jq "$VERIFY_GATE_JQ")"; then
    echo "✗ #$pr: could not read main's Verify runs (nothing merged)." >&2
    return 1
  fi
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
