import { describe, it, expect } from "vitest";
import { condColor } from "@/lib/condition-color";

describe("condColor", () => {
  it("resolves a lowercase id to its --cond-* token", () => {
    expect(condColor("frightened")).toBe("var(--cond-frightened, var(--text-muted))");
  });

  it("normalizes a capitalized id to lowercase (the Frightened-grey bug)", () => {
    // Session/mock data stores "Frightened" (capital F) but the token key is
    // --cond-frightened; without normalization the chip fell back to grey.
    expect(condColor("Frightened")).toBe("var(--cond-frightened, var(--text-muted))");
  });

  it("normalizes mixed/upper case", () => {
    expect(condColor("POISONED")).toBe("var(--cond-poisoned, var(--text-muted))");
  });
});
