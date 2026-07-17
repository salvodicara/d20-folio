// @vitest-environment jsdom
/**
 * revealActiveTab — the shared ribbon anti-jump seam. It must reveal the ACTIVE tab
 * via a page-safe `scrollIntoView({ block: "nearest", inline: "nearest" })` (block
 * "nearest" = no vertical page scroll; inline "nearest" = the horizontal reveal),
 * and target ONLY the `[aria-selected="true"]` tab. jsdom stubs `scrollIntoView` to
 * a no-op, so this pins the WIRING (which node, which options); the real reveal is
 * proven in Chromium by tests/e2e/no-page-jump.spec.ts.
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
  it("scrolls a CLIPPED active tab into nearest view on both axes (page-safe options)", () => {
    // Active tab sits off the right edge of the [0,100] container.
    const container = ribbon(4, 2, [150, 200]);
    // jsdom does not define scrollIntoView — install a mock to observe the call.
    const spy = vi.fn();
    HTMLElement.prototype.scrollIntoView = spy;
    revealActiveTab(container);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    // It targeted the selected tab, not a sibling.
    expect(spy.mock.instances[0]).toBe(container.querySelector('[aria-selected="true"]'));
  });

  it("does NOT nudge an already fully-visible active tab (the member-sheet clip fix)", () => {
    const container = ribbon(4, 0, [4, 44]); // first tab, comfortably in view
    const spy = vi.fn();
    HTMLElement.prototype.scrollIntoView = spy;
    revealActiveTab(container);
    expect(spy).not.toHaveBeenCalled();
  });

  it("is a tolerant no-op with no container or no active tab", () => {
    // jsdom does not define scrollIntoView — install a mock to observe the call.
    const spy = vi.fn();
    HTMLElement.prototype.scrollIntoView = spy;
    expect(() => revealActiveTab(null)).not.toThrow();
    revealActiveTab(document.createElement("div")); // no tabs
    expect(spy).not.toHaveBeenCalled();
  });
});
