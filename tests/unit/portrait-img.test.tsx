/**
 * PortraitImg containment + crash-guard tests.
 *
 * Owner-reported bug: after a re-crop, the cropped portrait LEAKED out of its
 * tile — spilling into the sheet top bar and taking over the whole roster card.
 *
 * Root cause: a cropped portrait is rendered as an OVER-SIZED `position:absolute`
 * `<img>`. For it to be clipped to the visible region, its positioning context
 * must be a `position:relative; overflow:hidden` box. PortraitImg used to rely
 * on the PARENT tile providing that box, but the sheet-header `.portrait` and
 * roster `.ch-portrait` tiles set `overflow:hidden` WITHOUT `position:relative`,
 * so the over-sized absolute image escaped its tile.
 *
 * The fix makes PortraitImg render its OWN `position:relative; overflow:hidden`
 * wrapper that fills the parent, so the crop is self-contained regardless of the
 * parent's CSS. These tests lock that contract (the E2E in
 * tests/e2e/portrait-crop.spec.ts proves the visible behaviour in a real
 * browser; this pins the structural invariant + the poison-crop fallback).
 *
 * Second owner-reported bug (the same family): an UNCROPPED portrait framed
 * DIFFERENTLY across surfaces — well in the roster card, zoomed-out in the hero
 * seal. Root cause: the no-crop path used a bare `<img h-full w-full>` whose
 * `height:100%` is sized inconsistently by the parent — in a grid `place-items:
 * center` tile the replaced image keeps its intrinsic 2:3 box (the square clips a
 * slice); in a flex `align-items: center` tile it collapses to a square. So the no
 * crop path now uses the SAME self-owned fill wrapper + an absolutely-positioned
 * `object-cover` image, biased toward the top so the face stays in view — framing
 * identically on every surface regardless of the parent's display type.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { PortraitImg } from "@/components/shared/PortraitImg";
import { __resetPortraitCache } from "@/lib/portrait-cache";
import type { PortraitCrop } from "@/types/character";

const VALID_CROP: PortraitCrop = { x: 20, y: 20, width: 40, height: 40 };

// The loaded-URL cache is module-level and survives across tests; reset it so
// each test starts from a cold cache.
beforeEach(() => {
  __resetPortraitCache();
});

describe("PortraitImg — no-crop fallback (cross-surface framing consistency)", () => {
  it("renders the SAME self-owned fill wrapper as the crop path so framing can't depend on the parent's display", () => {
    const { container } = render(<PortraitImg src="x.jpg" crop={null} alt="hero" />);
    // The wrapper is the fix for the roster-vs-seal inconsistency: a block box that
    // fills any definite-size parent regardless of grid/flex, with the image
    // object-covering THAT box (not the parent directly).
    const wrapper = container.querySelector("span");
    expect(wrapper, "the uncropped path must own the same fill wrapper").not.toBeNull();
    expect(wrapper?.style.position).toBe("relative");
    expect(wrapper?.style.overflow).toBe("hidden");
    expect(wrapper?.style.display).toBe("block");
    expect(wrapper?.style.width).toBe("100%");
    expect(wrapper?.style.height).toBe("100%");

    const img = wrapper?.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveClass("object-cover");
    // Absolutely fills the wrapper (NOT a bare `h-full w-full` the parent sizes).
    expect(img?.style.position).toBe("absolute");
    expect(img?.style.width).toBe("100%");
    expect(img?.style.height).toBe("100%");
    // Biased toward the top so an uncropped full-figure portrait keeps the FACE.
    expect(img?.style.objectPosition).toBe("50% 22%");
    // It is NOT over-sized like the crop path (that would clip, not cover).
    expect(img?.style.width).not.toBe("250%");
  });

  it("forwards a custom className onto the image on the fallback path", () => {
    const { container } = render(
      <PortraitImg src="x.jpg" crop={null} alt="hero" className="rounded-xl" />
    );
    expect(container.querySelector("img")).toHaveClass("rounded-xl");
  });
});

describe("PortraitImg — cropped path (leak containment)", () => {
  it("wraps the cropped image in a self-owned relative + overflow-hidden clip box", () => {
    const { container } = render(
      <PortraitImg src="x.jpg" crop={VALID_CROP} alt="hero" />
    );
    const wrapper = container.querySelector("span");
    expect(wrapper, "cropped portraits must own a wrapper").not.toBeNull();
    // The wrapper is the clipping context that prevents the over-sized absolute
    // image from leaking into the top bar / over the roster card.
    expect(wrapper?.style.position).toBe("relative");
    expect(wrapper?.style.overflow).toBe("hidden");
    // and it fills the parent tile (so the crop region scales to the tile)
    expect(wrapper?.style.width).toBe("100%");
    expect(wrapper?.style.height).toBe("100%");
    // `display:block` is load-bearing: a bare <span> is inline and IGNORES
    // width/height:100%, collapsing to 0×0 (the campaign-banner-invisible bug — the
    // image fetched but rendered at zero size) in any parent that didn't blockify it.
    expect(wrapper?.style.display).toBe("block");
  });

  it("renders the image as an over-sized absolute element INSIDE the clip box", () => {
    const { container } = render(
      <PortraitImg src="x.jpg" crop={VALID_CROP} alt="hero" />
    );
    const wrapper = container.querySelector("span");
    const img = wrapper?.querySelector("img");
    expect(img, "the image must live inside the clip box").not.toBeNull();
    expect(img?.style.position).toBe("absolute");
    // crop.width=40 → image is 250% wide (100/40*100). The clip box hides the rest.
    expect(img?.style.width).toBe("250%");
    expect(img?.style.height).toBe("250%");
    // object-fit:COVER (single uniform scale, never the old `fill` that stretched a
    // mismatched-aspect crop), positioned on the crop focal (20+40/2 = 40% both axes).
    expect(img?.style.objectFit).toBe("cover");
    expect(img?.style.objectPosition).toBe("40% 40%");
  });

  it("renders an OLD 3:1 crop with a UNIFORM cover scale (no stretch in the 16:9 card)", () => {
    // The exact live-data shape the migration targets: a pre-16:9 banner crop whose
    // pixel-aspect (~3:1) differs from the 16:9 card. The old `object-fit:fill`
    // stretched it horizontally; `cover` is a SINGLE scale, so it can never distort.
    const OLD_3x1: PortraitCrop = { x: 0, y: 33, width: 100, height: 34 };
    const { container } = render(<PortraitImg src="banner.jpg" crop={OLD_3x1} alt="" />);
    const img = container.querySelector("img");
    expect(img?.style.objectFit).toBe("cover");
    // Focal = (0+100/2, 33+34/2) = (50%, 50%) → centred on the crop, undistorted.
    expect(img?.style.objectPosition).toBe("50% 50%");
  });
});

describe("PortraitImg — no-flash remount cache (navigation reload fix)", () => {
  it("renders a never-seen URL as async + lazy (cold cache)", () => {
    const { container } = render(<PortraitImg src="cold.jpg" crop={null} alt="hero" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("decoding")).toBe("async");
    expect(img?.getAttribute("loading")).toBe("lazy");
  });

  it("renders an already-painted URL as sync + eager so a remount shows it immediately", () => {
    // First mount: simulate the image painting (onLoad fires) → URL is recorded.
    const first = render(<PortraitImg src="warm.jpg" crop={null} alt="hero" />);
    const firstImg = first.container.querySelector("img");
    expect(firstImg).not.toBeNull();
    if (firstImg) fireEvent.load(firstImg);
    first.unmount();

    // Remount (e.g. navigating back to the roster): the warm URL paints
    // synchronously with no lazy defer — no fallback flash.
    const { container } = render(<PortraitImg src="warm.jpg" crop={null} alt="hero" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("decoding")).toBe("sync");
    expect(img?.getAttribute("loading")).toBe("eager");
  });

  it("keys the cache by URL — a different src stays cold even after another warmed", () => {
    const first = render(<PortraitImg src="a.jpg" crop={null} alt="hero" />);
    const firstImg = first.container.querySelector("img");
    if (firstImg) fireEvent.load(firstImg);
    first.unmount();

    const { container } = render(<PortraitImg src="b.jpg" crop={null} alt="hero" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("decoding")).toBe("async");
    expect(img?.getAttribute("loading")).toBe("lazy");
  });

  it("warms the cache on the cropped path too (onLoad records the URL)", () => {
    const first = render(<PortraitImg src="crop.jpg" crop={VALID_CROP} alt="hero" />);
    const firstImg = first.container.querySelector("img");
    expect(firstImg).not.toBeNull();
    if (firstImg) fireEvent.load(firstImg);
    first.unmount();

    const { container } = render(
      <PortraitImg src="crop.jpg" crop={VALID_CROP} alt="hero" />
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("decoding")).toBe("sync");
    // crop math preserved on the warm path
    expect(img?.style.position).toBe("absolute");
    expect(img?.style.width).toBe("250%");
  });
});

describe("PortraitImg — poison-crop defence in depth", () => {
  it.each<[string, unknown]>([
    ["zero-area", { x: 0, y: 0, width: 0, height: 0 }],
    ["NaN", { x: NaN, y: NaN, width: NaN, height: NaN }],
    ["Infinity", { x: 0, y: 0, width: Infinity, height: Infinity }],
    ["out-of-range origin", { x: 100, y: 100, width: 50, height: 50 }],
  ])("falls back to object-cover (no broken CSS) for a %s crop", (_label, crop) => {
    const { container } = render(
      // poisoned values can reach render from old documents written before the
      // validator existed; PortraitImg re-validates at the render boundary.
      <PortraitImg src="x.jpg" crop={crop as PortraitCrop} alt="hero" />
    );
    const img = container.querySelector("img");
    expect(img).toHaveClass("object-cover");
    // no NaN/Infinity leaks into inline width/height
    expect(img?.style.width ?? "").not.toContain("NaN");
    expect(img?.style.width ?? "").not.toContain("Infinity");
    // and crucially: it object-COVERS its box (width 100%), not the over-sized
    // 250%-style crop image that leaked. The fill wrapper clips, the image covers.
    expect(img?.style.width).toBe("100%");
    expect(img?.style.width).not.toBe("250%");
  });
});
