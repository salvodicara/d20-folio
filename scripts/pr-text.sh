#!/usr/bin/env bash
# Open or edit a PR only after its title and body pass the private-text scan
# (scripts/private-text.ts): no licensed-setting term, no identity value. GitHub keeps
# every revision of a title and body, and only the owner can delete one, so the scan
# runs BEFORE gh sees the text. The identity values live in the linked content-pack;
# without it the wrapper refuses.
#
#   scripts/pr-text.sh create --title "…" --body-file body.md [other gh pr create flags]
#   scripts/pr-text.sh edit 1234 [--title "…"] [--body-file body.md] [other gh pr edit flags]
#
# `--body "…"` is scanned too. `--fill`, `--fill-first` and `--fill-verbose` are refused:
# they publish text the scan never saw.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cmd="${1:-}"
case "$cmd" in
  create | edit) shift ;;
  *)
    echo "usage: scripts/pr-text.sh create|edit [PR] --title … --body-file … [gh flags]" >&2
    exit 64
    ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
parts=()
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  a="${args[$i]}"
  next="${args[$((i + 1))]:-}"
  case "$a" in
    --title | -t)
      printf '%s\n' "$next" >"$tmp/title"
      parts+=("title=$tmp/title")
      ;;
    --title=*)
      printf '%s\n' "${a#--title=}" >"$tmp/title"
      parts+=("title=$tmp/title")
      ;;
    --body | -b)
      printf '%s\n' "$next" >"$tmp/body"
      parts+=("body=$tmp/body")
      ;;
    --body=*)
      printf '%s\n' "${a#--body=}" >"$tmp/body"
      parts+=("body=$tmp/body")
      ;;
    --body-file | -F)
      if [ "$next" = "-" ]; then
        echo "pr-text: give the body as a file, not stdin." >&2
        exit 64
      fi
      parts+=("body=$next")
      ;;
    --body-file=*)
      parts+=("body=${a#--body-file=}")
      ;;
    --fill | --fill-first | --fill-verbose | -f)
      echo "pr-text: $a publishes text the scan never saw; pass --title and --body-file." >&2
      exit 64
      ;;
  esac
done

if [ "${#parts[@]}" -eq 0 ] && [ "$cmd" = "create" ]; then
  echo "pr-text: a new PR needs --title and --body-file." >&2
  exit 64
fi
if [ "${#parts[@]}" -gt 0 ]; then
  node "$ROOT/scripts/private-text.ts" --need-pack "${parts[@]}"
fi

exec gh pr "$cmd" "$@"
