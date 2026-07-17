/**
 * Unit tests for src/lib/image-crop.ts and portrait display utilities.
 *
 * These tests run in jsdom (Vitest default), so we need to mock the browser
 * APIs that the module depends on: HTMLImageElement loading, canvas, and
 * FileReader. All mocks are scoped via vi.stubGlobal / vi.restoreAllMocks.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// Mock Firebase to prevent real initialization (no API key in CI)
vi.mock("@/lib/firebase", () => ({
  storage: {},
}));

import { loadImage, readFileAsDataUrl } from "@/lib/image-crop";
import { compressImage } from "@/lib/storage";
import { cropToCssStyle } from "@/lib/portrait-crop";
import type { PortraitCrop } from "@/types/character";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A fake Image class whose 'load' handler fires immediately on src assignment. */
class FastImage {
  crossOrigin = "";
  private _loadHandler: (() => void) | null = null;
  set src(_v: string) {
    setTimeout(() => this._loadHandler?.(), 0);
  }
  addEventListener(event: string, handler: () => void) {
    if (event === "load") this._loadHandler = handler;
  }
}

// ─── loadImage ────────────────────────────────────────────────────────────────

describe("loadImage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves when the load event fires", async () => {
    vi.stubGlobal("Image", FastImage);
    const img = await loadImage("data:image/png;base64,iVBORw0KGgo=");
    expect(img).toBeDefined();
    expect(img.crossOrigin).toBe("anonymous");
  });

  it("rejects when the image fails to load", async () => {
    class FakeImage {
      crossOrigin = "";
      private _errorHandler: (() => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this._errorHandler?.(), 0);
      }
      addEventListener(event: string, handler: () => void) {
        if (event === "error") this._errorHandler = handler;
      }
    }
    vi.stubGlobal("Image", FakeImage);
    await expect(loadImage("bad://url")).rejects.toThrow("Failed to load image");
  });
});

// ─── readFileAsDataUrl ────────────────────────────────────────────────────────

describe("readFileAsDataUrl", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves with a data URL string for a valid file", async () => {
    const file = new File(["hello"], "test.png", { type: "image/png" });
    const result = await readFileAsDataUrl(file);
    expect(typeof result).toBe("string");
    expect(result).toMatch(/^data:/);
  });

  it("rejects when FileReader encounters an error", async () => {
    class ErrorReader {
      result: unknown = null;
      private _errorHandler: (() => void) | null = null;
      addEventListener(event: string, handler: () => void) {
        if (event === "error") this._errorHandler = handler;
      }
      readAsDataURL() {
        setTimeout(() => this._errorHandler?.(), 0);
      }
    }
    vi.stubGlobal("FileReader", ErrorReader);
    const file = new File(["x"], "bad.png", { type: "image/png" });
    await expect(readFileAsDataUrl(file)).rejects.toThrow("FileReader failed");
  });
});

// ─── compressImage ────────────────────────────────────────────────────────────

/** Fake Image whose onload fires immediately when src is assigned. */
class FastLoadImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 800;
  height = 600;
  set src(_v: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}

