import { spawnSync } from "node:child_process";

const cliArgs = process.argv.slice(2);
if (cliArgs[0] === "--") cliArgs.shift();

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "playwright",
    "test",
    "tests/e2e/_perf-probe.spec.ts",
    "--project=chromium",
    "--retries=0",
    ...cliArgs,
  ],
  {
    env: { ...process.env, PERF: "1" },
    stdio: "inherit",
  }
);

process.exitCode = result.status ?? 1;
