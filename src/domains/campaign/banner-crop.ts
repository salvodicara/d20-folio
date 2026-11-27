/**
 * The campaign banner's crop on the new screen (headless). The cropper is a 16:9 frame
 * over the picture, the shape the classic flow stores (`bannerCrop`, a % rectangle), so
 * both screens read the same crop. The view is a zoom (1 to 3) and the frame's centre
 * in % of the picture; dragging moves the centre the other way. The round crest shows
 * the crop's focal point at its zoom.
 */
import type { CSSProperties } from "react";

import { cropZoomFactor, normalizePortraitCrop } from "@/lib/portrait-crop";
import type { PortraitCrop } from "@/types/character";

export const BANNER_ASPECT = 16 / 9;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

export interface ImageSize {
  width: number;
  height: number;
}

export interface CropView {
  zoom: number;
  /** The frame's centre, in % of the picture. */
  centerX: number;
  centerY: number;
}

export const clampZoom = (zoom: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(zoom) ? zoom : MIN_ZOOM));

/** The frame's size in % of the picture at zoom 1: the largest 16:9 rectangle. */
function fullFrame(image: ImageSize): { width: number; height: number } {
  const ratio = image.width / image.height;
  return ratio > BANNER_ASPECT
    ? { width: (BANNER_ASPECT / ratio) * 100, height: 100 }
    : { width: 100, height: (ratio / BANNER_ASPECT) * 100 };
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** The % rectangle the view frames, kept inside the picture. */
export function cropFromView(image: ImageSize, view: CropView): PortraitCrop {
  const zoom = clampZoom(view.zoom);
  const full = fullFrame(image);
  const width = full.width / zoom;
  const height = full.height / zoom;
  const x = clamp(view.centerX - width / 2, 0, 100 - width);
  const y = clamp(view.centerY - height / 2, 0, 100 - height);
  return { x, y, width, height };
}

/** The view a saved crop opens at (centred and un-zoomed without one). */
export function viewFromCrop(image: ImageSize, crop: PortraitCrop | null): CropView {
  const safe = normalizePortraitCrop(crop);
  if (!safe) return { zoom: 1, centerX: 50, centerY: 50 };
  const full = fullFrame(image);
  return {
    zoom: clampZoom(full.width / safe.width),
    centerX: safe.x + safe.width / 2,
    centerY: safe.y + safe.height / 2,
  };
}

/** A drag of (dx, dy) frame pixels: the picture follows the finger, so the frame's
 *  centre moves the other way, kept so the frame stays inside the picture. */
export function panView(
  image: ImageSize,
  view: CropView,
  drag: { dx: number; dy: number; frameWidth: number }
): CropView {
  const crop = cropFromView(image, view);
  if (drag.frameWidth <= 0) return view;
  const perPxX = crop.width / drag.frameWidth;
  const perPxY = crop.height / (drag.frameWidth / BANNER_ASPECT);
  const next = cropFromView(image, {
    ...view,
    centerX: crop.x + crop.width / 2 - drag.dx * perPxX,
    centerY: crop.y + crop.height / 2 - drag.dy * perPxY,
  });
  return {
    zoom: view.zoom,
    centerX: next.x + next.width / 2,
    centerY: next.y + next.height / 2,
  };
}

/** The round crest's picture: the crop's focal point, at its zoom. */
export function crestImageStyle(crop: PortraitCrop | null): CSSProperties {
  const safe = normalizePortraitCrop(crop);
  if (!safe) return {};
  const focal = `${String(safe.x + safe.width / 2)}% ${String(safe.y + safe.height / 2)}%`;
  return {
    objectPosition: focal,
    transformOrigin: focal,
    transform: `scale(${String(cropZoomFactor(safe))})`,
  };
}
