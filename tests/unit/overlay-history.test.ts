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
import {
  pushOverlayEntry,
  retireTopOverlayThen,
  __resetOverlayHistory,
} from "@/lib/overlay-history";

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

  describe("retireTopOverlayThen — the race-free close-then-navigate hand-off", () => {
    // The mobile palette-tap bug: `history.back()` is an ASYNC traversal, so a
    // pushState issued while it is in flight gets rewound when it lands, silently
    // undoing the navigation. The callback must therefore run only once the
    // traversal's popstate has landed — never on a wall-clock guess.

    it("runs the callback only after the back() traversal lands (its popstate)", () => {
      // Mock back() so the traversal stays "in flight" until we fire the popstate.
      const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
      const close = vi.fn();
      const cleanup = pushOverlayEntry(close);

      const then = vi.fn();
      retireTopOverlayThen(then);
      expect(backSpy).toHaveBeenCalledTimes(1);
      expect(then).not.toHaveBeenCalled(); // traversal still in flight — must wait

      fireBack(); // the browser lands the programmatic traversal
      expect(then).toHaveBeenCalledTimes(1);
      // The programmatic pop is swallowed — it never closes the overlay itself
      // (the caller drives its own close).
      expect(close).not.toHaveBeenCalled();

      // The entry was retired eagerly, so the overlay's own later cleanup no-ops:
      // no second back() to rewind the navigation the callback just performed.
      cleanup();
      expect(backSpy).toHaveBeenCalledTimes(1);
    });

    it("a NEW overlay raised from the callback pushes its sentinel strictly after the traversal — the landing pop can never consume it", () => {
      // The close-then-OPEN member of the race class (palette → shortcuts sheet /
      // bug reporter): a sheet raised while the palette's retire-back() is in
      // flight pushes its sentinel just in time for the landing pop to eat it —
      // hardware Back then exits the page instead of closing the sheet. Routed
      // through the seam, the new sentinel exists only AFTER the pop landed.
      const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
      pushOverlayEntry(vi.fn()); // the palette's sentinel

      const closeSheet = vi.fn();
      const raiseSheet = vi.fn(() => pushOverlayEntry(closeSheet));
      retireTopOverlayThen(raiseSheet);
      expect(raiseSheet).not.toHaveBeenCalled(); // traversal in flight — not yet

      fireBack(); // the retirement traversal lands…
      expect(raiseSheet).toHaveBeenCalledTimes(1); // …and only now the sheet opens
      // Its sentinel survived the landing pop: the NEXT Back closes the sheet.
      fireBack();
      expect(closeSheet).toHaveBeenCalledTimes(1);
      expect(backSpy).toHaveBeenCalledTimes(1); // only the retirement rewound
    });

    it("a remounting overlay (setup→cleanup→setup) re-pushes its sentinel only after the cleanup's back() lands", () => {
      // The StrictMode / Offscreen / Fast-Refresh signature: setup₁ pushes the
      // sentinel, the immediate cleanup retires it (back() in flight), and
      // setup₂'s re-push used to land INSIDE that traversal's path — the landing
      // pop consumed the fresh sentinel, so hardware Back exited the page
      // instead of closing the overlay. The serialization invariant queues the
      // re-push behind the traversal.
      const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
      const pushSpy = vi.spyOn(window.history, "pushState");

      const cleanup1 = pushOverlayEntry(vi.fn()); // setup₁ — pushes immediately
      expect(pushSpy).toHaveBeenCalledTimes(1);
      cleanup1(); // StrictMode cleanup — retirement traversal now in flight
      expect(backSpy).toHaveBeenCalledTimes(1);

      const close2 = vi.fn();
      pushOverlayEntry(close2); // setup₂ — its push must WAIT for the landing
      expect(pushSpy).toHaveBeenCalledTimes(1); // not yet — queued

      fireBack(); // the retirement traversal lands…
      expect(pushSpy).toHaveBeenCalledTimes(2); // …and only now the sentinel exists

      fireBack(); // a USER Back now closes the remounted overlay — page intact
      expect(close2).toHaveBeenCalledTimes(1);
      expect(backSpy).toHaveBeenCalledTimes(1); // no stray extra rewind
    });

    it("runs the callback synchronously when there is no sentinel to retire", () => {
      const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
      const then = vi.fn();
      retireTopOverlayThen(then);
      expect(then).toHaveBeenCalledTimes(1);
      expect(backSpy).not.toHaveBeenCalled();
    });

    it("runs the callback synchronously when the browser is not sitting on the top sentinel", () => {
      const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
      pushOverlayEntry(vi.fn());
      // A user Back already consumed the sentinel's entry (overlay closing now).
      window.history.replaceState({ key: "base" }, "", "/base");
      const then = vi.fn();
      retireTopOverlayThen(then);
      expect(then).toHaveBeenCalledTimes(1);
      expect(backSpy).not.toHaveBeenCalled(); // nothing of ours to rewind
    });
  });
});
