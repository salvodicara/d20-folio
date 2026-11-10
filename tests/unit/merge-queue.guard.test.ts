/// <reference types="node" />
/**
 * Guard: the merge queue on main can run every check it requires.
 *
 * The queue builds each entry on a temporary branch and waits for the required checks
 * there; a workflow without the `merge_group` trigger never reports, and the queue
 * stalls forever. A job whose `if:` names only `pull_request` is skipped in the queue
 * and so checks nothing. This guard reads ci.yml (the queue's required checks) and fails
 * on either.
 *
 * Blind spot: it reads the YAML text; a job gated through an expression it cannot see
 * (a reusable workflow) is not checked.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CI = readFileSync(join(__dirname, "..", "..", ".github/workflows/ci.yml"), "utf8");

describe("the merge queue can run CI's checks", () => {
  it("ci.yml runs on merge_group", () => {
    const on = CI.slice(CI.indexOf("\non:"), CI.indexOf("\npermissions:"));
    expect(on).toMatch(/^\s+merge_group:/m);
  });

  it("no CI job is skipped in the queue by an if: that ignores merge_group", () => {
    const gated = [...CI.matchAll(/^ {4}if: (.*)$/gm)].map((m) => m[1] ?? "");
    expect(gated.filter((condition) => !condition.includes("merge_group"))).toEqual([]);
  });
});

/**
 * scripts/merge-pr.sh waits for the checks main's ruleset requires, by name. A CI job
 * renamed without the script would leave it waiting forever (or merging without it).
 */
describe("merge-pr.sh waits for CI's real check names", () => {
  const script = readFileSync(join(__dirname, "..", "..", "scripts/merge-pr.sh"), "utf8");
  const required = [
    ...script
      .slice(
        script.indexOf("REQUIRED=("),
        script.indexOf(")\n", script.indexOf("REQUIRED=("))
      )
      .matchAll(/"([^"]+)"/g),
  ].map((m) => m[1] ?? "");
  const jobNames = [...CI.matchAll(/^ {4}name: (.+)$/gm)].map((m) => m[1] ?? "");
  const expand = (name: string) =>
    name.includes("${{ matrix.shard }}")
      ? [1, 2].map((n) => name.replace("${{ matrix.shard }}", String(n)))
      : [name];

  it("each required check is a CI job, and every CI job is required", () => {
    expect(required.length).toBeGreaterThan(0);
    expect([...required].sort()).toEqual(jobNames.flatMap(expand).sort());
  });
});

describe("lockstep-merge.sh works under the up-to-date rule", () => {
  const script = readFileSync(
    join(__dirname, "..", "..", "scripts/lockstep-merge.sh"),
    "utf8"
  );

  it("brings a branch that is behind up to date instead of stopping", () => {
    expect(script).toContain("gh pr update-branch");
    expect(script).not.toMatch(/is behind main: rebase it first/);
  });

  it("verifies the pair again when main moves, a bounded number of times", () => {
    expect(script).toMatch(/for _ in 1 2 3 4; do\n\s+if round; then/);
  });
});
