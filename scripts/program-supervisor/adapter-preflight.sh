#!/usr/bin/env bash
set -euo pipefail

main_root="${1:?Use: adapter-preflight.sh MAIN_ROOT}"
physical_main_root="$(cd "$main_root" && pwd -P)"
invoking_root="$(pwd -P)"

if [ "$invoking_root" = "$physical_main_root" ]; then
  echo "Program Supervisor adapters must not run from the shared checkout" >&2
  exit 1
fi

git -C "$physical_main_root" fetch origin main --quiet

project="$(basename "$physical_main_root")"
if [ "$(basename "$invoking_root")" = "$project-program-control" ]; then
  exit 0
fi

if [ -n "$(git status --short)" ]; then
  echo "Program Supervisor adapters require a clean invoking worktree" >&2
  exit 1
fi

if [ "$(git rev-parse HEAD)" != "$(git -C "$physical_main_root" rev-parse origin/main)" ]; then
  echo "Program Supervisor adapters require HEAD equal to fresh origin/main" >&2
  exit 1
fi
