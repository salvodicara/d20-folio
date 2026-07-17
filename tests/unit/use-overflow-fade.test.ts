// @vitest-environment jsdom
/**
 * overflowEdges — the pure half of the shared horizontal-overflow fade seam
 * (`useOverflowFade`), used by the cockpit TabStrip and the Compendium ribbon to
 * paint a "more this way" edge cue. jsdom reports 0 for layout metrics, so we set
 * the three inputs (`scrollWidth`/`clientWidth`/`scrollLeft`) directly and pin the
 * edge string it derives — the real fade is proven visually in Chromium.
 */
import { describe, it, expect } from "vitest";
import { overflowEdges } from "@/hooks/useOverflowFade";

/** A stub element with the three scroll metrics overflowEdges reads. */
function scroller(
  scrollWidth: number,
  clientWidth: number,
  scrollLeft: number
): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  el.scrollLeft = scrollLeft;
  return el;
}

describe("overflowEdges", () => {
  it("is empty when nothing is clipped (content fits)", () => {
    expect(overflowEdges(scroller(100, 100, 0))).toBe("");
  });

  it("fades the RIGHT edge at the start of an overflowing strip", () => {
    expect(overflowEdges(scroller(300, 100, 0))).toBe("r");
  });

  it("fades the LEFT edge at the end of an overflowing strip", () => {
    expect(overflowEdges(scroller(300, 100, 200))).toBe("l");
  });

  it("fades BOTH edges mid-scroll", () => {
    expect(overflowEdges(scroller(300, 100, 100))).toBe("lr");
  });
});
