import { describe, expect, it } from "vitest";
import { createRing } from "@/lib/diagnostics/ring";

describe("diagnostics ring", () => {
  it("keeps the last `capacity` entries oldest → newest", () => {
    const ring = createRing<number>(3);
    for (const n of [1, 2, 3, 4, 5]) ring.push(n);
    expect(ring.snapshot()).toEqual([3, 4, 5]);
    expect(ring.size()).toBe(3);
  });

  it("snapshot is a defensive copy and clear empties it", () => {
    const ring = createRing<string>(2);
    ring.push("a");
    const snap = ring.snapshot();
    snap.push("zzz");
    expect(ring.snapshot()).toEqual(["a"]);
    ring.clear();
    expect(ring.snapshot()).toEqual([]);
  });

  it("rejects a non-positive capacity", () => {
    expect(() => createRing(0)).toThrow(RangeError);
  });
});
