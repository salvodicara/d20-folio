/**
 * collect-debug-context — the sanitized client snapshot attached to a bug report
 * (OWN-37).
 *
 * Verifies: the captured shape, ID parsing from the path, localStorage reads
 * (theme + locale), sanitization (no `undefined`), error-log inclusion, and that
 * the module runs with NO Firebase (the pure-modules guard asserts the import
 * graph; this asserts it actually executes under jsdom without env vars).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { collectDebugContext } from "@/features/report/collect-debug-context";
import { installErrorLog, clearErrorLog, getErrorLog } from "@/features/report/error-log";

describe("collectDebugContext", () => {
  beforeEach(() => {
    localStorage.clear();
    clearErrorLog();
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearErrorLog();
  });

  it("returns the core shape with build provenance", () => {
    const ctx = collectDebugContext();
    expect(ctx.appVersion).toBe("test"); // from vitest define
    expect(ctx.gitSha).toBe("testsha"); // from vitest define
    expect(typeof ctx.userAgent).toBe("string");
    expect(ctx.viewport).toMatch(/^\d+x\d+$/);
    expect(typeof ctx.online).toBe("boolean");
    expect(typeof ctx.serviceWorker).toBe("boolean");
    expect(typeof ctx.capturedAt).toBe("number");
    expect(Array.isArray(ctx.recentErrors)).toBe(true);
  });

  it("parses characterId from /characters/:id (but not /characters/new)", () => {
    window.history.pushState({}, "", "/characters/abc123?tab=spells");
    const ctx = collectDebugContext();
    expect(ctx.pathname).toBe("/characters/abc123");
    expect(ctx.url).toBe("/characters/abc123?tab=spells");
    expect(ctx.characterId).toBe("abc123");
    expect(ctx.campaignId).toBeUndefined();
  });

  it("does not treat /characters/new as a character id", () => {
    window.history.pushState({}, "", "/characters/new");
    const ctx = collectDebugContext();
    expect(ctx.characterId).toBeUndefined();
  });

  it("parses campaignId from /campaigns/:id", () => {
    window.history.pushState({}, "", "/campaigns/camp-9");
    const ctx = collectDebugContext();
    expect(ctx.campaignId).toBe("camp-9");
  });

  it("reads theme + locale from localStorage", () => {
    localStorage.setItem(
      "d20-folio-ui",
      JSON.stringify({ state: { theme: "light" }, version: 0 })
    );
    localStorage.setItem("i18nextLng", "it");
    const ctx = collectDebugContext();
    expect(ctx.theme).toBe("light");
    expect(ctx.locale).toBe("it");
  });

  it("falls back to 'unknown' when persisted state is absent or corrupt", () => {
    localStorage.setItem("d20-folio-ui", "{not json");
    const ctx = collectDebugContext();
    expect(ctx.theme).toBe("unknown");
    expect(ctx.locale).toBe("unknown");
  });

  it("includes recent errors from the ring buffer", () => {
    // Spy BEFORE install so the ring's chained console.error wraps the spy (and
    // the spy itself swallows output) — installing after the spy would let the
    // spy replace the patched fn and the ring would never record.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const uninstall = installErrorLog();
    console.error("captured for report");
    expect(getErrorLog().length).toBeGreaterThan(0);

    const ctx = collectDebugContext();
    expect(ctx.recentErrors.some((e) => e.message.includes("captured for report"))).toBe(
      true
    );
    uninstall();
  });

  it("strips undefined — the serialized payload never contains undefined keys", () => {
    window.history.pushState({}, "", "/settings");
    const ctx = collectDebugContext();
    // No id keys on a non-detail route.
    expect("characterId" in ctx).toBe(false);
    expect("campaignId" in ctx).toBe(false);
    // Round-trips through JSON with no loss / undefined.
    const json = JSON.stringify(ctx);
    expect(json).not.toContain("undefined");
    expect(JSON.parse(json)).toMatchObject({ pathname: "/settings" });
  });
});
