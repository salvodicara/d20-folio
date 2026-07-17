/**
 * Test-lane manifest (R5 — docs/ARCHITECTURE.md).
 *
 * The unit suite runs in two Vitest projects:
 *
 *   • **fast** — `node` environment, jsdom-free. Pure-logic `.test.ts`
 *     (compute / grants / codec / smart-tracker / data). Seconds-per-file
 *     feedback; wired into the pre-commit hook (a quick smoke) and pre-push.
 *   • **slow** — `jsdom` environment. Every `.test.tsx` (render) PLUS the small
 *     set of `.test.ts` below that genuinely need a DOM (React hooks via
 *     `renderHook`, canvas, `localStorage`, `window`/`document` globals).
 *
 * `JSDOM_TS_TESTS` is the SINGLE source of truth for which `.test.ts` files are
 * DOM-bound: the fast project excludes them, the slow project includes them, and
 * `tests/unit/fast-lane.meta.test.ts` cross-checks that the fast lane imports no
 * React/jsdom — so a new DOM-bound `.test.ts` that lands in the fast lane fails
 * CI loudly rather than silently pulling jsdom into the fast lane.
 *
 * Paths are POSIX, repo-root-relative (Vitest matches globs against these).
 */
export const JSDOM_TS_TESTS: readonly string[] = [
  "tests/unit/character-io.test.ts",
  "tests/unit/collect-debug-context.test.ts",
  "tests/unit/compendium-deeplink.test.ts",
  "tests/unit/error-log.test.ts",
  "tests/unit/image-crop.test.ts",
  "tests/unit/overlay-history.test.ts",
  "tests/unit/palette-recents.test.ts",
  "tests/unit/report-open.test.ts",
  "tests/unit/shortcuts.test.ts",
  "tests/unit/ui-store.test.ts",
  "tests/unit/use-character-subscription.test.ts",
  "tests/unit/use-roster-selection.test.ts",
];

/**
 * DOM-bound `.test.ts` files among the content pack's suites
 * (`content-pack/tests/unit/`) — same single-source rule as
 * {@link JSDOM_TS_TESTS}; these run only in pack mode (vitest.config.ts).
 */
export const PACK_JSDOM_TS_TESTS: readonly string[] = [
  "content-pack/tests/unit/chronicle-dev-fixture.test.ts",
];
