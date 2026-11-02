/** The letter shown in place of a missing portrait or avatar. */
import { describe, expect, it } from "vitest";
import { initialOf } from "@/ui/initial";

describe("initialOf", () => {
  it("is the first letter, upper-cased, ignoring leading spaces", () => {
    expect(initialOf("  mandorlino")).toBe("M");
  });
  it("keeps a decomposed accent with its letter", () => {
    expect(initialOf("élise")).toBe("É");
  });
  it("is empty for an empty name", () => {
    expect(initialOf("   ")).toBe("");
  });
});
