/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import path from "path";
import { JSDOM_TS_TESTS, PACK_JSDOM_TS_TESTS } from "./tests/lanes";
import { contentPackEnabled, packAliasTarget } from "./scripts/content-pack-mode";

// Mirror the vite `define` so components reading the build-time version (the
// footer colophon) and the bug-report debug context don't hit a ReferenceError
// under jsdom.
const define = {
  __APP_VERSION__: JSON.stringify("test"),
  __GIT_SHA__: JSON.stringify("testsha"),
};

const alias = {
  "@": path.resolve(__dirname, "./src"),
  // The content-pack seam — mirrors vite.config.ts.
  "@pack": packAliasTarget(),
  // Root-anchored test-helper aliases: the pack's suites live in a separate
  // repo composed in via a symlink, so a physical `../../../tests/…` escape
  // resolves against the WRONG root once vitest realpaths the test file. Pack
  // tests import public-root helpers ONLY through these (tsconfig.app.json
  // mirrors them for the typecheck).
  "@tests": path.resolve(__dirname, "./tests"),
  "@scripts": path.resolve(__dirname, "./scripts"),
};

// The pack's own suites (content-pack/tests/unit) run ONLY in pack mode: they
// assert pack content that the SRD-only composition deliberately lacks. They
// join the SAME fast/slow lanes (no extra project name), so every script,
// hook, and the coverage run pick them up unchanged.
const PACK_FAST_TESTS = contentPackEnabled()
  ? ["content-pack/tests/unit/**/*.test.ts"]
  : [];
const PACK_SLOW_TESTS = contentPackEnabled()
  ? ["content-pack/tests/unit/**/*.test.tsx", ...PACK_JSDOM_TS_TESTS]
  : [];

export default defineConfig({
  define,
  // `preserveSymlinks` keeps the pack's modules at their SYMLINK path (inside
  // this repo root) instead of their real path in the sibling content repo —
  // without it the jsdom lane anchors the pack tests' bare imports (react, the
  // testing library) at the content repo, which has no node_modules. Test-lane
  // only: the production build keeps realpath resolution (pnpm's nested
  // node_modules symlinks would otherwise duplicate react in the bundle);
  // vite.config.ts serves the pack's real directory via `server.fs.allow`.
  resolve: { alias, preserveSymlinks: true },
  test: {
    // ── Fast / slow lanes (docs/ARCHITECTURE.md) ──────────────────────────
    // Two Vitest projects share one coverage run:
    //   • fast — `node` env, jsdom-free pure-logic `.test.ts`. Pre-commit smoke
    //            + pre-push. The fast lane's whole point is sub-second-per-file
    //            feedback, so it never loads jsdom or the jest-dom matchers.
    //   • slow — `jsdom` env: every `.test.tsx` (render) + the DOM-bound
    //            `.test.ts` listed in `tests/lanes.ts`.
    // Run a single lane locally with: `pnpm test --project fast`.
    projects: [
      {
        extends: true,
        test: {
          name: "fast",
          globals: true,
          environment: "node",
          setupFiles: ["./src/test/setup.fast.ts"],
          include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts", ...PACK_FAST_TESTS],
          // DOM-bound `.test.ts` belong to the slow lane (single source of truth).
          // The P3 bundle-budget guard reads `dist/`, which only exists AFTER
          // `vite build` — and the gate runs unit tests BEFORE build. So it lives in
          // its own `budget` project (run post-build via `pnpm test:budget`), never
          // in the default `vitest run` that the pre-build coverage gate executes.
          exclude: [
            ...JSDOM_TS_TESTS,
            ...PACK_JSDOM_TS_TESTS,
            "tests/unit/bundle-budget.guard.test.ts",
          ],
        },
      },
      {
        // ── Budget lane (P3) ─────────────────────────────────────────────────────
        // The bundle-budget guard reads the PRODUCTION build. It is NOT in the
        // `fast`/`slow` lanes (which run before build); the gate runs it AFTER
        // `vite build` with `pnpm test:budget` (CI build job + pre-push hook).
        extends: true,
        test: {
          name: "budget",
          globals: true,
          environment: "node",
          setupFiles: ["./src/test/setup.fast.ts"],
          include: ["tests/unit/bundle-budget.guard.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "slow",
          globals: true,
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: [
            "tests/unit/**/*.test.tsx",
            "src/**/*.test.tsx",
            ...JSDOM_TS_TESTS,
            ...PACK_SLOW_TESTS,
          ],
        },
      },
    ],

    // ── Coverage (shared across both lanes — thresholds UNCHANGED) ─────────────
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],

      // ── Coverage scope ──────────────────────────────────────────────────────
      // Broad include: every new file in src/lib/ is measured automatically.
      // Files that genuinely cannot be unit-tested require an explicit exclude
      // entry below with a stated reason. No silent gaps.
      include: ["src/lib/**/*.ts", "src/data/**/*.ts", "src/stores/**/*.ts"],
      exclude: [
        // ── Firebase / browser wrappers — tested by Playwright E2E ──────────
        "src/lib/firebase.ts", // app initialisation, no logic
        "src/lib/auth.ts", // Firebase auth provider calls
        "src/stores/authStore.ts", // wraps Firebase Auth — exercised by E2E
        "src/lib/firestore.ts", // Firestore CRUD
        "src/lib/storage.ts", // Firebase Storage uploads
        "src/lib/action-log.ts", // IDB + Firestore log persistence
        "src/lib/log-persistence.ts", // IndexedDB wrapper
        "src/lib/online-status.ts", // navigator.onLine listener
        "src/lib/dev-bypass.ts", // dev-only auth override
        // (smart-tracker.ts exclusion removed — now covered by smart-tracker*.test.ts)
        // ── Test fixture — data only, no logic ──────────────────────────────
        "src/lib/mock.ts",
        // ── Trivial wrappers — no app logic to test ─────────────────────────
        "src/lib/utils.ts", // cn() = clsx + tailwind-merge
        "src/lib/action-type-colors.ts", // pure colour constants
        // ── src/data pure-data files — no functions, only exported arrays ───
        "src/data/classes/*.ts", // raw class feature arrays; logic in classes.ts
        "src/data/types.ts", // TypeScript type definitions only, no runtime code
      ],

      // ── Thresholds ──────────────────────────────────────────────────────────
      // Applied to the aggregate across all included files.
      // Raise incrementally as coverage improves.
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
});
