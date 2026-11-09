#!/usr/bin/env bash
# The deployed release, checked out for `survey-v026-derived-diff.ts --baseline-root`:
# the app at its live commit (v0.25.0, 9bb9a60c) composed with the content pack it
# shipped with (f1ff69a7, the pack head the 2026-10-16 deploy run verified), with its
# own dependencies. Local files only; it reads nothing from production.
#
#   bash scripts/setup-v025-baseline.sh /absolute/fresh/directory
set -euo pipefail
APP_SHA=9bb9a60c
PACK_SHA=f1ff69a7
dest="${1:?usage: setup-v025-baseline.sh /absolute/fresh/directory}"
case "$dest" in /*) ;; *) echo "the directory must be absolute" >&2; exit 1 ;; esac
[ ! -e "$dest" ] || { echo "$dest already exists" >&2; exit 1; }
pack_repo="${FOLIO_PACK_REPO:-$HOME/Workspace/d20-folio-content}"

git fetch --quiet origin
git worktree add --quiet --detach "$dest/app" "$APP_SHA"
git -C "$pack_repo" fetch --quiet origin
git -C "$pack_repo" worktree add --quiet --detach "$dest/pack" "$PACK_SHA"
ln -sfn "$dest/pack/content-pack" "$dest/app/content-pack"
( cd "$dest/app" && pnpm install --frozen-lockfile --silent )
echo "baseline ready: --baseline-root $dest/app"
