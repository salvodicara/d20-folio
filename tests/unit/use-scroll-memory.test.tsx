/**
 * useScrollMemory — the ONE list↔detail scroll-comfort mechanism (COMPENDIUM-NAV).
 *
 * Pins: `save()` seals the container's depth and the callback ref restores it on
 * remount (Back lands exactly where the reader left the list); a `resetKey`
 * change (new result set) resets the kept depth to the top; `save()` without an
 * attached container never clobbers the kept value (the container is already
 * unmounted when a deep link swaps entries).
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScrollMemory } from "@/hooks/useScrollMemory";

const mkRect = (top: number, bottom: number): DOMRect => ({
  top,
  bottom,
  left: 0,
  right: 100,
  width: 100,
  height: bottom - top,
  x: 0,
  y: top,
  toJSON: () => ({}),
});

/** A scroll container with `.pick-row` children at the given client rects. */
function mkList(listRect: DOMRect, rowRects: DOMRect[]): HTMLDivElement {
  const list = document.createElement("div");
  vi.spyOn(list, "getBoundingClientRect").mockReturnValue(listRect);
  for (const r of rowRects) {
    const row = document.createElement("button");
    row.className = "pick-row";
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue(r);
    list.appendChild(row);
  }
  return list;
}

describe("useScrollMemory", () => {
  it("restores the saved depth when the container remounts (list → detail → Back)", () => {
    const { result } = renderHook(({ k }) => useScrollMemory(k), {
      initialProps: { k: "results-v1" },
    });

    // The list mounts and the reader scrolls deep.
    const list = document.createElement("div");
    result.current.attach(list);
    list.scrollTop = 1500;

    // Selecting an entry seals the depth, then the list unmounts (detail shows).
    result.current.save();
    result.current.attach(null);

    // Back: a FRESH container mounts — the kept depth is re-applied.
    const remounted = document.createElement("div");
    result.current.attach(remounted);
    expect(remounted.scrollTop).toBe(1500);
  });

  it("resets the depth to the top when the result set changes", () => {
    const { result, rerender } = renderHook(({ k }) => useScrollMemory(k), {
      initialProps: { k: "results-v1" },
    });

    const list = document.createElement("div");
    result.current.attach(list);
    list.scrollTop = 900;
    result.current.save();

    // A new query/facet produces a NEW result set → back to the top, live.
    rerender({ k: "results-v2" });
    expect(list.scrollTop).toBe(0);

    // …and the kept value is gone too (a later remount starts at the top).
    result.current.attach(null);
    const remounted = document.createElement("div");
    result.current.attach(remounted);
    expect(remounted.scrollTop).toBe(0);
  });

  it("row-anchored mode re-expresses the SAME top row when row geometry shifts", () => {
    const { result } = renderHook(() => useScrollMemory("k", ".pick-row"));

    // Row #1 tops the viewport (5px clipped above the fold).
    const list = mkList(mkRect(0, 400), [
      mkRect(-60, -10),
      mkRect(-5, 40),
      mkRect(45, 90),
    ]);
    result.current.attach(list);
    list.scrollTop = 999; // the raw pixel offset is NOT what must survive
    result.current.save();
    result.current.attach(null);

    // Remount: content-visibility estimates settled differently — the same
    // rows now sit 25px lower. The restore must scroll BY the difference so
    // row #1 again tops the viewport at its sealed -5px offset.
    const remounted = mkList(mkRect(0, 400), [
      mkRect(-35, 15),
      mkRect(20, 65),
      mkRect(70, 115),
    ]);
    result.current.attach(remounted);
    expect(remounted.scrollTop).toBe(25);
    result.current.attach(null); // cancel the rAF settle pass
  });

  it("save() without an attached container keeps the sealed depth intact", () => {
    const { result } = renderHook(() => useScrollMemory("k"));

    const list = document.createElement("div");
    result.current.attach(list);
    list.scrollTop = 700;
    result.current.save();
    result.current.attach(null);

    // The detail is open (no list) — a stray save must not zero the memory.
    result.current.save();

    const remounted = document.createElement("div");
    result.current.attach(remounted);
    expect(remounted.scrollTop).toBe(700);
  });
});
