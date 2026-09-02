/// <reference types="node" />
/**
 * Vitest config for the EMULATOR-BACKED Firestore rules tests ONLY.
 *
 * Kept separate from `vitest.config.ts` so the rules suite (which needs the
 * Firestore emulator + a JVM) never runs inside the plain unit job. Invoked via
 * the `test:rules` script under `firebase emulators:exec` — see
 * `tests/rules/firestore-rules.test.ts`.
 *
 * Matches the lint ignore `*.config.*`, so it is neither linted nor compiled by
 * `tsc -b` (same treatment as `vitest.config.ts`).
 */
import { defineConfig } from "vitest/config";
import path from "path";
import {
  packAliasTarget,
  packItemArtAliasTarget,
  packMonsterArtAliasTarget,
  packMonstersAliasTarget,
} from "./scripts/content-pack-mode";

export default defineConfig({
  // The emulator suites drive the one-off migration scripts, and the parent-cutover
  // migration reuses the app's play codec + character codec + SRD aggregate — so this
  // lane needs the SAME module aliases as `vitest.config.ts`. String aliases match by
  // prefix, so the `@pack` sub-entries stay ahead of `@pack`; `preserveSymlinks` keeps
  // the pack's modules at their symlink path inside this repo root.
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@pack/item-art": packItemArtAliasTarget(),
      "@pack/monster-art": packMonsterArtAliasTarget(),
      "@pack/monsters": packMonstersAliasTarget(),
      "@pack": packAliasTarget(),
      "@tests": path.resolve(__dirname, "./tests"),
      "@scripts": path.resolve(__dirname, "./scripts"),
    },
    preserveSymlinks: true,
  },
  test: {
    include: ["tests/rules/**/*.test.ts"],
    environment: "node",
    // The SAME warm-up the unit fast lane uses. It is not cosmetic here: the pack
    // barrel re-exports its overlay AFTER its i18n loader, which imports back into
    // `@/i18n/srd-en`, so the first module to enter that cycle decides whether
    // `srdOverlay` is initialized. Booting i18n first settles the graph, exactly as
    // `scripts/alias-loader.mjs` does for a plain `node` script.
    setupFiles: ["./src/test/setup.fast.ts"],
    // The emulator's first connection + rules load is comparatively slow.
    testTimeout: 20000,
    hookTimeout: 30000,
    // Run the rules FILES serially. They share ONE emulator under a single project
    // id (`emulators:exec --project demo-d20folio` runs in single-project mode, so
    // separate ids aren't an option), and each file's `clearFirestore()` wipes the
    // WHOLE project. Run in parallel, one file's beforeEach clear races another's
    // seeded docs mid-evaluation — a `get()` then reads a just-deleted user/character
    // doc and the rule throws a null-value error (a flaky cross-file wipe, not a real
    // rules failure). Serial execution keeps each file's seed/clear window to itself.
    fileParallelism: false,
  },
});
