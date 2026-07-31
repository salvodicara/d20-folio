// @vitest-environment jsdom
/**
 * revealActiveTab — the shared ribbon anti-jump seam. It reveals the ACTIVE tab
 * by scrolling the CONTAINER ITSELF (`scrollBy`, horizontal only, minimal
 * nearest-edge delta) — never `scrollIntoView`, which may scroll any scrollable
 * ancestor including the page (owner-grilled standard, 2026-07-31). This pins
 * the WIRING (container-only, which delta); the real behaviour is proven in
 * Chromium by tests/e2e/tab-no-jump.spec.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { revealActiveTab } from "@/hooks/useActiveTabScroll";

/** Stub an element's bounding rect (jsdom returns zeros otherwise). */
function rect(el: HTMLElement, left: number, right: number): void {
  el.getBoundingClientRect = () =>
    ({
      left,
      right,
      top: 0,
      bottom: 20,
      width: right - left,
      height: 20,
      x: left,
      y: 0,
    }) as DOMRect;
}

/** A ribbon container holding tabs; the one at `activeIndex` is aria-selected. The
 *  container spans [0,100]; the active tab is placed at `activeRect`. */
function ribbon(
  count: number,
  activeIndex: number,
  activeRect: [number, number] = [10, 40]
): HTMLElement {
  const container = document.createElement("div");
  rect(container, 0, 100);
  for (let i = 0; i < count; i++) {
    const tab = document.createElement("button");
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
    if (i === activeIndex) rect(tab, activeRect[0], activeRect[1]);
    container.appendChild(tab);
  }
  return container;
}

describe("revealActiveTab", () => {
  it("nudges a right-CLIPPED active tab by the minimal delta — container-only", () => {
    // Active tab sits off the right edge of the [0,100] container.
    const container = ribbon(4, 2, [150, 200]);
    const spy = vi.fn();
    HTMLElement.prototype.scrollBy = spy;
    const intoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = intoView;
    revealActiveTab(container);
    // The CONTAINER scrolled, by the nearest-edge delta (tab right 200 → edge 100).
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.instances[0]).toBe(container);
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ left: 100 });
    // …and NOTHING was asked to scroll ancestors.
    expect(intoView).not.toHaveBeenCalled();
  });

  it("nudges a left-CLIPPED active tab with a negative delta", () => {
    const container = ribbon(4, 1, [-30, 20]);
    const spy = vi.fn();
    HTMLElement.prototype.scrollBy = spy;
    revealActiveTab(container);
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ left: -30 });
  });

  it("does NOT nudge an already fully-visible active tab (the member-sheet clip fix)", () => {
    const container = ribbon(4, 0, [4, 44]); // first tab, comfortably in view
    const spy = vi.fn();
    HTMLElement.prototype.scrollBy = spy;
    revealActiveTab(container);
    expect(spy).not.toHaveBeenCalled();
  });

  it("is a tolerant no-op with no container or no active tab", () => {
    const spy = vi.fn();
    HTMLElement.prototype.scrollBy = spy;
    expect(() => revealActiveTab(null)).not.toThrow();
    revealActiveTab(document.createElement("div")); // no tabs
    expect(spy).not.toHaveBeenCalled();
  });
});
