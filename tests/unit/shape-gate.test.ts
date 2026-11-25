/**
 * #1320 — the shape gate: once this client reads a newer shape it stops writing until
 * the page reloads. One flag, read by every writer, watched by the reload screen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeShapeGate,
  resetShapeGateForTests,
  shapeGateState,
  subscribeShapeGate,
  writesFenced,
} from "@/lib/shape-gate";

beforeEach(() => resetShapeGateForTests());

describe("the shape gate", () => {
  it("starts open: writes go out", () => {
    expect(writesFenced()).toBe(false);
    expect(shapeGateState()).toEqual({ closed: false });
  });

  it("closing it fences every write and tells the listeners once", () => {
    const listener = vi.fn();
    subscribeShapeGate(listener);
    closeShapeGate({ rescue: "kept" });
    closeShapeGate({ rescue: "none" });
    expect(writesFenced()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    // The first close wins: a later read with no edits never hides a kept copy.
    expect(shapeGateState()).toEqual({ closed: true, rescue: "kept" });
  });

  it("a failed rescue is reported, never hidden", () => {
    closeShapeGate({ rescue: "failed" });
    expect(shapeGateState()).toEqual({ closed: true, rescue: "failed" });
  });
});
