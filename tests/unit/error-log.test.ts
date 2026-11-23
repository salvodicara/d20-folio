/**
 * error-log — the bug-report ring buffer (OWN-37).
 *
 * Verifies: capture of console.error / window error / unhandled rejection,
 * ring-buffer eviction, message truncation + redaction, idempotent install,
 * and that the original console.error still runs (chaining).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installErrorLog, getErrorLog, clearErrorLog } from "@/features/report/error-log";
import { breadcrumbSnapshot } from "@/lib/diagnostics/logger";

describe("error-log ring buffer", () => {
  let uninstall: () => void = () => undefined;

  beforeEach(() => {
    clearErrorLog();
  });

  afterEach(() => {
    uninstall();
    clearErrorLog();
    vi.restoreAllMocks();
  });

  it("captures console.error and chains to the original", () => {
    // Spy on the ORIGINAL so we can prove chaining without polluting test output.
    const original = vi.spyOn(console, "error").mockImplementation(() => undefined);
    uninstall = installErrorLog();

    console.error("boom", { code: 42 });

    const log = getErrorLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.source).toBe("console");
    expect(log[0]?.message).toContain("boom");
    expect(log[0]?.message).toContain("42");
    // The original console.error still ran (chaining).
    expect(original).toHaveBeenCalledOnce();
    expect(typeof log[0]?.t).toBe("number");
  });

  it("evicts oldest entries past capacity", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    uninstall = installErrorLog({ capacity: 3 });

    for (let i = 0; i < 5; i++) console.error(`err-${i}`);

    const log = getErrorLog();
    expect(log).toHaveLength(3);
    // Oldest two (err-0, err-1) were dropped; newest three remain in order.
    expect(log.map((e) => e.message)).toEqual(["err-2", "err-3", "err-4"]);
  });

  it("truncates long messages and redacts emails + tokens", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    uninstall = installErrorLog();

    console.error("contact me at user@example.com");
    console.error("token=" + "a".repeat(60));
    // A long message of short words (no single 40+ char run, so redaction leaves
    // it intact) exercises the length truncation path.
    console.error(Array.from({ length: 200 }, () => "word").join(" "));

    const log = getErrorLog();
    expect(log[0]?.message).toContain("[email]");
    expect(log[0]?.message).not.toContain("user@example.com");
    expect(log[1]?.message).toContain("[redacted]");
    // ~1000 chars collapses to the cap + ellipsis.
    expect(log[2]?.message.length).toBeLessThanOrEqual(300);
    expect(log[2]?.message.endsWith("…")).toBe(true);
  });

  it("captures window error events", () => {
    uninstall = installErrorLog();
    window.dispatchEvent(new ErrorEvent("error", { message: "window kaboom" }));

    const log = getErrorLog();
    expect(log.some((e) => e.source === "window" && e.message.includes("kaboom"))).toBe(
      true
    );
  });

  it("captures unhandled rejections", () => {
    uninstall = installErrorLog();
    // jsdom doesn't construct PromiseRejectionEvent from `new` cleanly across
    // versions; dispatch a plain Event carrying a `reason` to exercise the handler.
    const evt = new Event("unhandledrejection") as Event & { reason?: unknown };
    evt.reason = "rejected-thing";
    window.dispatchEvent(evt);

    const log = getErrorLog();
    expect(
      log.some(
        (e) => e.source === "unhandledrejection" && e.message.includes("rejected-thing")
      )
    ).toBe(true);
  });

  it("is idempotent — a second install does not double-record", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const u1 = installErrorLog();
    const u2 = installErrorLog(); // no-op while already installed

    console.error("once");
    expect(getErrorLog()).toHaveLength(1);

    u2();
    u1();
    uninstall = () => undefined;
  });

  it("Error instances stringify to name: message", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    uninstall = installErrorLog();

    console.error(new TypeError("bad value"));
    expect(getErrorLog()[0]?.message).toContain("TypeError: bad value");
  });

  // Coordinator, 2026-11-22: the owner's digest counted 25 of these as errors. Firestore
  // logs it with console.error when a second tab cannot take the multi-tab persistence
  // lease, and retries on its own: a warning breadcrumb, never an auto-reported error.
  it("records the Firestore multi-tab lease line as a warning, not an error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    uninstall = installErrorLog();
    console.error(
      "@firebase/firestore: Firestore (12.13.0): Failed to obtain primary lease for action 'Collect garbage'."
    );
    console.error("boom");
    const crumbs = breadcrumbSnapshot().filter((c) => c.event === "runtime.console");
    const lease = crumbs.find((c) => String(c.data?.message).includes("primary lease"));
    const boom = crumbs.find((c) => String(c.data?.message).includes("boom"));
    expect(lease?.level).toBe("warn");
    expect(boom?.level).toBe("error");
    // It stays in the bug-report ring like any other console line.
    expect(getErrorLog().some((e) => e.message.includes("primary lease"))).toBe(true);
  });
});
