/**
 * #1320 — the shape gate: once this client reads a newer shape it stops writing until
 * the page reloads. One flag, read by every writer, watched by the reload screen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeShapeGate,
  resetShapeGateForTests,
  settleShapeGateRescue,
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

  it("a close that knew of no edits gives way to one that has edits to keep", () => {
    const listener = vi.fn();
    subscribeShapeGate(listener);
    closeShapeGate({ rescue: "none" }); // a reader with no handler of its own
    closeShapeGate({ rescue: "saving" }); // the open sheet, with an unsaved edit
    expect(shapeGateState()).toEqual({ closed: true, rescue: "saving" });
    closeShapeGate({ rescue: "none" });
    closeShapeGate({ rescue: "failed" });
    expect(shapeGateState()).toEqual({ closed: true, rescue: "saving" });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("a failed rescue is reported, never hidden", () => {
    closeShapeGate({ rescue: "failed" });
    expect(shapeGateState()).toEqual({ closed: true, rescue: "failed" });
  });

  it("a rescue still being written settles once, to kept or failed", () => {
    const listener = vi.fn();
    subscribeShapeGate(listener);
    closeShapeGate({ rescue: "saving" });
    settleShapeGateRescue("kept");
    settleShapeGateRescue("failed");
    expect(shapeGateState()).toEqual({ closed: true, rescue: "kept" });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
