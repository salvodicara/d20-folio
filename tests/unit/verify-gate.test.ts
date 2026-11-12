/**
 * A red main stops the line by itself (coordinator, 2026-11-12): the merge scripts ask
 * `verify_gate` first. It allows a merge when main's newest finished Verify passed, or
 * when the PR is labelled `verify-fix`; a cancelled run decides nothing; a read that
 * fails refuses. `gh` is a stand-in here that answers as GitHub would.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** Run the gate with `gh` answering `runs` (the filtered verdict) and `labelled`. */
function gate(runs: string | null, labelled = "false"): number {
  const fake = `gh() {
    case "$1 $2" in
      "run list") ${runs === null ? "return 1" : `printf '%s' '${runs}'`} ;;
      "pr view") printf '%s' '${labelled}' ;;
    esac
  }`;
  const run = spawnSync(
    "bash",
    ["-c", `${fake}; source scripts/lib/verify-gate.sh; verify_gate repo 7`],
    { encoding: "utf8" }
  );
  return run.status ?? -1;
}

describe("verify_gate", () => {
  it("main's newest Verify passed: merge", () => {
    expect(gate("success")).toBe(0);
  });
  it("it failed: refused, unless the PR is labelled verify-fix", () => {
    expect(gate("failure")).toBe(1);
    expect(gate("failure", "true")).toBe(0);
  });
  it("no finished Verify, or a read that fails: refused", () => {
    expect(gate("")).toBe(1);
    expect(gate(null)).toBe(1);
  });
});

describe("which run decides", () => {
  const verdict = (runs: object[]) =>
    spawnSync(
      "bash",
      ["-c", 'source scripts/lib/verify-gate.sh; jq -r "$VERIFY_GATE_JQ" <<<"$RUNS"'],
      { env: { ...process.env, RUNS: JSON.stringify(runs) }, encoding: "utf8" }
    ).stdout.trim();

  it("the newest finished one; a cancelled or running one decides nothing", () => {
    expect(
      verdict([
        { status: "in_progress", conclusion: null },
        { status: "completed", conclusion: "cancelled" },
        { status: "completed", conclusion: "failure" },
        { status: "completed", conclusion: "success" },
      ])
    ).toBe("failure");
    expect(verdict([{ status: "completed", conclusion: "cancelled" }])).toBe("");
  });
});
