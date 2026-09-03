#!/usr/bin/env bash
set -euo pipefail

main_root="${1:?Use: adapter-preflight.sh MAIN_ROOT}"
physical_main_root="$(cd "$main_root" && pwd -P)"
invoking_root="$(pwd -P)"

if [ "$invoking_root" = "$physical_main_root" ]; then
  echo "Worktree adapters must not run from the shared checkout" >&2
  exit 1
fi

git -C "$physical_main_root" fetch origin main --quiet

main_common_dir="$(git -C "$physical_main_root" rev-parse --path-format=absolute --git-common-dir)"
main_common_dir="$(cd "$main_common_dir" && pwd -P)"

if ! invoking_top="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "Worktree adapters require a registered worktree of the exact Git common directory" >&2
  exit 1
fi
invoking_top="$(cd "$invoking_top" && pwd -P)"
if [ "$invoking_top" != "$invoking_root" ]; then
  echo "Worktree adapters must run from the exact canonical worktree root" >&2
  exit 1
fi

invoking_common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
invoking_common_dir="$(cd "$invoking_common_dir" && pwd -P)"
if [ "$invoking_common_dir" != "$main_common_dir" ]; then
  echo "Worktree adapters require a registered worktree of the exact Git common directory" >&2
  exit 1
fi

if ! git -C "$physical_main_root" worktree list --porcelain |
  grep -Fqx "worktree $invoking_root"; then
  echo "Worktree adapters require the exact canonical path to be registered" >&2
  exit 1
fi

if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  echo "Worktree adapters require a clean invoking worktree" >&2
  exit 1
fi

if [ "$(git rev-parse HEAD)" != "$(git -C "$physical_main_root" rev-parse origin/main)" ]; then
  echo "Worktree adapters require HEAD equal to fresh origin/main" >&2
  exit 1
fi
