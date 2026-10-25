import { defineConfig, devices } from "@playwright/test";

/**
 * The runtime content pack, end to end, against the Firebase emulators
 * (`just e2e-pack`, which seeds them first). Two dev servers share the same
 * emulator data: one bundles the pack as today (`composed`), one downloads it
 * after sign-in as production does (`runtime`). See tests/e2e-pack/.
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
export const COMPOSED_URL = "http://127.0.0.1:5181";
export const RUNTIME_URL = "http://127.0.0.1:5182";

export default defineConfig({
  testDir: "./tests/e2e-pack",
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  use: { ...devices["Desktop Chrome"], trace: "retain-on-failure" },
  webServer: [
    {
      command: "pnpm vite --host 127.0.0.1 --port 5181 --strictPort",
      url: COMPOSED_URL,
      // No HMR socket: it reloads a page by itself mid-test (see vite.config.ts).
      env: { ...EMULATOR_CLIENT_ENV, VITE_E2E_NO_HMR: "true" },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm vite --host 127.0.0.1 --port 5182 --strictPort",
      url: RUNTIME_URL,
      env: {
        ...EMULATOR_CLIENT_ENV,
        VITE_E2E_NO_HMR: "true",
        VITE_CONTENT_PACK: "runtime",
        VITE_PACK_VERSION: process.env.VITE_PACK_VERSION ?? "",
      },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
