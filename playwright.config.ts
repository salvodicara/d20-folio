import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets a PARALLEL worktree run the suite on its own port so two
// checkouts never collide on 5174 (the SW journey then uses E2E_PORT+1).
// Defaults to the canonical 5174 / 5175 pair. Set both ends together.
const E2E_PORT = Number(process.env.E2E_PORT ?? 5174);
const SW_PORT = E2E_PORT + 1;

// ── S4: gate the SW dev-server (:5175) behind the portrait-sw projects ──────────
// Only `portrait-sw` / `portrait-sw-mobile` use the SW-enabled server; the chromium
// + mobile legs do NOT. Playwright boots EVERY `webServer` entry regardless of which
// projects run, so a `--project=chromium` (or `=mobile`) leg used to pay a wasted
// second `vite` boot on :5175. We read the selected `--project` flags off argv: if
// the run targets ONLY non-SW projects, the SW server is omitted. With NO `--project`
// filter (the full `just deploy` matrix, or `test:e2e:all`) every project runs, so we
// keep the SW server. Fails TOWARD booting it — anything we can't prove is SW-free
// still gets the server — so the SW journey is never silently starved of its origin.
const SELECTED_PROJECTS = process.argv.flatMap((arg, i) => {
  if (arg === "--project") return process.argv[i + 1] ? [process.argv[i + 1]] : [];
  const eq = arg.startsWith("--project=") ? arg.slice("--project=".length) : null;
  return eq ? [eq] : [];
});
const SW_PROJECTS = ["portrait-sw", "portrait-sw-mobile"];
// Boot the SW server unless the run is explicitly filtered to non-SW projects only.
const NEEDS_SW_SERVER =
  SELECTED_PROJECTS.length === 0 ||
  SELECTED_PROJECTS.some((p) => SW_PROJECTS.includes(p));

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // ONE worker per CI leg — measured, not assumed. The 2-vCPU `ubuntu-latest`
  // runner is already CPU-saturated by a SINGLE worker (a full-page Chromium
  // render + the vite DEV server transforming modules on demand), so a second
  // worker adds ~zero throughput (measured 2.75 s/test at workers=2 vs 2.16 s/test
  // at workers=1) AND starves slow renders — `.wiz-orbs` toBeVisible timed out and
  // flaked the gate red. Parallelism comes from SHARDING instead: each shard is
  // its OWN runner with its OWN dev server (Playwright `--shard`), so more shards
  // scale cleanly with no contention. Locally: auto default (one worker per core).
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    // Port 5174 so E2E tests never collide with the dev server (5173) that the
    // owner runs concurrently with pnpm dev. Without isolation, reuseExistingServer
    // picks up the dev server which has no VITE_DEV_BYPASS_AUTH and every test
    // lands on the login page instead of the mock character.
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // The SW-dependent portrait-export spec runs ONLY under the dedicated
      // `portrait-sw` project (its own SW-enabled server + base URL); exclude it
      // here so the normal chromium run (no SW) never picks it up.
      testIgnore: /portrait-export-journey\.spec\.ts/,
    },
    // Mobile tests opt-in (run with --project=mobile)
    // Desktop-first app; mobile UX will be finalized in UI/UX gate
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      // Mobile (390px / Pixel 7) re-runs the surface sweep ONLY for the specs whose
      // assertions actually depend on the project's width — so a layout/CSS/a11y
      // regression that only bites at 390px still can't slip the gate. The two
      // viewport-PINNED surface sweeps are scoped OFF mobile because they call
      // `page.setViewportSize(...)` for EVERY navigation, making the project's
      // viewport irrelevant — the mobile pass would be a byte-identical duplicate
      // of the chromium pass (and chromium still runs them):
      //   • on-art-ink   — pins DESKTOP for every nav (ink colour is width-invariant).
      //   • visual-full  — pins each variant's own viewport; its variant matrix
      //                    ALREADY enumerates both desktop AND mobile cells, so the
      //                    mobile project would re-run the identical cells.
      // KEPT on mobile (their assertions DO use the project viewport — real 390px
      // coverage, NOT redundant): a11y.spec.ts and i18n-sweep.spec.ts. The latter
      // reads `document.body.innerText`, which at 390px includes the `md:hidden`
      // MobileBottomNav labels (nav.characters/campaigns/compendium) that the
      // desktop chromium pass never renders — so its mobile run sweeps strings the
      // chromium run cannot.  See docs/CONTRIBUTING.md → "The gate split".
      testIgnore: [
        /portrait-export-journey\.spec\.ts/,
        /on-art-ink\.spec\.ts/,
        /visual-full\.spec\.ts/,
      ],
    },
    // Portrait-export journey — the ONE spec that needs a live service worker (the
    // owner's bug is an opaque SW-cache entry). Its own server registers the REAL
    // Workbox SW (VITE_PWA_DEV) on a separate port so it never disturbs the SW-free
    // runs above. `serviceWorkers: "allow"` is Playwright's default, kept explicit.
    {
      name: "portrait-sw",
      testMatch: /portrait-export-journey\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${SW_PORT}` },
    },
    // Same SW journey on a mobile profile — the bug is device-agnostic, but the
    // owner reproduces on both, so both are proven.
    {
      name: "portrait-sw-mobile",
      testMatch: /portrait-export-journey\.spec\.ts/,
      use: { ...devices["Pixel 7"], baseURL: `http://localhost:${SW_PORT}` },
    },
  ],
  webServer: [
    {
      // Use port 5174 so this never collides with the owner's pnpm dev session.
      command: `pnpm vite --port ${E2E_PORT}`,
      url: `http://localhost:${E2E_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_DEV_BYPASS_AUTH: "true",
      },
    },
    // SW-enabled dev server for the portrait-export journey (real Workbox SW +
    // real `/src` export code). Separate port + cwd-clean env so the SW only ever
    // lives on this origin. S4: ONLY booted when an SW project is in the run (see
    // NEEDS_SW_SERVER above) — the chromium/mobile legs skip this whole `vite` boot.
    ...(NEEDS_SW_SERVER
      ? [
          {
            command: `pnpm vite --port ${SW_PORT}`,
            url: `http://localhost:${SW_PORT}`,
            reuseExistingServer: !process.env.CI,
            env: {
              VITE_DEV_BYPASS_AUTH: "true",
              VITE_PWA_DEV: "true",
            },
          },
        ]
      : []),
  ],
});
