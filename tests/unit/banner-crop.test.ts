/**
 * The campaign banner's crop on the new screen: a 16:9 frame over the picture, moved
 * by dragging and set by a zoom from 1 to 3; stored as the same % rectangle the classic
 * flow keeps (`bannerCrop`), and shown in the round crest at its focal point and zoom.
 */
import { describe, expect, it } from "vitest";

import {
  BANNER_ASPECT,
  clampZoom,
  crestImageStyle,
  cropFromView,
  panView,
  viewFromCrop,
} from "@/domains/campaign/banner-crop";

const wide = { width: 3200, height: 1200 }; // wider than 16:9
const tall = { width: 1200, height: 1600 }; // taller than 16:9

describe("the banner crop", () => {
  it("at zoom 1 the largest 16:9 rectangle, centred", () => {
    const crop = cropFromView(wide, { zoom: 1, centerX: 50, centerY: 50 });
    expect(crop.height).toBeCloseTo(100);
    expect(
      ((crop.width / 100) * wide.width) / ((crop.height / 100) * wide.height)
    ).toBeCloseTo(BANNER_ASPECT);
    expect(crop.x + crop.width / 2).toBeCloseTo(50);
    const portrait = cropFromView(tall, { zoom: 1, centerX: 50, centerY: 50 });
    expect(portrait.width).toBeCloseTo(100);
  });

  it("zoom shrinks the rectangle, and it never leaves the picture", () => {
    const crop = cropFromView(wide, { zoom: 2, centerX: 99, centerY: 1 });
    expect(crop.height).toBeCloseTo(50);
    expect(crop.x + crop.width).toBeLessThanOrEqual(100.0001);
    expect(crop.y).toBeGreaterThanOrEqual(0);
  });

  it("a saved crop opens where it was", () => {
    const view = { zoom: 1.6, centerX: 40, centerY: 55 };
    const back = viewFromCrop(wide, cropFromView(wide, view));
    expect(back.zoom).toBeCloseTo(1.6);
    expect(back.centerX).toBeCloseTo(40);
    expect(back.centerY).toBeCloseTo(55);
  });

  it("dragging right shows more of the left side", () => {
    const start = { zoom: 2, centerX: 50, centerY: 50 };
    const moved = panView(wide, start, { dx: 100, dy: 0, frameWidth: 400 });
    expect(moved.centerX).toBeLessThan(50);
    expect(moved.centerY).toBeCloseTo(50);
  });

  it("zoom stays between 1 and 3", () => {
    expect(clampZoom(0.4)).toBe(1);
    expect(clampZoom(9)).toBe(3);
  });

  it("the crest shows the crop's focal point and zoom", () => {
    const crop = cropFromView(wide, { zoom: 2, centerX: 30, centerY: 60 });
    const style = crestImageStyle(crop);
    expect(style.objectPosition).toBe(
      `${String(crop.x + crop.width / 2)}% ${String(crop.y + crop.height / 2)}%`
    );
    expect(style.transform).toBe("scale(2)");
    expect(crestImageStyle(null)).toEqual({});
  });
});
