#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "--run" ] && [ "$#" -lt 2 ]; then
  echo "Use: bootstrap-worktree.sh --run COMMAND [ARG...]" >&2
  exit 1
fi

required_node="$(awk '$1 == "nodejs" { print $2 }' .tool-versions)"
[ "$required_node" = "24.16.0" ] || { echo "Unexpected Node pin: $required_node" >&2; exit 1; }

if command -v asdf >/dev/null 2>&1; then
  node_root="$(asdf where nodejs "$required_node")"
  node_bin="$node_root/bin/node"
  corepack_js="$node_root/lib/node_modules/corepack/dist/corepack.js"
  npm_cli="$node_root/lib/node_modules/npm/bin/npm-cli.js"
else
  node_bin="$(command -v node)"
  corepack_js="$(dirname "$node_bin")/../lib/node_modules/corepack/dist/corepack.js"
  npm_cli="$(dirname "$node_bin")/../lib/node_modules/npm/bin/npm-cli.js"
fi

actual_node="$($node_bin --version)"
[ "$actual_node" = "v$required_node" ] || { echo "Expected Node v$required_node, got $actual_node" >&2; exit 1; }

required_pnpm="$($node_bin -p "require('./package.json').packageManager")"
[ "$required_pnpm" = "pnpm@11.2.2" ] || { echo "Unexpected pnpm pin: $required_pnpm" >&2; exit 1; }
tool_shim_dir="$(mktemp -d "${TMPDIR:-/tmp}/d20-pinned-tools.XXXXXX")"
cleanup_tools() { find "$tool_shim_dir" -depth -delete; }
trap cleanup_tools EXIT
"$node_bin" "$corepack_js" enable --install-directory "$tool_shim_dir" pnpm
export PATH="$tool_shim_dir:$(dirname "$node_bin"):$PATH"
actual_pnpm="$(pnpm --version)"
[ "$actual_pnpm" = "11.2.2" ] || { echo "Expected pnpm 11.2.2, got $actual_pnpm" >&2; exit 1; }

if [ "${1:-}" = "--run" ]; then
  shift
  "$@"
  exit
fi

# Each app worktree composes against its OWN pack worktree, never the shared pack
# checkout: a lane that switches branches there changes the pack under every other
# lane's composed builds and tests at once. The main checkout keeps the shared link.
# A link that already points elsewhere (a pack PR branch you chose) is left alone.
# The pack worktrees live inside the project, in the main checkout's git-ignored
# `.pack-wt/` (owner, 2026-11-11: nothing new under ~/Workspace/Codex). A worktree whose
# link already points at an older location keeps it (the case below leaves it alone).
# FOLIO_PACK_REPO / FOLIO_PACK_WORKTREES override the default locations.
pack_repo="${FOLIO_PACK_REPO:-$HOME/Workspace/d20-folio-content}"
app_top="$(cd "$(git rev-parse --show-toplevel)" && pwd -P)"
app_main="$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd -P)"
if [ -e "$pack_repo/.git" ] && [ "$app_top" != "$app_main" ]; then
  pack_wt="${FOLIO_PACK_WORKTREES:-$app_main/.pack-wt}/$(basename "$app_top")"
  current_link="$(readlink content-pack 2>/dev/null || true)"
  case "$current_link" in
    "" | "$pack_repo" | "$pack_repo"/*)
      if [ ! -d "$pack_wt" ]; then
        git -C "$pack_repo" fetch --quiet origin main
        git -C "$pack_repo" worktree add --quiet --detach "$pack_wt" origin/main
      fi
      ln -sfn "$pack_wt/content-pack" content-pack
      echo "content-pack -> $pack_wt/content-pack (this worktree's own pack)"
      ;;
  esac
fi

pnpm install --silent
"$node_bin" "$npm_cli" --prefix functions ci --prefer-offline --no-audit
git config core.hooksPath .githooks
