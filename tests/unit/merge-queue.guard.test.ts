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
