/**
 * open-report + crash-report — the reporter's entry seam.
 *
 * Pins the park/claim contract every entry point rides (palette · account menu ·
 * crash screens): `openReport(prefill?)` parks the screenshot + prefill and flips
 * the global flag; the dialog claims each exactly once; a fresh open NEVER leaks
 * the previous open's prefill. Plus the pure crash-prefill builder (bug · high ·
 * error headline · route + stack head) and the shared after-paint deferral.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { captureMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
}));

// Keep the test free of html2canvas — capture is best-effort and orthogonal here.
vi.mock("@/features/report/capture-screenshot", () => ({
  captureScreenshot: captureMock,
}));

import {
  openReport,
  openReportAfterPaint,
  takePendingPrefill,
  takePendingScreenshot,
} from "@/features/report/open-report";
import { buildCrashPrefill } from "@/features/report/crash-report";
import { useUIStore } from "@/stores/uiStore";

beforeEach(() => {
  captureMock.mockReset().mockResolvedValue(null);
  useUIStore.setState({ reportOpen: false });
  // Drain any parked state from a previous test.
  takePendingPrefill();
  takePendingScreenshot();
});

describe("openReport — park/claim contract", () => {
  it("parks the prefill, flips the flag, and the claim is one-shot", async () => {
    await openReport({ type: "bug", title: "boom" });
    expect(useUIStore.getState().reportOpen).toBe(true);
    expect(takePendingPrefill()).toEqual({ type: "bug", title: "boom" });
    // Claimed once — a re-mount must not see a stale prefill.
    expect(takePendingPrefill()).toBeNull();
  });

  it("a plain open CLEARS any stale prefill from a previous entry point", async () => {
    await openReport({ title: "crash leftovers" });
    // The user dismissed that dialog without mounting it; later opens plainly.
    await openReport();
    expect(takePendingPrefill()).toBeNull();
  });

  it("parks the captured screenshot for a one-shot claim", async () => {
    const shot = { blob: new Blob(["x"]), dataUrl: "data:,x", width: 1, height: 1 };
    captureMock.mockResolvedValue(shot);
    await openReport();
    expect(takePendingScreenshot()).toBe(shot);
    expect(takePendingScreenshot()).toBeNull();
  });

  it("openReportAfterPaint defers across two frames before opening", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    try {
      openReportAfterPaint({ title: "deferred" });
      // Nothing happens until both frames run (the launcher chrome must paint away).
      expect(useUIStore.getState().reportOpen).toBe(false);
      expect(frames).toHaveLength(1);
      frames[0]?.(0);
      expect(frames).toHaveLength(2);
      frames[1]?.(0);
      await vi.waitFor(() => expect(useUIStore.getState().reportOpen).toBe(true));
      expect(takePendingPrefill()).toEqual({ title: "deferred" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("buildCrashPrefill — pure builder", () => {
  it("builds bug · high · headline title · error + stack head", () => {
    const error = new Error("cannot read x");
    error.name = "TypeError";
    error.stack = [
      "TypeError: cannot read x",
      "    at Boom (https://app/main.js:10:5)",
      "    at renderWithHooks (https://app/vendor.js:1:1)",
    ].join("\n");
    const prefill = buildCrashPrefill(error);
    expect(prefill.type).toBe("bug");
    expect(prefill.severity).toBe("high");
    expect(prefill.title).toBe("TypeError: cannot read x");
    expect(prefill.description).toContain("at Boom (https://app/main.js:10:5)");
    // The stack's message line is not duplicated as a frame — the error text
    // appears exactly once (the headline).
    expect(prefill.description?.match(/cannot read x/g)).toHaveLength(1);
  });

  it("keeps Gecko-style frames, caps at 4, and truncates the title to its max", () => {
    const error = new Error("x".repeat(300));
    error.stack = Array.from(
      { length: 10 },
      (_, i) => `boom@https://app/m.js:${i}:1`
    ).join("\n");
    const prefill = buildCrashPrefill(error);
    expect(prefill.title).toHaveLength(120);
    const frames = (prefill.description ?? "").split("\n").filter((l) => l.includes("@"));
    expect(frames).toHaveLength(4);
  });

  it("falls back to the error name when the message is empty", () => {
    const error = new Error("");
    error.stack = "";
    expect(buildCrashPrefill(error).title).toBe("Error");
  });

  it("never leaks machine-authored identifiers — no route, uid, or character id", () => {
    // A crash on a character route whose Firestore error quotes the doc path:
    // a 28-char uid (too short for error-log's 40+ token redaction) + the route.
    const uid = "AbCdEfGhIjKlMnOpQrStUvWxYz12";
    const error = new Error(
      `Missing or insufficient permissions: users/${uid}/characters/char-777 ` +
        `while rendering /characters/char-777?tab=spells`
    );
    error.stack = `    at save (https://app/characters/char-777/main.js:1:1)`;
    const prefill = buildCrashPrefill(error);
    const text = `${prefill.title}\n${prefill.description ?? ""}`;
    expect(text).not.toContain(uid);
    expect(text).not.toContain("char-777");
    expect(text).toContain("users/[redacted]");
    expect(text).toContain("/characters/[redacted]");
    // The crash route itself is no longer prefilled at all — admins read it
    // privately from the report's debugContext.
    expect(prefill.description?.startsWith("Missing or insufficient")).toBe(true);
    // An invite code is a capability token (auto-joins a campaign) — redacted too.
    const joinError = new Error("failed to resolve invite at /join/SeCrEtC0de9");
    joinError.stack = "";
    const joinTitle = buildCrashPrefill(joinError).title ?? "";
    expect(joinTitle).not.toContain("SeCrEtC0de9");
    expect(joinTitle).toContain("/join/[redacted]");
  });

  it("leaves the static /characters/new route readable", () => {
    const error = new Error("boom at /characters/new step 2");
    error.stack = "";
    expect(buildCrashPrefill(error).title).toContain("/characters/new");
  });
});
