/**
 * CSS crop math for portrait display — a UNIFORM (cover) reconstruction.
 *
 * Converts a PortraitCrop (percentages from react-easy-crop) to inline CSS
 * properties so the chosen region of a compressed original is shown inside a
 * fixed-aspect container (the 1:1 portrait frame, the 16:9 campaign card).
 *
 * The parent element must have `position: relative; overflow: hidden`.
 *
 * Math (container size D cancels out — works for any size):
 *   img.width  = (100 / crop.width)  * 100%   ← the over-sized box whose
 *   img.height = (100 / crop.height) * 100%      sub-rect [crop] maps to the frame
 *   img.left   = -(crop.x / crop.width)  * 100%
 *   img.top    = -(crop.y / crop.height) * 100%
 *
 * COVER, never FILL (the no-stretch contract): the image is `object-fit: cover`
 * into that over-sized box — a SINGLE uniform scale, so width/height are never
 * scaled independently and the image can NEVER stretch. `object-position` is the
 * crop's FOCAL (rect centre); a short proof that this lands the focal at the
 * frame centre for ANY crop/image — let `px = focalX/100`, `s` the cover scale:
 *   focal-x within the box = px·imgW·s − px·(imgW·s − boxW) = px·boxW
 *                          = (focalX/100)·(C_W·100/crop.width)
 *   focal-x in frame       = px·boxW + left = … = C_W/2.   (∀ s, crop, imgW) ∎
 * So when the crop's pixel-aspect EQUALS the frame's, cover has zero overflow and
 * shows EXACTLY the crop (a fresh 16:9 crop in the 16:9 card, a 1:1 portrait in
 * the 1:1 frame — pixel-identical to the old fill path). When it DIFFERS (a live
 * pre-16:9 ~3:1 crop in the 16:9 card), cover scales uniformly to fill the frame
 * and centres on the focal — undistorted, never the old horizontal stretch.
 *
 * IMPORTANT: Tailwind preflight sets `img { max-width: 100%; height: auto }`
 * which constrains absolute-positioned images. We override both with inline
 * styles to ensure the crop dimensions are respected.
 */

import type { CSSProperties } from "react";
import type { PortraitCrop } from "@/types/character";

/**
 * Vertical object-position bias (0–1) for an UNCROPPED portrait.
 *
 * An uncropped portrait is almost always a tall full-figure image with the head
 * near the top; a CENTRED square crop lands on the waist and clips the face. So
 * both the display path (PortraitImg's `object-cover` `object-position`) AND the
 * crop modal's default frame bias toward the top to keep the FACE in view. This
 * is the single source of truth shared by both so an uncropped portrait and the
 * crop circle frame the SAME region (the owner-reported roster-vs-seal / circle-
 * on-the-waist inconsistency).
 */
export const PORTRAIT_FACE_BIAS_Y = 0.22;

/**
 * The face-biased default SQUARE crop (percentages 0–100) for an image of the
 * given natural size — the region react-easy-crop should open on when there is
 * no stored crop yet, so the circle lands exactly where the surfaces already
 * frame an uncropped portrait (`object-cover` + `object-position: 50%`/
 * {@link PORTRAIT_FACE_BIAS_Y}). Returns the full image for a degenerate size.
 *
 * Geometry (square crop, aspect 1):
 *   - taller-than-wide → a full-width square slice biased toward the top;
 *   - wider-than-tall  → a full-height square slice centred horizontally.
 */
export function faceBiasedDefaultCrop(
  naturalWidth: number,
  naturalHeight: number
): PortraitCrop {
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }
  if (naturalHeight >= naturalWidth) {
    // Portrait: the largest square is the full width; bias the vertical slice up.
    const heightPct = (naturalWidth / naturalHeight) * 100;
    return {
      x: 0,
      y: PORTRAIT_FACE_BIAS_Y * (100 - heightPct),
      width: 100,
      height: heightPct,
    };
  }
  // Landscape: the largest square is the full height, centred horizontally.
  const widthPct = (naturalHeight / naturalWidth) * 100;
  return { x: (100 - widthPct) / 2, y: 0, width: widthPct, height: 100 };
}

/**
 * Validate + clamp a raw crop rect (from react-easy-crop or imported JSON) into
 * a safe `PortraitCrop` (percentages). Returns `null` for any degenerate input
 * so callers fall back to `object-cover` instead of persisting NaN/zero values
 * that crash the cropper / produce a divide-by-zero in {@link cropToCssStyle}.
 *
 * Rules:
 *   - every field must be a finite number;
 *   - width/height must be strictly positive (a zero/negative rect is invalid);
 *   - x/y are clamped to 0–100; width/height are clamped to (0, 100] and so the
 *     rect never extends past the image's right/bottom edge.
 */
