import { beforeEach, describe, expect, it } from "vitest";
import {
  buildReport,
  breadcrumbSnapshot,
  diagnosticsLog,
  getDiagnosticsContext,
  onErrorReport,
  REPORT_MAX_BYTES,
  resetDiagnostics,
  setDiagnosticsContext,
  type DiagnosticsReport,
} from "@/lib/diagnostics";
import { redact, redactIdentifiers } from "@/lib/diagnostics/redact";

beforeEach(() => {
  resetDiagnostics();
  setDiagnosticsContext({
    sessionId: "s1",
    buildSha: "abc",
    appVersion: "1.0.0",
    uid: "u1",
  });
});

describe("diagnostics logger", () => {
  it("stamps every breadcrumb with the correlation ids present at log time", () => {
    setDiagnosticsContext({ characterId: "c1", campaignId: "camp1" });
    diagnosticsLog("info", "sheet.open", { tab: "play" });
    setDiagnosticsContext({ characterId: undefined });
    diagnosticsLog("debug", "sheet.close");
    const [first, second] = breadcrumbSnapshot();
    expect(first).toMatchObject({
      event: "sheet.open",
      characterId: "c1",
      campaignId: "camp1",
      data: { tab: "play" },
    });
    expect(second).toMatchObject({ event: "sheet.close", campaignId: "camp1" });
    expect(second).not.toHaveProperty("characterId");
  });

  it("an error-level event builds a report for every listener and keeps logging", () => {
    const seen: DiagnosticsReport[] = [];
    const off = onErrorReport((r) => seen.push(r));
    diagnosticsLog("warn", "codec.unknown-keys", { path: "build.equipment[2]" });
    diagnosticsLog("error", "character.quarantine", {
      code: "malformed-entry",
      path: "build.spells[0]",
    });
    off();
    diagnosticsLog("error", "character.quarantine", { code: "x", path: "y" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      schema: 1,
      uid: "u1",
      level: "error",
      event: "character.quarantine",
      message: "malformed-entry at build.spells[0]",
      context: { sessionId: "s1", buildSha: "abc", appVersion: "1.0.0", uid: "u1" },
    });
    expect(seen[0]?.breadcrumbs.map((b) => b.event)).toEqual([
      "codec.unknown-keys",
      "character.quarantine",
    ]);
  });

  it("does not build a report without a uid (nothing to attribute, nothing to write)", () => {
    setDiagnosticsContext({ uid: undefined });
    let calls = 0;
    onErrorReport(() => calls++);
    diagnosticsLog("error", "boot.failed");
    expect(calls).toBe(0);
    expect(breadcrumbSnapshot()).toHaveLength(1);
  });

  it("holds at most 500 breadcrumbs", () => {
    for (let i = 0; i < 700; i++) diagnosticsLog("debug", `tick.${i}`);
    const snap = breadcrumbSnapshot();
    expect(snap).toHaveLength(500);
    expect(snap[0]?.event).toBe("tick.200");
  });

  it("caps a report at 32 KiB by dropping the oldest breadcrumbs, never the newest", () => {
    const big = "x".repeat(400);
    for (let i = 0; i < 500; i++) diagnosticsLog("debug", `big.${i}`, { big });
    const report = buildReport({
      uid: "u1",
      event: "e",
      message: "m",
      context: getDiagnosticsContext(),
      breadcrumbs: breadcrumbSnapshot(),
      now: 1,
    });
    expect(new TextEncoder().encode(JSON.stringify(report)).length).toBeLessThanOrEqual(
      REPORT_MAX_BYTES
    );
    expect(report.breadcrumbs.at(-1)?.event).toBe("big.499");
    expect(report.breadcrumbs.length).toBeGreaterThan(10);
  });

  it("redacts emails, long tokens and document identifiers in messages and data", () => {
    expect(redact("mail me a@b.io token " + "A".repeat(48))).toBe(
      "mail me [email] token [redacted]"
    );
    expect(redactIdentifiers("denied users/abc123/characters/def456")).toBe(
      "denied users/[uid]/characters/[id]"
    );
    diagnosticsLog("error", "save.denied", { message: "users/u1/characters/c1 a@b.io" });
    expect(breadcrumbSnapshot()[0]?.data?.message).toBe(
      "users/[uid]/characters/[id] [email]"
    );
  });
});
