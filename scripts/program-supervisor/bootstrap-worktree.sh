#!/usr/bin/env bash
set -euo pipefail

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

pnpm install --silent
"$node_bin" "$npm_cli" --prefix functions ci --prefer-offline --no-audit
git config core.hooksPath .githooks
