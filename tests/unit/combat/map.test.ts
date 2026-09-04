import { describe, expect, it } from "vitest";
import {
  FOG_RECT_CAP,
  MAX_IMAGE_PX,
  cellUnderFog,
  hideRect,
  isMapBackground,
  isMapGrid,
  isMapRect,
  rectContains,
  rectIntersects,
  revealRect,
  subtractRect,
} from "@/lib/combat/map";
import type { MapBackground, MapRect } from "@/lib/combat/types";

const r = (x: number, y: number, w: number, h: number): MapRect => ({ x, y, w, h });

/** A fog result asserted present (test-only invariant). */
function must(value: readonly MapRect[] | null): readonly MapRect[] {
  if (value === null) throw new Error("expected a rectangle list");
  return value;
}

/** The set of cells a list of rectangles covers — the oracle every geometry case is checked
 *  against, so the tests pin the MEANING of a difference, not one particular decomposition. */
function cells(rects: readonly MapRect[]): Set<string> {
  const out = new Set<string>();
  for (const rect of rects)
    for (let x = rect.x; x < rect.x + rect.w; x += 1)
      for (let y = rect.y; y < rect.y + rect.h; y += 1) out.add(`${x},${y}`);
  return out;
}

const BACKGROUND: MapBackground = {
  path: "campaigns/c1/maps/m1.jpeg",
  url: "https://example.test/m1.jpeg?token=x",
  width: 3000,
  height: 2000,
  cellPx: 100,
  origin: { x: 0, y: 0 },
  bytes: 1_234_567,
};

describe("map — rectangle validators", () => {
  it("accepts integer rectangles of positive size within the coordinate limit", () => {
    expect(isMapRect(r(0, 0, 1, 1))).toBe(true);
    expect(isMapRect(r(-10_000, 10_000, 10_000, 1))).toBe(true);
  });

  it("rejects fractions, NaN, zero or negative sizes, out-of-range coordinates, non-objects", () => {
    expect(isMapRect(r(0.5, 0, 1, 1))).toBe(false);
    expect(isMapRect(r(Number.NaN, 0, 1, 1))).toBe(false);
    expect(isMapRect(r(0, 0, 0, 1))).toBe(false);
    expect(isMapRect(r(0, 0, 1, -1))).toBe(false);
    expect(isMapRect(r(10_001, 0, 1, 1))).toBe(false);
    expect(isMapRect(r(0, 0, 10_001, 1))).toBe(false);
    expect(isMapRect(null)).toBe(false);
    expect(isMapRect("rect")).toBe(false);
  });

  it("accepts a well-formed background and rejects every malformed number", () => {
    expect(isMapBackground(BACKGROUND)).toBe(true);
    expect(isMapBackground({ ...BACKGROUND, origin: { x: -40, y: 12 } })).toBe(true);
    expect(isMapBackground({ ...BACKGROUND, cellPx: 7 })).toBe(false);
    expect(isMapBackground({ ...BACKGROUND, cellPx: 100.5 })).toBe(false);
    expect(isMapBackground({ ...BACKGROUND, width: 99 })).toBe(false);
    expect(isMapBackground({ ...BACKGROUND, height: Number.POSITIVE_INFINITY })).toBe(
      false
    );
    expect(isMapBackground({ ...BACKGROUND, bytes: -1 })).toBe(false);
    expect(isMapBackground({ ...BACKGROUND, origin: { x: 0.5, y: 0 } })).toBe(false);
    expect(isMapBackground({ ...BACKGROUND, path: "" })).toBe(false);
    expect(isMapBackground({ ...BACKGROUND, url: "" })).toBe(false);
    expect(isMapBackground(null)).toBe(false);
  });

  it("bounds the image and cell sizes above as well as below", () => {
    expect(
      isMapGrid({ width: MAX_IMAGE_PX, height: 100, cellPx: 100, origin: { x: 0, y: 0 } })
    ).toBe(true);
    expect(
      isMapGrid({
        width: MAX_IMAGE_PX + 1,
        height: 100,
        cellPx: 100,
        origin: { x: 0, y: 0 },
      })
    ).toBe(false);
    expect(
      isMapGrid({ width: 1e15, height: 1e15, cellPx: 1e14, origin: { x: 0, y: 0 } })
    ).toBe(false);
    expect(
      isMapGrid({
        width: 100,
        height: 100,
        cellPx: 100,
        origin: { x: -MAX_IMAGE_PX - 1, y: 0 },
      })
    ).toBe(false);
    expect(isMapBackground({ ...BACKGROUND, width: MAX_IMAGE_PX + 1 })).toBe(false);
  });
});

