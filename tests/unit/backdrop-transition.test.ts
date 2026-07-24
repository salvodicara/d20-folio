// @vitest-environment jsdom
/**
 * The backdrop crossfade seam (src/lib/backdrop-transition.ts — the atmosphere
 * mandate). Pins the module's contract: reduced motion keeps the hard cut
 * (mutate runs, no ghost); the FIRST commit (cold-load entry) spawns no ghost so
 * it never doubles the painter's own entry animation; a subsequent scene-changing
 * swap spawns ONE fading ghost painting the PRE-swap scene + the `data-bg-swap`
 * z-plane drop, torn down at fade end; an unmount+mount pair in one task coalesces
 * into ONE ghost showing the pre-navigation scene (never the intermediate
 * default); a scene-identical swap spawns nothing. jsdom has no real
 * pseudo-element styles, so the painter read is stubbed via getComputedStyle — the
 * fade itself is verified frame-by-frame in real Chromium (rule 15), this pins the
 * orchestration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { FADE_MS, END_MS } from "@/lib/backdrop-transition";

/** The mutable fake painter state the stubbed getComputedStyle serves. */
const painter = {
  backgroundImage: 'url("http://x/home.webp")',
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
  // Fresh module per test: the seam carries a one-shot `committed` flag (the
  // first-commit ghost skip), so each test starts from a clean cold-load state.
  let transitionBackdrop: (typeof import("@/lib/backdrop-transition"))["transitionBackdrop"];

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    ({ transitionBackdrop } = await import("@/lib/backdrop-transition"));
    stubPainterRead();
    document.documentElement.dataset.motion = "auto";
    painter.backgroundImage = 'url("http://x/home.webp")';
  });

  afterEach(() => {
    // Settle any in-flight fade so module state never leaks across tests.
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete document.documentElement.dataset.motion;
  });

  /**
   * Model cold load: the app's first backdrop commit (a realm route mounting on a
   * fresh page). It skips the crossfade — asserted here — so every helper caller
   * below then tests a genuine route-TO-route change.
   */
  async function commitInitial(): Promise<void> {
    transitionBackdrop(() => {
      painter.backgroundImage = 'url("http://x/study.webp")';
    });
    await drainMicrotasks();
    expect(ghost()).toBeNull();
    expect(document.documentElement.hasAttribute("data-bg-swap")).toBe(false);
  }

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

  it("the first-ever commit spawns no ghost (cold-load entry, not a crossfade)", async () => {
    // Landing directly on a realm route, body::after is mid `app-bg-fade` entry
    // animation. A crossfade ghost here would double the entrance — the seam's
    // first commit must apply the scene and let the entry animation play alone.
    transitionBackdrop(() => {
      painter.backgroundImage = 'url("http://x/study.webp")';
    });
    await drainMicrotasks();
    expect(ghost()).toBeNull();
    expect(document.documentElement.hasAttribute("data-bg-swap")).toBe(false);
  });

  it("a scene-changing swap spawns one fading ghost of the PRE-swap scene, torn down at fade end", async () => {
    await commitInitial();
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
    await commitInitial();
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
    await commitInitial();
    transitionBackdrop(() => {
      /* var rewritten to the same resolved scene — computed state unchanged */
    });
    await drainMicrotasks();
    expect(ghost()).toBeNull();
    expect(document.documentElement.hasAttribute("data-bg-swap")).toBe(false);
  });
});

describe("backdrop crossfade duration is pinned to the CSS", () => {
  it("the module's FADE_MS mirrors the .bg-ghost CSS transition, and END_MS outlasts it", () => {
    // Cross-boundary fact: the fade duration lives in CSS (`.bg-ghost { transition:
    // opacity <N>ms … }`, src/index.css) while the JS removal fallback (END_MS)
    // assumes the CSS fade is FADE_MS long. Read the CSS value verbatim (the same
    // read-the-CSS-fact pattern ornament-vocabulary.guard uses) so the two can't
    // silently drift: if either moves without the other, the ghost either lingers
    // or is torn down mid-dissolve.
    const here = dirname(fileURLToPath(import.meta.url));
    const indexCss = readFileSync(resolve(here, "../../src/index.css"), "utf8");
    const cssMs = indexCss.match(
      /\.bg-ghost\s*\{[^}]*transition:\s*opacity\s+(\d+)ms/
    )?.[1];
    expect(
      cssMs,
      "`.bg-ghost { transition: opacity <N>ms … }` not found in index.css"
    ).toBeDefined();
    expect(Number(cssMs)).toBe(FADE_MS);
    // The removal fallback must outlast the CSS fade, or the ghost is torn down mid-dissolve.
    expect(FADE_MS).toBeLessThan(END_MS);
  });
});
