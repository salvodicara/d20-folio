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

// Coordinator, 2026-11-13: a fix is proven by dispatching Verify on its branch, and that
// run's red jobs (other lanes' clusters) sit on the PR head. The merge then refused the
// fix itself. A verify-fix is judged by its own CI; any other PR still is not let off.
describe("filter_branch_verify", () => {
  const runs = [
    { name: "typecheck + lint", status: "completed", conclusion: "success", suite: 1 },
    { name: "e2e (shard 1/8)", status: "completed", conclusion: "failure", suite: 9 },
    {
      name: "unit (composed, shard 1/3)",
      status: "completed",
      conclusion: "failure",
      suite: 9,
    },
  ];
  const judged = (labelled: string) => {
    const run = spawnSync(
      "bash",
      [
        "-c",
        'source scripts/lib/verify-gate.sh; filter_branch_verify "$RUNS" "$SUITES" "$LABELLED"',
      ],
      {
        env: {
          ...process.env,
          RUNS: JSON.stringify(runs),
          SUITES: "[9]",
          LABELLED: labelled,
        },
        encoding: "utf8",
      }
    );
    return {
      names: (JSON.parse(run.stdout) as Array<{ name: string }>).map((r) => r.name),
      note: run.stderr,
    };
  };

  it("a verify-fix: the branch's Verify jobs are named in one line and do not block", () => {
    const { names, note } = judged("true");
    expect(names).toEqual(["typecheck + lint"]);
    expect(note).toContain("e2e (shard 1/8),unit (composed, shard 1/3)");
  });

  it("any other PR: its branch's red Verify still blocks", () => {
    expect(judged("false").names).toHaveLength(3);
  });
});
