/**
 * Image utilities for the portrait flow.
 *
 * Cropping is done entirely via CSS at render time using `PortraitCrop`
 * metadata (percentages) stored in CharacterDoc — no canvas crop needed.
 */

// ─── Load image helper ────────────────────────────────────────────────────────

/** Loads an image src (data URL or remote URL) into an HTMLImageElement. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () => reject(new Error("Failed to load image")));
    // Allow cross-origin images (needed for remote URLs)
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

// ─── File → Data URL ─────────────────────────────────────────────────────────

/** Reads a File as a data URL string (for feeding into the crop UI). */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("FileReader result is not a string"));
      }
    });
    reader.addEventListener("error", () => reject(new Error("FileReader failed")));
    reader.readAsDataURL(file);
  });
}
