/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import path from "path";
import { JSDOM_TS_TESTS, PACK_JSDOM_TS_TESTS } from "./tests/lanes";
import { contentPackEnabled, packAliases } from "./scripts/content-pack-mode";

// Mirror the vite `define` so components reading the build-time version (the
// footer colophon) and the bug-report debug context don't hit a ReferenceError
// under jsdom.
const define = {
  __APP_VERSION__: JSON.stringify("test"),
  __GIT_SHA__: JSON.stringify("testsha"),
};

const alias = {
  "@": path.resolve(__dirname, "./src"),
  // The content-pack seam — the same map as vite.config.ts.
  ...packAliases(),
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
// join the SAME fast/slow lanes (no extra project name), so every script
// picks them up unchanged.
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
    // A composed run refuses a pack checkout behind its origin/main (scripts/pack/pack-freshness.ts).
    globalSetup: ["./scripts/pack/pack-freshness-setup.ts"],
    // ── Fast / slow lanes (docs/ARCHITECTURE.md) ──────────────────────────
    // Two Vitest projects:
    //   • fast — `node` env, jsdom-free pure-logic `.test.ts`. The fast lane's whole point is sub-second-per-file
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
          // in the default `vitest run`, which runs before the build.
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
        // `vite build` with `pnpm test:budget` (CI build job + Verify's composed budget).
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
  },
});
