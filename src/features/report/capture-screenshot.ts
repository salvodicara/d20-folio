/**
 * capture-screenshot — grab the current screen for a bug report (OWN-37).
 *
 * `html2canvas-pro` is LAZY-imported (dynamic `import()`) so it never lands in the
 * main bundle — it loads only when a player actually opens the reporter. We use the
 * `-pro` fork because the folio design relies on modern CSS color functions
 * (`color-mix()`, oklch) that vanilla `html2canvas` cannot parse — it throws on them,
 * which would void every capture. The
 * raster is downscaled to a small longest-side cap and emitted as a PNG so the
 * Storage object stays tiny (a few tens of KB), respecting the zero-budget,
 * free-tier envelope.
 *
 * The capture targets `document.body`. The dialog must capture BEFORE it paints
 * (or while hidden) so the screenshot shows the screen the user is reporting on,
 * not the dialog itself.
 */

/** Longest side (px) of the downscaled screenshot — keeps the upload tiny. */
const MAX_PX = 1200;

export interface Screenshot {
  /** PNG blob to upload to Storage. */
  blob: Blob;
  /** A data URL for the in-dialog thumbnail preview. */
  dataUrl: string;
  /** Final raster dimensions (post-downscale). */
  width: number;
  height: number;
}

/** Downscale a source canvas so its longest side is at most `maxPx`. */
function downscale(source: HTMLCanvasElement, maxPx: number): HTMLCanvasElement {
  const { width, height } = source;
  if (width <= maxPx && height <= maxPx) return source;
  const scale = maxPx / Math.max(width, height);
  const out = document.createElement("canvas");
  out.width = Math.round(width * scale);
  out.height = Math.round(height * scale);
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

/** Promisified `canvas.toBlob` (PNG). */
function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas.toBlob returned null"));
    }, "image/png");
  });
}

/**
 * Capture the current screen. Returns `null` if capture fails (the dialog then
 * simply offers no screenshot — the text report is still valuable). The
 * `html2canvas-pro` chunk is fetched on first call only.
 */
export async function captureScreenshot(): Promise<Screenshot | null> {
  if (typeof document === "undefined") return null;
  try {
    const { default: html2canvas } = await import("html2canvas-pro");
    const raw = await html2canvas(document.body, {
      // Skip cross-origin images (CORS taint would void the whole capture) and
      // keep logging quiet.
      useCORS: true,
      logging: false,
      // Capture the visible viewport, not the full scroll height — that's what
      // the user is looking at, and it keeps the raster small.
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      x: window.scrollX,
      y: window.scrollY,
    });
    const scaled = downscale(raw, MAX_PX);
    const blob = await toBlob(scaled);
    return {
      blob,
      dataUrl: scaled.toDataURL("image/png"),
      width: scaled.width,
      height: scaled.height,
    };
  } catch (err) {
    console.warn("screenshot capture failed:", err);
    return null;
  }
}
