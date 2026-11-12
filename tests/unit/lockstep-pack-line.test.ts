/**
 * The lockstep merge takes its pack PR from the app PR's body (`Pack: #N`). A body that
 * pasted another PR's body can carry two such lines; the script then paired the app
 * with the wrong pack (2026-11-12). Now it resolves exactly one: two or more lines
 * refuse unless the pack is passed explicitly and is one of them; an explicit pack the
 * body doesn't name refuses too.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const SCRIPT = "scripts/lib/lockstep-pack.sh";

function resolve(body: string, explicit = ""): { code: number; out: string } {
  const run = spawnSync(
    "bash",
    ["-c", `source ${SCRIPT}; resolve_pack_pr "$BODY" "$EXPLICIT"`],
    { env: { ...process.env, BODY: body, EXPLICIT: explicit }, encoding: "utf8" }
  );
  return { code: run.status ?? -1, out: `${run.stdout}${run.stderr}`.trim() };
}

describe("the lockstep pack line", () => {
  it("one Pack line: that pack", () => {
    expect(resolve("Pack: #162\n\nbody")).toEqual({ code: 0, out: "162" });
  });

  it("no Pack line: refused", () => {
    expect(resolve("no pack here").code).not.toBe(0);
  });

  it("two Pack lines: refused, naming both", () => {
    const r = resolve("Pack: #162\n…\nPack: #156\n");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("#162");
    expect(r.out).toContain("#156");
  });

  it("two Pack lines and an explicit pack among them: that pack", () => {
    expect(resolve("Pack: #162\nPack: #156\n", "162")).toEqual({ code: 0, out: "162" });
  });

  it("an explicit pack the body doesn't name: refused", () => {
    expect(resolve("Pack: #162\n", "156").code).not.toBe(0);
  });
});
