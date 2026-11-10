import { defineConfig, devices } from "@playwright/test";
import { FOLIO_SERVER_GUARD, folioServers } from "./tests/folio-server-guard";

/**
 * The release rehearsal: a player's whole journey on the build v0.26.0 ships, the
 * new UI (`VITE_NEW_UI=1`) with the v0.26 combat effects (`VITE_COMBAT_EFFECTS_V26`),
 * against the Firebase emulators the sandbox seed fills (`scripts/e2e-rehearsal.sh`).
 * Every real path runs: Auth, Firestore rules, listeners, transactions.
 */
const EMULATOR_CLIENT_ENV = {
  VITE_USE_EMULATORS: "true",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-d20folio.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-d20folio",
  VITE_FIREBASE_STORAGE_BUCKET: "demo-d20folio.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  VITE_FIREBASE_APP_ID: "demo-app",
};
const PORT = Number(process.env.E2E_REHEARSAL_PORT ?? 5185);
export const REHEARSAL_URL = `http://127.0.0.1:${PORT}`;
/** The classic UI (`VITE_NEW_UI` off), the build v0.26.0 ships by default. */
const CLASSIC_PORT = PORT + 1;
export const REHEARSAL_CLASSIC_URL = `http://127.0.0.1:${CLASSIC_PORT}`;
/** The deploy's flags (deploy.yml): the rehearsal runs the writers players get. */
const DEPLOY_FLAGS = {
  VITE_COMBAT_EFFECTS_V26: "true",
  VITE_PEER_SPENDS_LEDGER: "true",
};

export default defineConfig({
  testDir: "./tests/e2e-rehearsal",
  globalSetup: FOLIO_SERVER_GUARD,
  // One journey shares the emulator data: the specs run in file order, one at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "rehearsal-report" }]],
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: REHEARSAL_URL,
    // A control that is not there fails the step in seconds, never hangs the journey.
    actionTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: folioServers("E2E_REHEARSAL_PORT", [
    {
      command: `pnpm vite --host 127.0.0.1 --port ${PORT} --strictPort`,
      url: REHEARSAL_URL,
      env: {
        ...EMULATOR_CLIENT_ENV,
        // No HMR socket: it reloads a page by itself mid-test (see vite.config.ts).
        VITE_E2E_NO_HMR: "true",
        FOLIO_VITE_CACHE_DIR: `node_modules/.vite-rehearsal-${PORT}`,
        VITE_NEW_UI: "1",
        ...DEPLOY_FLAGS,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm vite --host 127.0.0.1 --port ${CLASSIC_PORT} --strictPort`,
      url: REHEARSAL_CLASSIC_URL,
      env: {
        ...EMULATOR_CLIENT_ENV,
        VITE_E2E_NO_HMR: "true",
        FOLIO_VITE_CACHE_DIR: `node_modules/.vite-rehearsal-${CLASSIC_PORT}`,
        ...DEPLOY_FLAGS,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ]),
  projects: [
    // The new UI's journey (01–07), then the classic UI on the same data. No
    // dependency between them: a new-UI failure must not hide the classic run.
    { name: "new-ui", testIgnore: /classic-.*\.spec\.ts$/ },
    {
      name: "classic",
      testMatch: /classic-.*\.spec\.ts$/,
      use: { baseURL: REHEARSAL_CLASSIC_URL },
    },
  ],
});
