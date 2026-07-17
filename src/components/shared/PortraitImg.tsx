/**
 * PortraitImg
 *
 * Renders a character portrait that fills its parent container.
 *
 * Two display modes:
 *   - no crop  → a plain `object-cover` image (fills + center-crops).
 *   - crop set → the stored region (percentages) is shown via CSS crop math:
 *     the image is over-sized and offset so only the chosen region is visible.
 *
 * ── Why this component owns its own wrapper ───────────────────────────────────
 * The CSS-crop image is `position: absolute` and intentionally LARGER than the
 * container (e.g. 250% wide). For it to be clipped to the visible region, its
 * positioning context must be a `position: relative; overflow: hidden` box.
 *
 * Historically PortraitImg relied on the PARENT call-site providing that box.
 * That contract was fragile: the sheet-header `.portrait` and roster
 * `.ch-portrait` tiles set `overflow: hidden` but NOT `position: relative`, so
 * after a re-crop the over-sized absolute image escaped the tile and leaked —
 * spilling into the top bar on the sheet and taking over the whole card in the
 * roster (the owner-reported "leak").
 *
 * To make that leak structurally impossible regardless of the parent's CSS,
 * PortraitImg now renders its OWN `position: relative; overflow: hidden` wrapper
 * that fills the parent (`width/height: 100%`). The crop math is resolved
 * against this self-owned box, so the image can never escape its tile.
 *
 * Defence in depth: any stored crop is re-validated through
 * {@link normalizePortraitCrop} at render time. A poisoned value (NaN / zero /
 * out-of-range — e.g. from an old document written before the validator
 * existed) falls back to the safe `object-cover` path instead of producing
 * NaN/Infinity CSS that mis-renders.
 */

import type { CSSProperties } from "react";
import type { PortraitCrop } from "@/types/character";
import {
  cropToCssStyle,
  normalizePortraitCrop,
  PORTRAIT_FACE_BIAS_Y,
} from "@/lib/portrait-crop";
import { isPortraitLoaded, markPortraitLoaded } from "@/lib/portrait-cache";
import { cn } from "@/lib/utils";

interface Props {
  src: string;
  crop: PortraitCrop | null;
  alt: string;
  /** Extra classes applied on the object-cover (no-crop) fallback path */
  className?: string;
  /** Load priority — lazy by default; eager for the above-the-fold hero (#92). */
  loading?: "lazy" | "eager";
}

/**
 * Self-owned clipping context so the crop never depends on the parent's CSS.
 *
 * `display: block` is load-bearing: a bare `<span>` is `display: inline`, and
 * inline elements IGNORE `width/height: 100%` — so the wrapper collapsed to 0×0
 * (and the %-sized crop image with it → an invisible-but-still-fetched banner) in
 * any parent that didn't happen to blockify it. A grid/flex child is auto-
 * blockified, which is why portraits worked; the campaign banner — child of a
 * plain `position: absolute` div — was not, so its wrapper collapsed. Forcing
 * `block` makes the wrapper fill any parent with a definite size, whatever its
 * display.
 */
const WRAPPER_STYLE: CSSProperties = {
  display: "block",
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
};

export function PortraitImg({ src, crop, alt, className, loading = "lazy" }: Props) {
  // Re-validate at the render boundary: a poisoned stored crop falls back to
  // object-cover rather than producing NaN/Infinity CSS.
  const safeCrop = normalizePortraitCrop(crop);

  // No-flash on remount (OWN-41): a URL that already painted this session is
  // "warm", so a remounted tile paints it synchronously with no lazy defer
  // instead of flashing the parent fallback (the "portraits reload on
  // navigation" report). A never-seen URL keeps its async + caller-provided
  // loading behaviour and is recorded on first `onLoad`. The cache is a pure
  // module-scope set (see portrait-cache); reading it during render is pure
  // w.r.t. this component and it is only mutated from the onLoad handler.
  const isWarm = isPortraitLoaded(src);
  const loadingAttrs = {
    onLoad: () => markPortraitLoaded(src),
    decoding: isWarm ? ("sync" as const) : ("async" as const),
    loading: isWarm ? ("eager" as const) : loading,
    // NB: the display <img> deliberately stays NO-CORS. A crossOrigin request is
    // served the OLD service worker's cached OPAQUE response during a deploy
    // transition → a CORS failure → broken portraits for every existing user on
    // first load. The JSON export never touches this URL over HTTP — it reads the
    // bytes through the Storage SDK (`portraitToDataUrl` in lib/storage), so
    // display caching and export are fully decoupled.
  };

  if (!safeCrop) {
    // Same self-owned fill wrapper as the crop path. A bare `<img h-full w-full>`
    // is sized INCONSISTENTLY by the parent: in a grid `place-items: center` tile
    // (the roster `.ch-portrait`) `height: 100%` doesn't constrain the replaced
    // image, so it keeps its intrinsic 2:3 box and the square just clips a slice;
    // in a flex `align-items: center` tile (the hero `.seal`) it collapses to a
    // square. Result: the SAME uncropped portrait framed differently across
    // surfaces (owner-reported roster-vs-seal). The block wrapper fills any
    // definite-size parent regardless of its display type, and the absolutely
    // positioned image object-covers THAT box — so every surface frames identically.
    return (
      <span style={WRAPPER_STYLE}>
        <img
          src={src}
          alt={alt}
          className={cn("av-img object-cover", className)}
          // Favour the UPPER portion of the frame. An uncropped portrait is almost
          // always full-figure (head at the top of a tall 2:3 image); a centred
          // object-cover would land on the waist and clip the face. Biasing toward
          // the top keeps the FACE in view across every surface (the roster's old
          // "looks great" framing) until the player sets a precise crop. The same
          // PORTRAIT_FACE_BIAS_Y feeds the crop modal's default frame, so the
          // uncropped portrait and the crop circle land on the SAME region.
          style={{
            position: "absolute",
            inset: 0,
            height: "100%",
            width: "100%",
            objectPosition: `50% ${PORTRAIT_FACE_BIAS_Y * 100}%`,
          }}
          {...loadingAttrs}
        />
      </span>
    );
  }

  return (
    <span style={WRAPPER_STYLE}>
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={cropToCssStyle(safeCrop)}
        {...loadingAttrs}
      />
    </span>
  );
}