export function normalizePortraitCrop(crop: unknown): PortraitCrop | null {
  if (typeof crop !== "object" || crop === null) return null;
  const { x, y, width, height } = crop as Record<string, unknown>;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }
  // A crop with no area is meaningless and would divide-by-zero on display.
  if (width <= 0 || height <= 0) return null;

  const clampedX = Math.min(Math.max(x, 0), 100);
  const clampedY = Math.min(Math.max(y, 0), 100);
  // Keep the rect inside the image: width can't exceed the space left of x.
  const clampedWidth = Math.min(width, 100 - clampedX);
  const clampedHeight = Math.min(height, 100 - clampedY);

  // Clamping could shrink an edge rect to zero (e.g. x=100); reject those too.
  if (clampedWidth <= 0 || clampedHeight <= 0) return null;

  return { x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight };
}

/**
 * The crop's focal point as a CSS `background-position` value (`"x% y%"`).
 *
 * The card and the crop frame show the crop rectangle EXACTLY; the full-page
 * `cover` backdrop shows more than the rectangle, so it can only honour the
 * crop's FOCAL — the centre of the chosen rect. Aligning that focal percentage
 * of the image with the same percentage of the viewport (standard
 * `background-position: x% y%` semantics) is what makes "where the DM cropped"
 * drive "where the backdrop centres". Returns `null` for a degenerate/absent
 * crop so callers fall back to the global default position (the default asset
 * stays centred).
 */
export function cropToBackgroundPosition(crop: PortraitCrop | null): string | null {
  const safe = normalizePortraitCrop(crop);
  return safe ? cropFocalPosition(safe) : null;
}

/**
 * The crop's focal point (rect centre) as a CSS `x% y%` position string — the
 * ONE focal formula, shared by the `object-position` of the cover crop
 * ({@link cropToCssStyle}) and the backdrop's `background-position`
 * ({@link cropToBackgroundPosition}) so "where the DM cropped" drives both
 * consistently. Expects an already-{@link normalizePortraitCrop}d rect.
 */
function cropFocalPosition(crop: PortraitCrop): string {
  return `${crop.x + crop.width / 2}% ${crop.y + crop.height / 2}%`;
}

/**
 * The crop's ZOOM factor (≥ 1) — the SAME magnification the cropper's zoom slider
 * applied. A `PortraitCrop` stores no explicit zoom: it is implicit in the rect
 * size. At zoom 1 the frame-aspect rect is maximal, so ONE axis fills the image
 * (its dimension is 100%); zooming in by `z` shrinks BOTH axes to `1/z`, so the
 * larger remaining dimension is `100/z`. Hence `z = 100 / max(width, height)`,
 * exactly the slider value for ANY image aspect (see the card/backdrop proof in
 * the module header). Returns `1` for a maximal (un-zoomed) or degenerate crop.
 *
 * The card honours this zoom structurally — {@link cropToCssStyle} sizes its
 * over-box `100/width × 100/height`, so a tighter rect enlarges the image. The
 * full-window `cover` backdrop can't read a rect size, so it reuses THIS factor as
 * a `transform: scale(z)` around the focal: scaling the viewport-filling art up
 * around an interior point keeps the focal fixed, always still covers, and shows
 * the SAME tight framing the card does — position AND zoom, from one crop.
 */
export function cropZoomFactor(crop: PortraitCrop | null): number {
  const safe = normalizePortraitCrop(crop);
  if (!safe) return 1;
  return Math.max(1, 100 / Math.max(safe.width, safe.height));
}

export function cropToCssStyle(crop: PortraitCrop): CSSProperties {
  return {
    position: "absolute",
    width: `${(100 / crop.width) * 100}%`,
    height: `${(100 / crop.height) * 100}%`,
    maxWidth: "none",
    // COVER, never fill: a single uniform scale into the over-sized box, so the
    // image can never stretch when the crop's pixel-aspect differs from the
    // frame's (the live 3:1-in-16:9 case). `object-position` at the focal keeps
    // the crop centre at the frame centre (see header proof). Inline `cover`
    // also overrides any container `object-fit` rule, so framing can't break.
    objectFit: "cover",
    objectPosition: cropFocalPosition(crop),
    left: `${-(crop.x / crop.width) * 100}%`,
    top: `${-(crop.y / crop.height) * 100}%`,
  };
}
