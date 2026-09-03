/**
 * The codec-loss audit CLI: option contract and the report shape. The report is what
 * leaves the process — counts per family, hashed findings, codes and lost paths — so
 * this pins that no raw path ever reaches it.
 */
import { describe, expect, it } from "vitest";
import { buildReport, parseAuditOptions } from "../../scripts/audit-codec-loss";

describe("audit-codec-loss options", () => {
  it("accepts exactly one absolute directory mode", () => {
    expect(parseAuditOptions(["--fixtures", "/abs"])).toEqual({
      mode: "fixtures",
      directory: "/abs",
    });
    expect(parseAuditOptions(["--backup", "/abs"])).toEqual({
      mode: "backup",
      directory: "/abs",
    });
    expect(parseAuditOptions(["--export", "/abs/new"])).toEqual({
      mode: "export",
      directory: "/abs/new",
    });
    expect(() => parseAuditOptions([])).toThrow("one of");
    expect(() => parseAuditOptions(["--fixtures", "rel"])).toThrow("absolute");
    expect(() => parseAuditOptions(["--fixtures", "/a", "--backup", "/b"])).toThrow(
      "exactly one"
    );
    expect(() => parseAuditOptions(["--apply"])).toThrow("Unknown argument");
  });
});

describe("audit-codec-loss report", () => {
  it("counts per kind, lists only hashed findings, and fails on any loss or quarantine", () => {
    const report = buildReport("backup", [
      { path: "users/u/characters/a", kind: "parent", verdict: { verdict: "equal" } },
      {
        path: "users/u/characters/b",
        kind: "parent",
        verdict: { verdict: "loss", lost: ["state.round"], added: [] },
      },
      {
        path: "users/u/library/index",
        kind: "library",
        verdict: { verdict: "quarantine", code: "malformed-entry", path: "entries[2]" },
      },
      { path: "users/u/characters/a/public/sheet", kind: undefined, verdict: undefined },
    ]);
    expect(report.mode).toBe("backup");
    expect(report.counts.parent).toEqual({
      documents: 2,
      byteIdentical: 0,
      equal: 1,
      loss: 1,
      quarantine: 0,
    });
    expect(report.counts.library).toEqual({
      documents: 1,
      byteIdentical: 0,
      equal: 0,
      loss: 0,
      quarantine: 1,
    });
    expect(report.skipped).toBe(1);
    expect(report.findings).toEqual([
      {
        document: expect.stringMatching(/^[0-9a-f]{16}$/) as string,
        kind: "parent",
        verdict: "loss",
        lost: ["state.round"],
        added: [],
      },
      {
        document: expect.stringMatching(/^[0-9a-f]{16}$/) as string,
        kind: "library",
        verdict: "quarantine",
        code: "malformed-entry",
        path: "entries[2]",
      },
    ]);
    expect(report.ok).toBe(false);
    expect(JSON.stringify(report)).not.toContain("users/u");
  });

  it("a clean corpus is ok", () => {
    const report = buildReport("fixtures", [
      { path: "fixtures/a.json", kind: "parent", verdict: { verdict: "byte-identical" } },
    ]);
    expect(report.ok).toBe(true);
    expect(report.counts.parent.byteIdentical).toBe(1);
    expect(report.findings).toEqual([]);
  });
});