describe("compressImage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns a Blob for a normal image", async () => {
    vi.stubGlobal("Image", FastLoadImage);
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:fake") });
    const fakeBlob = new Blob(["jpeg"], { type: "image/jpeg" });
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(fakeBlob)),
    };
    vi.spyOn(document, "createElement").mockReturnValue(
      mockCanvas as unknown as HTMLCanvasElement
    );

    const file = new File(["img"], "photo.png", { type: "image/png" });
    const result = await compressImage(file);
    expect(result).toBeInstanceOf(Blob);
  });

  it("scales down a wide image to maxPx on the longest side", async () => {
    class WideImage extends FastLoadImage {
      override width = 4000;
      override height = 2000;
    }
    vi.stubGlobal("Image", WideImage);
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:fake") });
    const fakeBlob = new Blob(["jpeg"], { type: "image/jpeg" });
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(fakeBlob)),
    };
    vi.spyOn(document, "createElement").mockReturnValue(
      mockCanvas as unknown as HTMLCanvasElement
    );

    const file = new File(["img"], "wide.png", { type: "image/png" });
    await compressImage(file, 2000);
    // 4000×2000 → 2000×1000
    expect(mockCanvas.width).toBe(2000);
    expect(mockCanvas.height).toBe(1000);
  });

  it("scales down a tall image to maxPx on the longest side", async () => {
    class TallImage extends FastLoadImage {
      override width = 1000;
      override height = 3000;
    }
    vi.stubGlobal("Image", TallImage);
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:fake") });
    const fakeBlob = new Blob(["jpeg"], { type: "image/jpeg" });
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(fakeBlob)),
    };
    vi.spyOn(document, "createElement").mockReturnValue(
      mockCanvas as unknown as HTMLCanvasElement
    );

    const file = new File(["img"], "tall.png", { type: "image/png" });
    await compressImage(file, 2000);
    // 1000×3000 → 667×2000
    expect(mockCanvas.height).toBe(2000);
    expect(mockCanvas.width).toBe(Math.round((1000 / 3000) * 2000));
  });

  it("does not resize an image already within maxPx", async () => {
    class SmallImage extends FastLoadImage {
      override width = 800;
      override height = 600;
    }
    vi.stubGlobal("Image", SmallImage);
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:fake") });
    const fakeBlob = new Blob(["jpeg"], { type: "image/jpeg" });
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(fakeBlob)),
    };
    vi.spyOn(document, "createElement").mockReturnValue(
      mockCanvas as unknown as HTMLCanvasElement
    );

    const file = new File(["img"], "small.png", { type: "image/png" });
    await compressImage(file, 2000);
    expect(mockCanvas.width).toBe(800);
    expect(mockCanvas.height).toBe(600);
  });

  it("rejects when the image fails to load", async () => {
    class ErrorImage extends FastLoadImage {
      override set src(_v: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    vi.stubGlobal("Image", ErrorImage);
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:fake") });

    const file = new File(["img"], "bad.png", { type: "image/png" });
    await expect(compressImage(file)).rejects.toThrow(
      "Failed to load image for compression"
    );
  });

  it("rejects when canvas 2D context is unavailable", async () => {
    vi.stubGlobal("Image", FastLoadImage);
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:fake") });
    vi.spyOn(document, "createElement").mockReturnValue({
      getContext: () => null,
      toBlob: vi.fn(),
      width: 0,
      height: 0,
    } as unknown as HTMLCanvasElement);

    const file = new File(["img"], "photo.png", { type: "image/png" });
    await expect(compressImage(file)).rejects.toThrow("Canvas 2D context unavailable");
  });

  it("rejects when toBlob returns null", async () => {
    vi.stubGlobal("Image", FastLoadImage);
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:fake") });
    vi.spyOn(document, "createElement").mockReturnValue({
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: (cb: (b: Blob | null) => void) => cb(null),
    } as unknown as HTMLCanvasElement);

    const file = new File(["img"], "photo.png", { type: "image/png" });
    await expect(compressImage(file)).rejects.toThrow("canvas.toBlob returned null");
  });
});

// ─── cropToCssStyle ──────────────────────────────────────────────────────────

describe("cropToCssStyle", () => {
  it("returns position:absolute", () => {
    const crop: PortraitCrop = { x: 0, y: 0, width: 100, height: 100 };
    expect(cropToCssStyle(crop).position).toBe("absolute");
  });

  it("full image (no crop) → 100% width/height, 0 offset", () => {
    const crop: PortraitCrop = { x: 0, y: 0, width: 100, height: 100 };
    const style = cropToCssStyle(crop);
    expect(style.width).toBe("100%");
    expect(style.height).toBe("100%");
    // -(0/100)*100 = -0, which stringifies as "0" not "-0" in JS
    expect(style.left).toBe("0%");
    expect(style.top).toBe("0%");
  });

  it("center quarter crop → 200% width/height, -50% offsets", () => {
    // Crop: top-left at (25,25), 50×50% of image — center square
    const crop: PortraitCrop = { x: 25, y: 25, width: 50, height: 50 };
    const style = cropToCssStyle(crop);
    expect(style.width).toBe("200%");
    expect(style.height).toBe("200%");
    expect(style.left).toBe("-50%");
    expect(style.top).toBe("-50%");
  });

  it("top-left quarter crop → 200% size, 0 offset", () => {
    // Crop starts at (0,0), covers 50% of the image
    const crop: PortraitCrop = { x: 0, y: 0, width: 50, height: 50 };
    const style = cropToCssStyle(crop);
    expect(style.width).toBe("200%");
    expect(style.height).toBe("200%");
    // -(0/50)*100 = -0, stringifies as "0%"
    expect(style.left).toBe("0%");
    expect(style.top).toBe("0%");
  });

  it("bottom-right quarter crop → 200% size, -100% offsets", () => {
    // Crop starts at (50,50), covers 50×50% of the image
    const crop: PortraitCrop = { x: 50, y: 50, width: 50, height: 50 };
    const style = cropToCssStyle(crop);
    expect(style.width).toBe("200%");
    expect(style.height).toBe("200%");
    expect(style.left).toBe("-100%");
    expect(style.top).toBe("-100%");
  });

  it("always sets maxWidth: none to override Tailwind preflight", () => {
    const crop: PortraitCrop = { x: 10, y: 5, width: 80, height: 60 };
    const style = cropToCssStyle(crop);
    expect(style.maxWidth).toBe("none");
  });
});
