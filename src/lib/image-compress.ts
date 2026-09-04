/**
 * Client-side image compression through a canvas — the one downsampler every upload uses
 * (portraits, monster art, campaign banners, map backgrounds). Pure DOM: no Firebase, no app
 * singleton, so the map adapter (`src/lib/map-io.ts`) can import it without crossing the
 * adapter boundary.
 */

/** Longest side (px) above which an image is downsampled before upload. */
const ORIGINAL_MAX_PX = 2000;
const ORIGINAL_QUALITY = 0.85;

// ─── Image compression ────────────────────────────────────────────────────────

/**
 * Compress an image file using a canvas.
 *
 * If the image is wider or taller than `maxPx`, it is scaled down
 * proportionally. The output is always a JPEG blob.
 *
 * @param file    - Source image file (any type the browser can decode)
 * @param maxPx   - Longest side limit in pixels (default 2000)
 * @param quality - JPEG quality 0–1 (default 0.85)
 */
export async function compressImage(
  file: Blob,
  maxPx = ORIGINAL_MAX_PX,
  quality = ORIGINAL_QUALITY
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) {
          height = Math.round((height / width) * maxPx);
          width = maxPx;
        } else {
          width = Math.round((width / height) * maxPx);
          height = maxPx;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("canvas.toBlob returned null"));
          }
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = URL.createObjectURL(file);
  });
}