describe("map — subtractRect against a cell-set oracle over 2,000 seeded cases", () => {
  it("always equals the set difference, in at most four valid, pairwise-disjoint pieces", () => {
    let seed = 12345;
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    const int = (min: number, max: number) => min + (next() % (max - min + 1));
    for (let i = 0; i < 2_000; i += 1) {
      const a = r(int(-5, 5), int(-5, 5), int(1, 6), int(1, 6));
      const b = r(int(-5, 5), int(-5, 5), int(1, 6), int(1, 6));
      const pieces = subtractRect(a, b);
      expect(pieces.length).toBeLessThanOrEqual(4);
      const expected = cells([a]);
      for (const cell of cells([b])) expected.delete(cell);
      expect(cells(pieces)).toEqual(expected);
      let total = 0;
      for (const piece of pieces) {
        expect(isMapRect(piece)).toBe(true);
        total += piece.w * piece.h;
      }
      expect(total).toBe(expected.size); // disjoint: the areas add up to the set's size
    }
  });
});

describe("map — rectangle geometry", () => {
  it("contains and intersects", () => {
    expect(rectContains(r(0, 0, 4, 4), r(1, 1, 2, 2))).toBe(true);
    expect(rectContains(r(0, 0, 4, 4), r(0, 0, 4, 4))).toBe(true);
    expect(rectContains(r(0, 0, 4, 4), r(3, 3, 2, 2))).toBe(false);
    expect(rectIntersects(r(0, 0, 4, 4), r(3, 3, 2, 2))).toBe(true);
    expect(rectIntersects(r(0, 0, 4, 4), r(4, 0, 2, 2))).toBe(false); // edge-adjacent, no cell shared
  });

  it.each([
    ["disjoint", r(0, 0, 2, 2), r(5, 5, 2, 2)],
    ["identical", r(0, 0, 3, 3), r(0, 0, 3, 3)],
    ["b covers a", r(1, 1, 2, 2), r(0, 0, 4, 4)],
    ["b inside a (a hole)", r(0, 0, 5, 5), r(2, 2, 1, 1)],
    ["overlap on the left", r(2, 0, 4, 4), r(0, 1, 3, 2)],
    ["overlap on the right", r(0, 0, 4, 4), r(3, 1, 3, 2)],
    ["overlap on top", r(0, 2, 4, 4), r(1, 0, 2, 3)],
    ["overlap at the bottom", r(0, 0, 4, 4), r(1, 3, 2, 3)],
    ["a vertical strip through a", r(0, 0, 6, 3), r(2, -1, 2, 5)],
  ])(
    "subtractRect: %s equals the cell-set difference and never exceeds four pieces",
    (_, a, b) => {
      const pieces = subtractRect(a, b);
      expect(pieces.length).toBeLessThanOrEqual(4);
      const expected = cells([a]);
      for (const cell of cells([b])) expected.delete(cell);
      expect(cells(pieces)).toEqual(expected);
      for (const piece of pieces) expect(isMapRect(piece)).toBe(true);
    }
  );
});

describe("map — the fog fold", () => {
  it("reveal appends, drops a rectangle already inside another, and swallows the ones it contains", () => {
    const one = must(revealRect([], r(0, 0, 4, 4)));
    expect(one).toEqual([r(0, 0, 4, 4)]);
    expect(revealRect(one, r(1, 1, 2, 2))).toEqual([r(0, 0, 4, 4)]);
    expect(revealRect(one, r(-1, -1, 6, 6))).toEqual([r(-1, -1, 6, 6)]);
    expect(revealRect(one, r(10, 10, 1, 1))).toEqual([r(0, 0, 4, 4), r(10, 10, 1, 1)]);
  });

  it("hide subtracts from every revealed rectangle and drops empty pieces", () => {
    const revealed = [r(0, 0, 4, 4), r(10, 0, 2, 2)];
    const next = must(hideRect(revealed, r(1, 1, 20, 1)));
    const expected = cells(revealed);
    for (const cell of cells([r(1, 1, 20, 1)])) expected.delete(cell);
    expect(cells(next)).toEqual(expected);
    expect(hideRect([r(0, 0, 2, 2)], r(0, 0, 2, 2))).toEqual([]);
  });

  it("both refuse to exceed the rectangle cap", () => {
    const full = Array.from({ length: FOG_RECT_CAP }, (_, i) => r(i * 3, 0, 1, 1));
    expect(revealRect(full, r(-5, 0, 1, 1))).toBeNull();
    // A rectangle already covered by an existing one is not an addition, so it still passes.
    expect(revealRect(full, r(0, 0, 1, 1))).toBe(full);
    // A hole through every rectangle would split each in two.
    const wide = Array.from({ length: FOG_RECT_CAP }, (_, i) => r(i * 3, 0, 1, 3));
    expect(hideRect(wide, r(-5, 1, 10_000, 1))).toBeNull();
  });

  it("cellUnderFog: nothing is under fog when fog is off; revealed cells are clear when it is on", () => {
    expect(cellUnderFog({ covered: false, revealed: [] }, { x: 3, y: 3 })).toBe(false);
    const fog = { covered: true, revealed: [r(0, 0, 2, 2)] };
    expect(cellUnderFog(fog, { x: 1, y: 1 })).toBe(false);
    expect(cellUnderFog(fog, { x: 2, y: 2 })).toBe(true);
  });
});
