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

// Coordinator, 2026-11-13: a lockstep merge proves a pair with a dispatched Verify, and
// the squash merge then puts that same tree on main. Main's own Verify of it takes about
// 45 minutes; meanwhile the line read the PREVIOUS red verdict and stood still. A passed
// lockstep run on the exact trees main and the pack's main now have is main's verdict.
describe("a lockstep run on the tree main now has", () => {
  /** `gh` answering by path: main is m1 (app tree A), the pack's main has tree P. */
  function gateWith(opts: {
    verdict: string;
    decidedHead?: string;
    runs: string;
    trees: Record<string, string>;
    failing?: string;
  }): number {
    const answers: Record<string, string> = {
      "repos/repo/commits/main": "m1",
      "repos/repo/commits/m1": "A",
      "repos/salvodicara/d20-folio-content/commits/main": "P",
      ...opts.trees,
    };
    const cases = Object.entries(answers)
      .map(([path, out]) => `"${path}") printf '%s' '${out}' ;;`)
      .join("\n");
    const fake = `gh() {
      if [ "$1 $2" = "run list" ]; then
        case "$*" in
          *headSha*) printf '%s' '${opts.decidedHead ?? "m0"}' ;;
          *) printf '%s' '${opts.verdict}' ;;
        esac
        return 0
      fi
      if [ "$1 $2" = "pr view" ]; then printf false; return 0; fi
      if [ "$1" = "api" ]; then
        ${opts.failing ? `[ "$2" = "${opts.failing}" ] && return 1` : ":"}
        case "$2" in
          repos/repo/actions/workflows/verify.yml/runs*) printf '%s' '${opts.runs}' ;;
          ${cases}
          *) return 1 ;;
        esac
        return 0
      fi
      return 1
    }`;
    return (
      spawnSync(
        "bash",
        ["-c", `${fake}; source scripts/lib/verify-gate.sh; verify_gate repo 7`],
        { encoding: "utf8" }
      ).status ?? -1
    );
  }
  const lockstep = "l1 Verify + pack p1";

  it("passed on main's tree with the pack main's tree: main's verdict, merge", () => {
    expect(
      gateWith({
        verdict: "failure",
        runs: lockstep,
        trees: {
          "repos/repo/commits/l1": "A",
          "repos/salvodicara/d20-folio-content/commits/p1": "P",
        },
      })
    ).toBe(0);
  });

  it("a different app tree, or a different pack tree: refused", () => {
    expect(
      gateWith({
        verdict: "failure",
        runs: lockstep,
        trees: {
          "repos/repo/commits/l1": "B",
          "repos/salvodicara/d20-folio-content/commits/p1": "P",
        },
      })
    ).toBe(1);
    expect(
      gateWith({
        verdict: "failure",
        runs: lockstep,
        trees: {
          "repos/repo/commits/l1": "A",
          "repos/salvodicara/d20-folio-content/commits/p1": "Q",
        },
      })
    ).toBe(1);
  });

  it("a run with no pack of its own proves nothing", () => {
    expect(
      gateWith({
        verdict: "failure",
        runs: "l1 Verify",
        trees: { "repos/repo/commits/l1": "A" },
      })
    ).toBe(1);
  });

  it("main's own finished Verify of this very commit stands, even red", () => {
    expect(
      gateWith({
        verdict: "failure",
        decidedHead: "m1",
        runs: lockstep,
        trees: {
          "repos/repo/commits/l1": "A",
          "repos/salvodicara/d20-folio-content/commits/p1": "P",
        },
      })
    ).toBe(1);
  });

  it("a read that fails refuses (fails closed)", () => {
    expect(
      gateWith({
        verdict: "failure",
        runs: lockstep,
        trees: {
          "repos/repo/commits/l1": "A",
          "repos/salvodicara/d20-folio-content/commits/p1": "P",
        },
        failing: "repos/salvodicara/d20-folio-content/commits/main",
      })
    ).toBe(1);
  });

  it("no finished Verify on main yet: the lockstep run decides too", () => {
    expect(
      gateWith({
        verdict: "",
        decidedHead: "",
        runs: lockstep,
        trees: {
          "repos/repo/commits/l1": "A",
          "repos/salvodicara/d20-folio-content/commits/p1": "P",
        },
      })
    ).toBe(0);
  });
});
