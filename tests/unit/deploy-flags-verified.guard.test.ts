/// <reference types="node" />
/**
 * Guard: the e2e runs that gate a deploy test the build players get.
 *
 * deploy.yml builds with feature flags on (VITE_PEER_SPENDS_LEDGER,
 * VITE_COMBAT_EFFECTS_V26), and the deploy only promotes a SHA whose Verify run is
 * green. Until 2026-11-10 Verify's e2e matrix ran with those flags off, so the
 * shipped configuration never ran end to end. This guard reads every flag deploy.yml
 * sets to a fixed value and fails when Verify's e2e matrix, or CI's fight smoke,
 * does not set the same value.
 *
 * Blind spot: it reads the YAML text of each job's block; a flag set through an
 * expression (VITE_NEW_UI follows a deploy input, default off) is left out.
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

const deployFlags = Object.fromEntries(
  Object.entries(literalFlags(jobBlock(read("deploy.yml"), "deploy"))).filter(
    ([name]) => !name.startsWith("VITE_FIREBASE_")
  )
);

describe("the deploy's feature flags are the ones its gating e2e runs use", () => {
  it("deploy.yml turns the v0.26 writers on", () => {
    expect(deployFlags).toMatchObject({
      VITE_PEER_SPENDS_LEDGER: "true",
      VITE_COMBAT_EFFECTS_V26: "true",
    });
  });

  it.each([
    ["verify.yml", "e2e"],
    ["ci.yml", "design-rules"],
  ])("%s %s sets every deploy flag to the deployed value", (file, job) => {
    const flags = literalFlags(jobBlock(read(file), job));
    expect(flags).toMatchObject(deployFlags);
  });
});
