/**
 * Portrait crop validation regression tests.
 *
 * Context: the real owner-reported bug was a LAYOUT LEAK — after a re-crop the
 * over-sized cropped image escaped its tile and spilled into the top bar / over
 * the roster card (fixed in PortraitImg by owning its own clip box; see
 * tests/unit/portrait-img.test.tsx + tests/e2e/portrait-crop.spec.ts).
 *
 * This file pins the supporting invariant: the {@link normalizePortraitCrop}
 * validator never returns an unsafe rect, so a degenerate value (NaN / zero /
 * out-of-range) can neither be persisted nor produce divide-by-zero CSS in
 * {@link cropToCssStyle}.
 *
 * NOTE on the react-easy-crop stylesheet: `src/main.tsx` imports
 * `react-easy-crop/react-easy-crop.css`, but in react-easy-crop v5 the library
 * SELF-INJECTS its stylesheet into <head> on mount, so that import is
 * belt-and-suspenders (it documents the dependency) — it is NOT the fix for any
 * crash. We still assert it is present so it isn't dropped, but it is not
 * load-bearing.
 *
 * Pure: imports only `@/lib/portrait-crop` (types + math, no Firebase) and reads
 * source files as text.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  normalizePortraitCrop,
  cropToCssStyle,
  cropToBackgroundPosition,
  cropZoomFactor,
  faceBiasedDefaultCrop,
  PORTRAIT_FACE_BIAS_Y,
} from "@/lib/portrait-crop";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

describe("normalizePortraitCrop", () => {
  it("passes a valid full-image crop through unchanged", () => {
    const crop = { x: 0, y: 0, width: 100, height: 100 };
    expect(normalizePortraitCrop(crop)).toEqual(crop);
  });

  it("passes a valid centered crop through unchanged", () => {
    const crop = { x: 25, y: 25, width: 50, height: 50 };
    expect(normalizePortraitCrop(crop)).toEqual(crop);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["a string", "nope"],
    ["an array", [0, 0, 100, 100]],
  ])("rejects non-object input: %s", (_label, value) => {
    expect(normalizePortraitCrop(value)).toBeNull();
  });

  it.each([
    ["NaN width", { x: 0, y: 0, width: NaN, height: 100 }],
    ["NaN height", { x: 0, y: 0, width: 100, height: NaN }],
    ["NaN x", { x: NaN, y: 0, width: 100, height: 100 }],
    ["NaN y", { x: 0, y: NaN, width: 100, height: 100 }],
    ["Infinity width", { x: 0, y: 0, width: Infinity, height: 100 }],
    ["-Infinity x", { x: -Infinity, y: 0, width: 100, height: 100 }],
  ])("rejects non-finite values → null: %s", (_label, value) => {
    expect(normalizePortraitCrop(value)).toBeNull();
  });

  it.each([
    ["zero width", { x: 0, y: 0, width: 0, height: 100 }],
    ["zero height", { x: 0, y: 0, width: 100, height: 0 }],
    ["negative width", { x: 0, y: 0, width: -10, height: 100 }],
    ["negative height", { x: 0, y: 0, width: 100, height: -10 }],
  ])("rejects degenerate area → null: %s", (_label, value) => {
    expect(normalizePortraitCrop(value)).toBeNull();
  });

  it.each([
    ["string fields", { x: "0", y: "0", width: "100", height: "100" }],
    ["missing width", { x: 0, y: 0, height: 100 }],
    ["empty object", {}],
  ])("rejects malformed shapes → null: %s", (_label, value) => {
    expect(normalizePortraitCrop(value)).toBeNull();
  });

  it("clamps a negative origin into 0–100 range", () => {
    const result = normalizePortraitCrop({ x: -10, y: -5, width: 50, height: 50 });
    expect(result).toEqual({ x: 0, y: 0, width: 50, height: 50 });
  });

  it("clamps width/height so the rect never extends past the image edge", () => {
    // x=80 leaves only 20% to the right; a 50%-wide rect must clamp to 20.
    const result = normalizePortraitCrop({ x: 80, y: 70, width: 50, height: 60 });
    expect(result).toEqual({ x: 80, y: 70, width: 20, height: 30 });
  });

  it("rejects a rect whose origin sits on the far edge (clamps to zero area)", () => {
    // x=100 leaves no horizontal room → width clamps to 0 → unusable → null.
    expect(normalizePortraitCrop({ x: 100, y: 0, width: 50, height: 50 })).toBeNull();
    expect(normalizePortraitCrop({ x: 0, y: 100, width: 50, height: 50 })).toBeNull();
  });

  it("clamps an over-100 origin down to 100 (then rejects for zero area)", () => {
    expect(normalizePortraitCrop({ x: 150, y: 0, width: 50, height: 50 })).toBeNull();
  });

  it("never produces output that would divide-by-zero in cropToCssStyle", () => {
    const candidates: unknown[] = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: -10, y: 200, width: 30, height: 1000 },
      { x: 99.9, y: 0, width: 50, height: 50 },
      { x: 0.0001, y: 0.0001, width: 0.0001, height: 0.0001 },
    ];
    for (const c of candidates) {
      const safe = normalizePortraitCrop(c);
      if (safe === null) continue;
      // width/height are strictly positive → CSS math is finite.
      expect(safe.width).toBeGreaterThan(0);
      expect(safe.height).toBeGreaterThan(0);
      const style = cropToCssStyle(safe);
      for (const v of [style.width, style.height, style.left, style.top]) {
        expect(String(v)).not.toContain("NaN");
        expect(String(v)).not.toContain("Infinity");
      }
    }
  });
});

describe("cropToCssStyle — UNIFORM cover-fit (the no-stretch contract)", () => {
  // The bug that bit us: the card is a fixed 16:9 box, but a LIVE pre-migration
  // banner crop is ~3:1. The old `object-fit:fill` stretched a mismatched-aspect
  // crop horizontally; `cover` is a single uniform scale, so it can NEVER distort —
  // whatever the crop's aspect. These tests pin that across the three real shapes.

  it("ALWAYS uses object-fit:cover, never the old `fill` (the no-stretch invariant)", () => {
    for (const crop of [
      { x: 0, y: 33, width: 100, height: 34 }, // old 3:1 banner
      { x: 10, y: 10, width: 80, height: 45 }, // fresh 16:9 banner
      { x: 25, y: 20, width: 50, height: 50 }, // 1:1 portrait
      { x: 60, y: 10, width: 30, height: 20 }, // off-centre edge crop
    ]) {
      expect(cropToCssStyle(crop).objectFit).toBe("cover");
    }
  });

  it("renders an OLD 3:1 crop undistorted: cover + focal at the rect centre", () => {
    // 3:1 crop in the 16:9 card — the migration's target. Cover-centres on the focal
    // (0+100/2, 33+34/2) = (50%, 50%) and keeps the over-sized box math intact.
    const style = cropToCssStyle({ x: 0, y: 33, width: 100, height: 34 });
    expect(style.objectFit).toBe("cover");
    expect(style.objectPosition).toBe("50% 50%");
    expect(style.width).toBe("100%"); // 100/100 * 100
    expect(style.height).toBe(`${(100 / 34) * 100}%`); // over-sized vertically
    expect(style.top).toBe(`${-(33 / 34) * 100}%`);
  });

  it("renders a fresh 16:9 crop EXACTLY (cover with zero overflow == the crop)", () => {
    // A crop whose pixel-aspect matches the 16:9 card has no cover overflow, so cover
    // shows precisely the rect — identical framing to the old fill path, no stretch.
    const crop = { x: 10, y: 20, width: 80, height: 45 };
    const style = cropToCssStyle(crop);
    expect(style.objectFit).toBe("cover");
    expect(style.objectPosition).toBe("50% 42.5%"); // (10+40, 20+22.5)
    expect(style.width).toBe(`${(100 / 80) * 100}%`);
    expect(style.height).toBe(`${(100 / 45) * 100}%`);
    expect(style.left).toBe(`${-(10 / 80) * 100}%`);
    expect(style.top).toBe(`${-(20 / 45) * 100}%`);
  });

  it("renders a 1:1 portrait crop unchanged in the square frame (focal-centred cover)", () => {
    const crop = { x: 25, y: 20, width: 50, height: 50 };
    const style = cropToCssStyle(crop);
    expect(style.objectFit).toBe("cover");
    expect(style.objectPosition).toBe("50% 45%"); // (25+25, 20+25)
    expect(style.width).toBe("200%");
    expect(style.height).toBe("200%");
  });

  it("positions the crop on the SAME focal the backdrop uses (one focal everywhere)", () => {
    // object-position (card) and background-position (backdrop) must agree, so the
    // card and the immersive backdrop centre on the identical point.
    for (const crop of [
      { x: 0, y: 33, width: 100, height: 34 },
      { x: 60, y: 10, width: 30, height: 20 },
    ]) {
      expect(cropToCssStyle(crop).objectPosition).toBe(cropToBackgroundPosition(crop));
    }
  });
});

describe("cropToBackgroundPosition — the campaign crop focal drives the cover backdrop", () => {
  it("maps the crop-rect centre to a `x% y%` background-position", () => {
    // A 16:9 crop sitting low-right: centre is (20+40/2)=40%, (50+22.5/2)=61.25%.
    expect(cropToBackgroundPosition({ x: 20, y: 50, width: 40, height: 22.5 })).toBe(
      "40% 61.25%"
    );
  });

  it("centres a full-image crop (the default-asset equivalent)", () => {
    expect(cropToBackgroundPosition({ x: 0, y: 0, width: 100, height: 100 })).toBe(
      "50% 50%"
    );
  });

  it("returns null for an absent/degenerate crop so callers keep the default position", () => {
    expect(cropToBackgroundPosition(null)).toBeNull();
    // Reinterpreting an OLD 3:1 crop at 16:9 must not crash — the focal survives.
    expect(cropToBackgroundPosition({ x: 0, y: 33, width: 100, height: 34 })).toBe(
      "50% 50%"
    );
    // Degenerate rects fall through normalizePortraitCrop → null (no NaN position).
    expect(cropToBackgroundPosition({ x: 0, y: 0, width: 0, height: 0 })).toBeNull();
  });
});

describe("cropZoomFactor — the crop zoom drives the scaled cover backdrop", () => {
  it("is 1 for a maximal (un-zoomed) crop so the default backdrop is untouched", () => {
    // One axis fills the image at zoom 1 → factor 1 → `scale(1)` no-op.
    expect(cropZoomFactor({ x: 0, y: 0, width: 100, height: 100 })).toBe(1);
    // A maximal 16:9 crop of a taller image: full width (100), shorter height.
    expect(cropZoomFactor({ x: 0, y: 21.875, width: 100, height: 56.25 })).toBe(1);
  });

  it("recovers the cropper's zoom slider value (100 / max side)", () => {
    // The dev-fixture TIGHT crop {20 × 11.25} was produced at ~5× zoom.
    expect(cropZoomFactor({ x: 40, y: 20, width: 20, height: 11.25 })).toBeCloseTo(5);
    // A half-size rect is a 2× zoom.
    expect(cropZoomFactor({ x: 25, y: 21.875, width: 50, height: 28.125 })).toBeCloseTo(
      2
    );
  });

  it("never zooms out and never crashes on an absent/degenerate crop", () => {
    expect(cropZoomFactor(null)).toBe(1);
    expect(cropZoomFactor({ x: 0, y: 0, width: 0, height: 0 })).toBe(1);
  });
});

describe("faceBiasedDefaultCrop — crop-modal default frames the FACE (roster-vs-circle consistency)", () => {
  // Owner-reported: an uncropped imported portrait framed nicely on the surfaces
  // (object-position 50%/22%), but the crop modal opened the circle CENTRED — on
  // the waist of a full-figure portrait. The default crop now mirrors the display
  // bias so the circle opens on the SAME region the surfaces already show.

  it("biases a tall full-figure portrait toward the top by PORTRAIT_FACE_BIAS_Y", () => {
    // 1000×1500 (2:3). Square slice is full width; height = 1000/1500 = 66.667%.
    const crop = faceBiasedDefaultCrop(1000, 1500);
    expect(crop.x).toBe(0);
    expect(crop.width).toBe(100);
    expect(crop.height).toBeCloseTo((1000 / 1500) * 100, 6);
    // y = bias × leftover vertical space, NOT the centred (1/2 × leftover).
    expect(crop.y).toBeCloseTo(PORTRAIT_FACE_BIAS_Y * (100 - (1000 / 1500) * 100), 6);
    // And crucially it sits ABOVE centre (a centred slice would clip the face).
    const centredY = (100 - (1000 / 1500) * 100) / 2;
    expect(crop.y).toBeLessThan(centredY);
  });

  it("matches PortraitImg's object-position framing for the same image", () => {
    // The display path shows the slice at `object-position: 50% 22%`; the crop
    // default must place the SAME-height slice at the same 22% of the leftover —
    // so confirming an untouched crop reproduces exactly what was on screen.
    const W = 800;
    const H = 1200;
    const heightPct = (W / H) * 100;
    const crop = faceBiasedDefaultCrop(W, H);
    expect(crop.y).toBeCloseTo(0.22 * (100 - heightPct), 6);
  });

  it("centres a landscape image horizontally with a full-height square slice", () => {
    // 1600×900 (wider than tall): square slice is full height, centred on X.
    const crop = faceBiasedDefaultCrop(1600, 900);
    expect(crop.y).toBe(0);
    expect(crop.height).toBe(100);
    const widthPct = (900 / 1600) * 100;
    expect(crop.width).toBeCloseTo(widthPct, 6);
    expect(crop.x).toBeCloseTo((100 - widthPct) / 2, 6);
  });

  it("returns the full image for an exact square (no bias needed)", () => {
    expect(faceBiasedDefaultCrop(500, 500)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
  });

  it.each([
    ["zero width", 0, 600],
    ["zero height", 400, 0],
    ["negative", -400, 600],
    ["NaN", NaN, 600],
  ])("falls back to the full image for a degenerate size: %s", (_label, w, h) => {
    expect(faceBiasedDefaultCrop(w, h)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("always returns a crop that survives normalizePortraitCrop (never poisons the cropper)", () => {
    const sizes: [number, number][] = [
      [1000, 1500],
      [1600, 900],
      [500, 500],
      [37, 999],
      [1024, 768],
    ];
    for (const [w, h] of sizes) {
      const crop = faceBiasedDefaultCrop(w, h);
      // The default is fed straight to react-easy-crop's initial percentages and
      // can be confirmed as-is, so it must be a valid persistable rect.
      expect(normalizePortraitCrop(crop)).not.toBeNull();
    }
  });
});

describe("react-easy-crop CSS import (belt-and-suspenders, not load-bearing)", () => {
  it("main.tsx still imports the react-easy-crop stylesheet", () => {
    // The library self-injects this CSS in v5, so the import is defensive rather
    // than the crash fix — kept (and pinned) so it isn't silently dropped.
    const main = readFileSync(resolve(root, "src/main.tsx"), "utf8");
    expect(main).toMatch(/import\s+["']react-easy-crop\/react-easy-crop\.css["']/);
  });
});
