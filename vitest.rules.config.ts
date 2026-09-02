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
import { PACK_EMPTY_ENTRY } from "./scripts/content-pack-mode";

export default defineConfig({
  // The emulator suites drive the one-off migration scripts, and the parent-cutover
  // migration reuses the app's play codec — so this lane needs the `@/` alias. `@pack`
  // resolves to the typed-empty stub UNCONDITIONALLY here, matching the composition the
  // migrations actually run in: a plain `node` script cannot evaluate the composed pack
  // (its barrel reaches `src/i18n/loaders.ts`, whose `import.meta.glob` exists only
  // under Vite), so every migration run sets `VITE_CONTENT_PACK=0`. String aliases match
  // by prefix, so the `@pack` sub-entries stay ahead of `@pack`.
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@pack/item-art": PACK_EMPTY_ENTRY,
      "@pack/monster-art": PACK_EMPTY_ENTRY,
      "@pack/monsters": PACK_EMPTY_ENTRY,
      "@pack": PACK_EMPTY_ENTRY,
      "@tests": path.resolve(__dirname, "./tests"),
      "@scripts": path.resolve(__dirname, "./scripts"),
    },
  },
  test: {
    include: ["tests/rules/**/*.test.ts"],
    environment: "node",
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
