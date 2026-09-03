import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets a PARALLEL worktree run the suite on its own port so two
// checkouts never collide on 5174.
// Defaults to the canonical 5174 / 5175 pair. Set both ends together.
const E2E_PORT = Number(process.env.E2E_PORT ?? 5174);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
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
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      // The accessibility sweep runs on both profiles (the only browser suite on `v2`
      // until the new surfaces land at stage 6; the owner's screenshot lane lives in
      // tests/visual with its own config).
      testMatch: /a11y.*\.spec\.ts/,
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
  ],
});
