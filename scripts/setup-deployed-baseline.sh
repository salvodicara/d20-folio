#!/usr/bin/env bash
# The deployed release, checked out for `survey-v026-derived-diff.ts --baseline-root`:
# the app at its live commit composed with the content pack it shipped with, with its
# own dependencies. Local files only; it reads nothing from production.
#
#   bash scripts/setup-deployed-baseline.sh /absolute/fresh/directory <app-sha> <pack-sha>
#
# The two SHAs: the commit of the last successful deploy run, and the pack its log
# checked out ("HEAD is now at <pack-sha>" in the deploy job). v0.26.1 was
# 8a3b177b9 + 76e77c1; v0.25.0 was 9bb9a60c + f1ff69a7. The directory goes inside the
# project folder (never a synced one): the install is large.
set -euo pipefail
usage="usage: setup-deployed-baseline.sh /absolute/fresh/directory <app-sha> <pack-sha>"
dest="${1:?$usage}"
APP_SHA="${2:?$usage}"
PACK_SHA="${3:?$usage}"
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
