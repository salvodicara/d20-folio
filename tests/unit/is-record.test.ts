/** The shared plain-object guard: objects yes; null, arrays and primitives no. */
import { describe, expect, it } from "vitest";

import { isRecord } from "@/lib/is-record";

describe("isRecord", () => {
  it("accepts a plain object and rejects null, an array and a primitive", () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([1])).toBe(false);
    expect(isRecord("x")).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});
