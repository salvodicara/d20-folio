#!/usr/bin/env bash
# The release rehearsal on the emulators (`just e2e-rehearsal [playwright args]`):
# seeds the sandbox, then runs tests/e2e-rehearsal on the new-UI build.
# `REHEARSAL_SERVE=1` keeps the seeded emulators up instead, for exploring by hand.
set -euo pipefail
args="$*"
if [ "${REHEARSAL_SERVE:-}" = "1" ]; then
  inner='node --import ./scripts/alias-loader.mjs scripts/dev-seed-sandbox.ts && echo "REHEARSAL READY" && sleep 100000'
else
  inner="node --import ./scripts/alias-loader.mjs scripts/dev-seed-sandbox.ts && pnpm exec playwright test -c playwright.rehearsal.config.ts $args"
fi
firebase emulators:exec --only auth,firestore,storage --project demo-d20folio "$inner"
