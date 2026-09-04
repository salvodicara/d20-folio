import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRID,
  cellCenterPx,
  cellToPx,
  cellsRect,
  feetToMetres,
  fitViewport,
  groundOf,
  pxToCell,
  rulerFor,
  screenToImage,
  zoomAt,
} from "@/features/play/map/geometry";

const ground = groundOf({
  path: "campaigns/c/maps/m.jpeg",
  url: "https://example.test/m.jpeg",
  width: 2400,
  height: 1600,
  cellPx: 80,
  origin: { x: 12, y: -8 },
  bytes: 1,
});

describe("map geometry — cells ⇄ image pixels", () => {
  it("a missing background still yields a default grid to place tokens on", () => {
    const empty = groundOf(null);
    expect(empty.url).toBeNull();
    expect(empty.cellPx).toBe(DEFAULT_GRID.cellPx);
    expect(empty.width).toBe(DEFAULT_GRID.columns * DEFAULT_GRID.cellPx);
  });

  it("cellToPx honours the origin offset; pxToCell snaps back, grid lines included", () => {
    expect(cellToPx(ground, { x: 0, y: 0 })).toEqual({ x: 12, y: -8 });
    expect(cellToPx(ground, { x: 3, y: 2 })).toEqual({ x: 252, y: 152 });
    expect(cellCenterPx(ground, { x: 3, y: 2 })).toEqual({ x: 292, y: 192 });
    expect(pxToCell(ground, { x: 252, y: 152 })).toEqual({ x: 3, y: 2 });
    expect(pxToCell(ground, { x: 331.9, y: 231.9 })).toEqual({ x: 3, y: 2 });
    expect(pxToCell(ground, { x: 332, y: 232 })).toEqual({ x: 4, y: 3 });
    expect(pxToCell(ground, { x: 0, y: 0 })).toEqual({ x: -1, y: 0 });
  });

  it("cellsRect normalises any two corners into a positive, inclusive rectangle", () => {
    expect(cellsRect({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5, w: 1, h: 1 });
    expect(cellsRect({ x: 5, y: 2 }, { x: 1, y: 6 })).toEqual({ x: 1, y: 2, w: 5, h: 5 });
  });
});

describe("map geometry — the drag ruler", () => {
  it("measures chessboard cells and feet, and tones by the mover's budget", () => {
    const budget = { remainingFt: 20, speedFt: 30 };
    expect(rulerFor({ x: 0, y: 0 }, { x: 3, y: 4 }, budget)).toEqual({
      cells: 4,
      feet: 20,
      tone: "ok",
    });
    expect(rulerFor({ x: 0, y: 0 }, { x: 5, y: 0 }, budget).tone).toBe("dash");
    expect(rulerFor({ x: 0, y: 0 }, { x: 10, y: 0 }, budget).tone).toBe("dash");
    expect(rulerFor({ x: 0, y: 0 }, { x: 11, y: 0 }, budget).tone).toBe("over");
  });

  it("a placement (no budget) is always ok", () => {
    expect(rulerFor({ x: 0, y: 0 }, { x: 40, y: 40 }, null).tone).toBe("ok");
  });

  it("converts feet to metres at 1,5 m per 5 ft", () => {
    expect(feetToMetres(5)).toBe(1.5);
    expect(feetToMetres(30)).toBe(9);
    expect(feetToMetres(25)).toBe(7.5);
  });
});

describe("map geometry — the viewport", () => {
  it("fits the ground into the host, centred", () => {
    const view = fitViewport(ground, 1200, 1000);
    expect(view.scale).toBeCloseTo(0.5);
    expect(view.offset).toEqual({ x: 0, y: 100 });
  });

  it("zooms around the anchor: the image point under the cursor stays put", () => {
    const view = fitViewport(ground, 1200, 1000);
    const anchor = { x: 300, y: 400 };
    const before = screenToImage(view, anchor);
    const zoomed = zoomAt(view, anchor, 1.5);
    expect(zoomed.scale).toBeCloseTo(0.75);
    const after = screenToImage(zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps the scale", () => {
    const view = fitViewport(ground, 1200, 1000);
    expect(zoomAt(view, { x: 0, y: 0 }, 1000).scale).toBe(6);
    expect(zoomAt(view, { x: 0, y: 0 }, 0.0001).scale).toBe(0.1);
  });
});
