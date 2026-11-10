import { describe, expect, it } from "vitest";
import { summariseDiagnostics } from "../../scripts/survey-diagnostics";

const at = (iso: string) => new Date(iso);
const report = (over: Record<string, unknown>) => ({
  uid: "u1",
  event: "play.campaign-read-failed",
  message: "private text",
  createdAt: at("2026-11-10T18:00:00Z"),
  context: { appVersion: "0.26.0", buildSha: "8c9309973" },
  ...over,
});

describe("summariseDiagnostics", () => {
  it("counts reports since the cut-off by version and event, players as a number only", () => {
    const summary = summariseDiagnostics(
      [
        report({}),
        report({ uid: "u2" }),
        report({ event: "error.window" }),
        report({ context: { appVersion: "0.25.0" }, uid: "u3" }),
        report({ createdAt: at("2026-11-09T10:00:00Z") }),
      ],
      at("2026-11-10T17:00:00Z")
    );
    expect(summary).toEqual({
      since: "2026-11-10T17:00:00.000Z",
      reports: 4,
      players: 3,
      byVersion: { "0.26.0": 3, "0.25.0": 1 },
      byEvent: { "play.campaign-read-failed": 3, "error.window": 1 },
    });
  });

  it("never prints a message, a uid or a breadcrumb", () => {
    const text = JSON.stringify(
      summariseDiagnostics([report({})], at("2026-11-10T00:00:00Z"))
    );
    expect(text).not.toContain("private text");
    expect(text).not.toContain("u1");
  });

  it("buckets a missing version or event as unknown", () => {
    const summary = summariseDiagnostics(
      [report({ context: {}, event: undefined })],
      at("2026-11-10T00:00:00Z")
    );
    expect(summary.byVersion).toEqual({ unknown: 1 });
    expect(summary.byEvent).toEqual({ unknown: 1 });
  });
});
