/**
 * The offline proof: a real production-shaped build (service worker, precache,
 * `assets/lazy/` runtime caching) served by `vite preview`, driven offline in a real
 * browser. Built in development mode only so the dev sign-in bypass and the
 * scenario characters exist; the cache configuration is the production one.
 * Run: `pnpm test:e2e:offline` (builds into dist-offline/, one heavy job).
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 5178;

export default defineConfig({
  testDir: "tests/e2e-offline",
  timeout: 240_000,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    serviceWorkers: "allow",
  },
  projects: [{ name: "offline", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm vite build --mode development --outDir dist-offline && pnpm vite preview --outDir dist-offline --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    timeout: 900_000,
    reuseExistingServer: false,
    // Fake demo Firebase values (never a real project): under the sign-in bypass the
    // app never reaches Firebase, it only needs a non-empty config to boot.
    env: {
      VITE_DEV_BYPASS_AUTH: "true",
      NODE_ENV: "development",
      VITE_FIREBASE_API_KEY: "demo-offline-e2e",
      VITE_FIREBASE_AUTH_DOMAIN: "demo-d20folio.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "demo-d20folio",
      VITE_FIREBASE_STORAGE_BUCKET: "demo-d20folio.appspot.com",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "0",
      VITE_FIREBASE_APP_ID: "1:0:web:0",
    },
  },
});
