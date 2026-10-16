/**
 * diagnostics-digest — the owner's daily email of NEW automatic error reports
 * (ADR-0008 kept, owner 2026-10-16: an email instead of checking the inbox).
 */
import { describe, it, expect } from "vitest";
import { formatDiagnosticsDigest } from "./diagnostics-digest";

const report = (
  over: Partial<Parameters<typeof formatDiagnosticsDigest>[0][number]> = {}
) => ({
  uid: "uid-a",
  event: "character.quarantine",
  message: "Invalid character document: invalid-revision",
  createdAtMs: Date.UTC(2026, 9, 16, 9, 0),
  appVersion: "0.25.0",
  ...over,
});

describe("formatDiagnosticsDigest", () => {
  it("sends nothing when there are no new reports", () => {
    expect(formatDiagnosticsDigest([])).toBeNull();
  });

  it("groups by event and message, with counts and how many accounts saw each", () => {
    const msg = formatDiagnosticsDigest([
      report(),
      report({ uid: "uid-b" }),
      report({ uid: "uid-b" }),
      report({ event: "save.denied", message: "permission-denied" }),
    ]);
    expect(msg?.subject).toBe("d20 Folio: 4 new errors (2 kinds)");
    expect(msg?.text).toContain(
      "3× character.quarantine — Invalid character document: invalid-revision (2 accounts)"
    );
    expect(msg?.text).toContain("1× save.denied — permission-denied (1 account)");
    // Most frequent first.
    expect(msg?.text.indexOf("character.quarantine")).toBeLessThan(
      msg?.text.indexOf("save.denied") ?? -1
    );
  });

  it("never carries an account id, and links the admin inbox", () => {
    const msg = formatDiagnosticsDigest([report()]);
    expect(msg?.text).not.toContain("uid-a");
    expect(msg?.html).not.toContain("uid-a");
    expect(msg?.text).toContain("https://d20-folio.web.app/admin");
  });

  it("escapes HTML in messages", () => {
    const msg = formatDiagnosticsDigest([report({ message: "<script>x</script>" })]);
    expect(msg?.html).toContain("&lt;script&gt;");
    expect(msg?.html).not.toContain("<script>");
  });
});
