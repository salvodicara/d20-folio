import { defineConfig, devices } from "@playwright/test";
import { env } from "node:process";

const RUNTIME_ENV = env as Record<string, string | undefined>;
const VISUAL_PORT = Number(RUNTIME_ENV.VISUAL_REVIEW_PORT ?? 5194);
const ARTIFACT_ROOT = "artifacts/visual-review";

/** Isolated owner-review lane; ordinary Playwright discovery never loads this file. */
export default defineConfig({
  testDir: "./tests/visual",
  retries: 0,
  outputDir: `${ARTIFACT_ROOT}/output`,
  reporter: [["html", { outputFolder: `${ARTIFACT_ROOT}/report`, open: "never" }]],
  use: {
    baseURL: `http://localhost:${VISUAL_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "visual-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm vite --port ${VISUAL_PORT}`,
    url: `http://localhost:${VISUAL_PORT}`,
    reuseExistingServer: !RUNTIME_ENV.CI,
    env: { VITE_DEV_BYPASS_AUTH: "true" },
  },
});
