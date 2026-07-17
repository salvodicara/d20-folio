/**
 * overlay-history — the shared mechanism that makes hardware / gesture Back close
 * an open overlay instead of leaving the page.
 *
 * Pins: a user Back closes the topmost overlay (LIFO) and does NOT navigate; a
 * non-Back close (Esc/scrim) retires the sentinel with exactly one silent
 * `history.back()`; and closing because a real navigation buried the sentinel
 * never rewinds that navigation.
 *
 * (jsdom-bound: window/history/popstate — listed in tests/lanes.ts.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pushOverlayEntry, __resetOverlayHistory } from "@/lib/overlay-history";

beforeEach(() => {
  __resetOverlayHistory();
  window.history.replaceState({ key: "base" }, "", "/base");
});
afterEach(() => vi.restoreAllMocks());

/** Simulate the browser firing a Back. */
function fireBack(): void {
  window.dispatchEvent(new PopStateEvent("popstate"));
}

describe("overlay-history", () => {
  it("closes the top overlay on Back without a further history.back()", () => {
    const close = vi.fn();
    const cleanup = pushOverlayEntry(close);

    fireBack(); // user presses Back → close the overlay, stay on the page
    expect(close).toHaveBeenCalledTimes(1);

    // The sentinel was consumed by the Back, so cleanup must NOT rewind again.
    const backSpy = vi.spyOn(window.history, "back");
    cleanup();
    expect(backSpy).not.toHaveBeenCalled();
  });

  it("retires the sentinel with one silent history.back() on Esc/scrim close", () => {
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const close = vi.fn();
    const cleanup = pushOverlayEntry(close);

    cleanup(); // closed via Esc/scrim/X — remove our pushed entry
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled(); // we didn't fire our own onClose
  });

  it("peels stacked overlays LIFO — Back closes the topmost first", () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    pushOverlayEntry(closeA);
    pushOverlayEntry(closeB);

    fireBack();
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();

    fireBack();
    expect(closeA).toHaveBeenCalledTimes(1);
  });

  it("does not rewind when a real navigation buried the sentinel", () => {
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const close = vi.fn();
    const cleanup = pushOverlayEntry(close);

    // A real navigation to another URL happens while the overlay is open.
    window.history.pushState({ key: "next" }, "", "/elsewhere");
    cleanup(); // overlay unmounts on the new page — must NOT back() (would undo nav)
    expect(backSpy).not.toHaveBeenCalled();
  });

  it("does not rewind when the live entry is not THIS cleanup's sentinel (remount / raced retire)", () => {
    // The dialog-cancel "bounce off the sheet" regression: a setup→cleanup→setup
    // remount (React StrictMode / Offscreen / Fast Refresh) or a raced double-retire
    // leaves the browser sitting on a DIFFERENT (same-URL) entry than the one this
    // cleanup means to retire. The href guard passes (same URL), so a blind
    // `history.back()` rewinds a REAL entry and navigates the user off the page.
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const cleanupA = pushOverlayEntry(vi.fn()); // sentinel A (folioOverlay = 1)
    const cleanupB = pushOverlayEntry(vi.fn()); // sentinel B is now the live entry

    // Retiring A while B is the live entry must NO-OP: A's entry is buried under B,
    // so a back() here would rewind B (a live entry), not remove A. The id guard
    // detects the mismatch (live folioOverlay is B's, not A's) and stays put.
    cleanupA();
    expect(backSpy).not.toHaveBeenCalled();

    // Retiring the LIVE sentinel B still rewinds exactly once — the normal close.
    cleanupB();
    expect(backSpy).toHaveBeenCalledTimes(1);
  });
});
