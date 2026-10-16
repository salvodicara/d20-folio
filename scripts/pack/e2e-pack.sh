#!/usr/bin/env bash
# The runtime content pack end to end, on the Firebase emulators (`just e2e-pack`).
# Emits the pack, then inside the emulators: seeds the sandbox, uploads the pack,
# grants the sandbox DM the `pack` claim, and runs tests/e2e-pack.
set -euo pipefail
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
node --import ./scripts/alias-loader.mjs scripts/pack/emit-pack.ts "$out" demo-d20folio.appspot.com
export VITE_PACK_VERSION="$(cat "$out/version.txt")"
export PACK_OUT="$out"
firebase emulators:exec --only auth,firestore,storage --project demo-d20folio '
  set -e
  node scripts/dev-seed-sandbox.ts
  node scripts/pack/upload-pack.ts "$PACK_OUT" demo-d20folio.appspot.com --apply
  node scripts/pack/pack-access.ts grant "$PACK_OUT/claims-snapshot.json" dev-owner --apply
  pnpm exec playwright test -c playwright.pack.config.ts
'
