import { describe, expect, it } from "vitest";
import { summariseDiagnostics, trailOf } from "../../scripts/survey-diagnostics";

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

// Coordinator, 2026-11-22: production errors from one account (save refusals, an
// unreadable combat state, the multi-tab lease line). Each report's own breadcrumb
// trail says what led to it; printed as event names only.
describe("trailOf", () => {
  const crumb = (t: number, event: string, data?: Record<string, unknown>) => ({
    t,
    level: "error",
    event,
    ...(data ? { data } : {}),
  });
  const T = Date.parse("2026-11-12T20:00:00Z");
  const reports = [
    report({
      event: "character.save-rejected",
      createdAt: at("2026-11-12T20:00:00Z"),
      createdAtMs: T,
      breadcrumbs: [
        crumb(T - 90_000, "runtime.console", {
          message: "Firestore (12.13.0): Failed to obtain primary lease for action 'X'.",
        }),
        crumb(T - 30_000, "runtime.console", {
          message:
            "@firebase/firestore: Firestore (12.13.0): Failed to obtain primary lease",
        }),
        crumb(T - 1_000, "character.save-rejected", { message: "private text" }),
      ],
    }),
    report({
      event: "character.save-rejected",
      createdAt: at("2026-11-12T20:05:00Z"),
      createdAtMs: T + 300_000,
      breadcrumbs: [
        crumb(T + 299_000, "combat-state.invalid", { reason: "invalid-combat-state" }),
      ],
    }),
    report({ event: "other", createdAt: at("2026-11-12T20:06:00Z") }),
  ];

  it("lists each report of the event: version, minutes since the previous one, its trail by event name, and a lease line within the minute before", () => {
    expect(trailOf(reports, "character.save-rejected")).toEqual([
      {
        appVersion: "0.26.0",
        minutesSincePrevious: null,
        leaseWithinMinute: true,
        trail: [
          "runtime.console[lease]",
          "runtime.console[lease]",
          "character.save-rejected",
        ],
      },
      {
        appVersion: "0.26.0",
        minutesSincePrevious: 5,
        leaseWithinMinute: false,
        trail: ["combat-state.invalid[invalid-combat-state]"],
      },
    ]);
  });

  it("never prints a message, a uid or an id", () => {
    const text = JSON.stringify(trailOf(reports, "character.save-rejected"));
    expect(text).not.toContain("private text");
    expect(text).not.toContain("u1");
    expect(text).not.toContain("action 'X'");
  });
});
