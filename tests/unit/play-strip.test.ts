/**
 * The phone's slim Hit Points strip (D&D Beyond's phone header): it shows only once the
 * whole band has scrolled up out of view, never while any of it is on screen or while
 * the band is still below (a short page, a first paint). The Hit Points read as the band
 * does: green above half, amber above a quarter, red at a quarter or less.
 */
import { describe, expect, it } from "vitest";

import { hpTone, stripShown } from "@/domains/play/play-strip";

describe("stripShown", () => {
  it("shows once the band is wholly above the top of the screen", () => {
    expect(stripShown({ isIntersecting: false, bottom: -1 })).toBe(true);
    expect(stripShown({ isIntersecting: false, bottom: 0 })).toBe(true);
  });

  it("hides while any of the band is on screen", () => {
    expect(stripShown({ isIntersecting: true, bottom: 40 })).toBe(false);
    expect(stripShown({ isIntersecting: true, bottom: 900 })).toBe(false);
  });

  it("hides when the band is out of view below, not above", () => {
    expect(stripShown({ isIntersecting: false, bottom: 1200 })).toBe(false);
  });
});

describe("hpTone", () => {
  it("is ok above half, low above a quarter, bad at a quarter or less", () => {
    expect(hpTone(62, 62)).toBe("ok");
    expect(hpTone(32, 62)).toBe("ok");
    expect(hpTone(31, 62)).toBe("low");
    expect(hpTone(16, 62)).toBe("low");
    expect(hpTone(15, 62)).toBe("bad");
    expect(hpTone(0, 62)).toBe("bad");
  });

  it("reads a sheet with no maximum yet as bad, never as a division by zero", () => {
    expect(hpTone(0, 0)).toBe("bad");
  });
});
