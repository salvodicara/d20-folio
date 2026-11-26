/// <reference types="node" />
/**
 * Guard: the e2e runs that gate a deploy test the build players get.
 *
 * deploy.yml builds with feature flags on (VITE_PEER_SPENDS_LEDGER), and the deploy
 * only promotes a SHA whose Verify run is
 * green. Until 2026-11-10 Verify's e2e matrix ran with those flags off, so the
 * shipped configuration never ran end to end. This guard reads every flag deploy.yml
 * sets to a fixed value and fails when Verify's e2e matrix, or CI's fight smoke,
 * does not set the same value.
 *
 * Blind spot: it reads the YAML text of each job's block; a flag set through an
 * expression is left out. VITE_NEW_UI is a literal "0" (#1233: players opt in from
 * Settings), checked on its own below.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (file: string) =>
  readFileSync(join(ROOT, ".github/workflows", file), "utf8");

/** The text of one job, from `  <job>:` to the next top-level job. */
function jobBlock(yaml: string, job: string): string {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => line === `  ${job}:`);
  if (start < 0) throw new Error(`no job ${job}`);
  const end = lines.findIndex(
    (line, i) => i > start && /^ {2}[a-z][\w-]*:\s*$/.test(line)
  );
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

/** Every `VITE_*: "<literal>"` the block sets. */
function literalFlags(block: string): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const m of block.matchAll(/^\s+(VITE_[A-Z0-9_]+):\s*"([^"$]*)"\s*$/gm)) {
    if (m[1] !== undefined && m[2] !== undefined) flags[m[1]] = m[2];
  }
  return flags;
}

const allDeployFlags = literalFlags(jobBlock(read("deploy.yml"), "deploy"));
// VITE_NEW_UI is left out of the comparison: the e2e runs build the new UI on purpose
// (their own servers set it to "1"), and the deploy's "0" is checked below.
const deployFlags = Object.fromEntries(
  Object.entries(allDeployFlags).filter(
    ([name]) => !name.startsWith("VITE_FIREBASE_") && name !== "VITE_NEW_UI"
  )
);

describe("the deploy's feature flags are the ones its gating e2e runs use", () => {
  // #1233: the new UI is the player's choice, never a deploy-time switch for everyone.
  it("deploy.yml never forces the new UI, and offers no input to do it", () => {
    expect(allDeployFlags.VITE_NEW_UI).toBe("0");
    expect(read("deploy.yml")).not.toMatch(/^\s+new_ui:/m);
  });

  it("deploy.yml turns the peer-spends ledger writer on", () => {
    expect(deployFlags).toMatchObject({ VITE_PEER_SPENDS_LEDGER: "true" });
  });

  it.each([
    ["verify.yml", "e2e"],
    ["ci.yml", "design-rules"],
  ])("%s %s sets every deploy flag to the deployed value", (file, job) => {
    const flags = literalFlags(jobBlock(read(file), job));
    expect(flags).toMatchObject(deployFlags);
  });

  it("the rehearsal (the real emulator and rules) builds with the deploy flags", () => {
    const config = readFileSync(join(ROOT, "playwright.rehearsal.config.ts"), "utf8");
    const flags = Object.fromEntries(
      [...config.matchAll(/^\s+(VITE_[A-Z0-9_]+):\s*"([^"]*)",?\s*$/gm)].map((m) => [
        m[1] ?? "",
        m[2] ?? "",
      ])
    );
    expect(flags).toMatchObject(deployFlags);
  });
});
