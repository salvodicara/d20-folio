/**
 * non-empty-string — the branded smart constructor that makes "an empty name"
 * UNREPRESENTABLE (owner directive 2026-06-15). These pin the IMPOSSIBILITY: the
 * only way to obtain a `NonEmptyString` is through the validator, and the validator
 * rejects every empty/whitespace/non-string input (so a `CharacterData.name` can
 * never be `""`).
 */
import { describe, it, expect } from "vitest";
import { nonEmptyString, assertNonEmptyString } from "@/lib/non-empty-string";

describe("nonEmptyString — the smart constructor (rejects the empty cases)", () => {
  it("rejects the empty string", () => {
    expect(nonEmptyString("")).toBeNull();
  });

  it("rejects a whitespace-only string (the leak the old `!name` check missed)", () => {
    expect(nonEmptyString("   ")).toBeNull();
    expect(nonEmptyString("\t\n  ")).toBeNull();
  });

  it("rejects non-strings (null / undefined / number / object)", () => {
    expect(nonEmptyString(null)).toBeNull();
    expect(nonEmptyString(undefined)).toBeNull();
    expect(nonEmptyString(42)).toBeNull();
    expect(nonEmptyString({})).toBeNull();
    expect(nonEmptyString([])).toBeNull();
  });

  it("accepts a real name and TRIMS surrounding whitespace", () => {
    expect(nonEmptyString("Lyra Voss")).toBe("Lyra Voss");
    expect(nonEmptyString("  Lyra Voss  ")).toBe("Lyra Voss");
  });

  it("preserves interior whitespace (only the edges are trimmed)", () => {
    expect(nonEmptyString("Coralino di Sanvaldo")).toBe("Coralino di Sanvaldo");
  });

  it("a branded NonEmptyString reads transparently as a plain string", () => {
    const n = nonEmptyString("Thorin");
    // The brand only ADDS to the type — every string operation still works with no
    // cast, so READ sites stay unchanged.
    expect(n?.toLowerCase()).toBe("thorin");
    expect(`Hello ${n}`).toBe("Hello Thorin");
  });
});

describe("assertNonEmptyString — the throwing variant (for known-non-empty values)", () => {
  it("returns the branded value for a valid string", () => {
    expect(assertNonEmptyString("Lyra")).toBe("Lyra");
  });

  it("throws on an empty / whitespace / non-string (programmer-error signal)", () => {
    expect(() => assertNonEmptyString("")).toThrow();
    expect(() => assertNonEmptyString("   ")).toThrow();
    expect(() => assertNonEmptyString(null)).toThrow();
    expect(() => assertNonEmptyString(undefined, "name")).toThrow(/name/);
  });
});
