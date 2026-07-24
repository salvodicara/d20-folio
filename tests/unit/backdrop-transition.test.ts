// @vitest-environment jsdom
/**
 * The backdrop crossfade seam (src/lib/backdrop-transition.ts — the atmosphere
 * mandate). Pins the module's contract: reduced motion keeps the hard cut
 * (mutate runs, no ghost); a scene-changing swap spawns ONE fading ghost
 * painting the PRE-swap scene + the `data-bg-swap` z-plane drop, torn down at
 * fade end; an unmount+mount pair in one task coalesces into ONE ghost showing
 * the pre-navigation scene (never the intermediate default); a scene-identical
 * swap spawns nothing. jsdom has no real pseudo-element styles, so the painter
 * read is stubbed via getComputedStyle — the fade itself is verified
 * frame-by-frame in real Chromium (rule 15), this pins the orchestration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { transitionBackdrop } from "@/lib/backdrop-transition";

/** The mutable fake painter state the stubbed getComputedStyle serves. */
const painter = {
  backgroundImage: 'url("http://x/study.webp")',
  backgroundPosition: "50% 0%",
  transformOrigin: "50% 0%",
  transform: "none",
  filter: "none",
  maskImage: "none",
  opacity: "0.9",
};

function stubPainterRead(): void {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    (el: Element, pseudo?: string | null) => {
      if (el === document.body && pseudo === "::after") {
        return { ...painter } as unknown as CSSStyleDeclaration;
      }
      return real(el);
    }
  );
}

const ghost = () => document.querySelector<HTMLDivElement>(".bg-ghost");
const drainMicrotasks = async () => {
  await Promise.resolve();
};

describe("transitionBackdrop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubPainterRead();
    document.documentElement.dataset.motion = "auto";
    painter.backgroundImage = 'url("http://x/study.webp")';
  });

  afterEach(() => {
    // Settle any in-flight fade so module state never leaks across tests.
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete document.documentElement.dataset.motion;
  });

  it("reduced motion: mutates synchronously with no ghost and no z-plane drop", async () => {
    document.documentElement.dataset.motion = "reduced";
    const mutate = vi.fn(() => {
      painter.backgroundImage = 'url("http://x/library.webp")';
    });
    transitionBackdrop(mutate);
    expect(mutate).toHaveBeenCalledOnce();
    await drainMicrotasks();
    expect(ghost()).toBeNull();
    expect(document.documentElement.hasAttribute("data-bg-swap")).toBe(false);
  });

  it("a scene-changing swap spawns one fading ghost of the PRE-swap scene, torn down at fade end", async () => {
    transitionBackdrop(() => {
      painter.backgroundImage = 'url("http://x/library.webp")';
    });
    await drainMicrotasks();
    const g = ghost();
    expect(g).not.toBeNull();
    // The ghost paints the OLD scene while the painter shows the new one below.
    expect(g?.style.backgroundImage).toContain("study.webp");
    expect(document.documentElement.hasAttribute("data-bg-swap")).toBe(true);
    // The fade is armed (opacity driven to 0; the transition lives in CSS).
    expect(g?.style.opacity).toBe("0");
    // Fallback timer tears the ghost down even without a transitionend event.
    vi.runAllTimers();
    expect(ghost()).toBeNull();
    expect(document.documentElement.hasAttribute("data-bg-swap")).toBe(false);
  });

  it("coalesces an unmount+mount pair into ONE ghost of the pre-navigation scene", async () => {
    // Route change: the old realm clears the var (default study would flash)…
    transitionBackdrop(() => {
      painter.backgroundImage = 'url("http://x/default.webp")';
    });
    // …and the new realm sets its plate in the same task.
    transitionBackdrop(() => {
      painter.backgroundImage = 'url("http://x/hall.webp")';
    });
    await drainMicrotasks();
    const ghosts = document.querySelectorAll(".bg-ghost");
    expect(ghosts).toHaveLength(1);
    // The ghost shows the PRE-navigation scene, never the intermediate default.
    expect(ghosts[0]?.getAttribute("style")).toContain("study.webp");
    vi.runAllTimers();
    expect(ghost()).toBeNull();
  });

  it("a scene-identical swap spawns no ghost (same plate remount)", async () => {
    transitionBackdrop(() => {
      /* var rewritten to the same resolved scene — computed state unchanged */
    });
    await drainMicrotasks();
    expect(ghost()).toBeNull();
    expect(document.documentElement.hasAttribute("data-bg-swap")).toBe(false);
  });
});
