/**
 * d20-icosahedron — the 3D renderer behind the gilt-d20 loader. Pins the geometry and
 * that drawD20 paints a sensible set of front faces (back-face culled) with numbers,
 * without throwing — against a stub 2D context (jsdom has no real canvas).
 */

import { describe, it, expect, vi } from "vitest";
import { drawD20, D20_REST } from "@/components/shared/d20-icosahedron";

function stubCtx() {
  const calls = {
    fill: 0,
    stroke: 0,
    fillText: [] as string[],
    clearRect: 0,
    beginPath: 0,
  };
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "",
    textBaseline: "",
    clearRect: () => (calls.clearRect += 1),
    beginPath: () => (calls.beginPath += 1),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: () => (calls.fill += 1),
    stroke: () => (calls.stroke += 1),
    fillText: (s: string) => calls.fillText.push(s),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("drawD20", () => {
  it("draws a culled set of front faces + numbers, and never throws", () => {
    const { ctx, calls } = stubCtx();
    expect(() => drawD20(ctx, 80, D20_REST.ax, D20_REST.ay)).not.toThrow();
    expect(calls.clearRect).toBe(1);
    // A convex icosahedron shows roughly half its 20 faces toward the camera.
    expect(calls.fill).toBeGreaterThanOrEqual(5);
    expect(calls.fill).toBeLessThanOrEqual(20);
    // One number painted per visible face.
    expect(calls.fillText.length).toBe(calls.fill);
    // The labels are valid d20 values.
    for (const n of calls.fillText) {
      const v = Number(n);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  it("renders different faces as the die rotates (it really is 3D)", () => {
    const a = stubCtx();
    drawD20(a.ctx, 80, 0.5, 0.0);
    const b = stubCtx();
    drawD20(b.ctx, 80, 0.5, Math.PI); // half-turn → the opposite hemisphere
    expect(a.calls.fillText.join()).not.toBe(b.calls.fillText.join());
  });
});
