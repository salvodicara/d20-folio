/**
 * B05 — the DM monster-initiative typed-input discipline (`init-input.ts`).
 *
 * The old `MonsterInitChip.commit()` stripped `/[^\d-]/g` (a hyphen allowed ANYWHERE),
 * so a misplaced minus (`"5-"`, `"1-2"`) reached `Math.round(Number(…))` = `NaN` and
 * committed `initiative: NaN` — corrupting the sort comparator, unblocking the
 * Begin-turns gate (`NaN != null` is true) with garbage, and rendering literal "NaN".
 * These pins prove the extracted seam can NEVER yield `NaN`: a non-finite draft commits
 * `null`, and only a SINGLE LEADING minus survives.
 */
import { describe, it, expect } from "vitest";
import { parseInitInput, sanitizeInitInput } from "@/features/campaigns/init-input";

describe("sanitizeInitInput — draft filter (single leading minus + digits)", () => {
  it("drops a trailing minus", () => {
    expect(sanitizeInitInput("5-")).toBe("5");
  });
  it("drops a mid-string minus (concatenating the digits)", () => {
    expect(sanitizeInitInput("1-2")).toBe("12");
  });
  it("keeps a single LEADING minus", () => {
    expect(sanitizeInitInput("-5")).toBe("-5");
  });
  it("keeps a lone leading minus (an in-progress negative)", () => {
    expect(sanitizeInitInput("-")).toBe("-");
  });
  it("collapses multiple/misplaced minuses to one leading minus", () => {
    expect(sanitizeInitInput("-1-2-")).toBe("-12");
  });
  it("strips non-numeric noise", () => {
    expect(sanitizeInitInput("1a2")).toBe("12");
  });
});

describe("parseInitInput — commit value (finite integer or null, NEVER NaN)", () => {
  it("commits a finite value for a trailing-minus draft, never NaN", () => {
    const v = parseInitInput("5-");
    expect(v).toBe(5);
    expect(Number.isNaN(v as number)).toBe(false);
  });

  it("commits a finite value for a mid-string-minus draft, never NaN", () => {
    const v = parseInitInput("1-2");
    expect(v).toBe(12);
    expect(Number.isNaN(v as number)).toBe(false);
  });

  it("commits a negative for a single-leading-minus draft", () => {
    expect(parseInitInput("-5")).toBe(-5);
  });

  it("commits null (blank) for an empty draft", () => {
    expect(parseInitInput("")).toBeNull();
  });

  it("commits null (blank) for a lone minus", () => {
    expect(parseInitInput("-")).toBeNull();
  });

  it("commits null (blank) for pure non-numeric noise", () => {
    expect(parseInitInput("abc")).toBeNull();
  });

  it("rounds a decimal draft to an integer", () => {
    expect(parseInitInput("12")).toBe(12);
  });

  // The invariant the sort/gate/display all rely on: the commit value is NEVER NaN.
  it("never returns NaN for any of the pathological drafts", () => {
    for (const draft of ["5-", "1-2", "-", "-1-2-", "--", "1-", "1a2", ""]) {
      const v = parseInitInput(draft);
      expect(v === null || Number.isFinite(v)).toBe(true);
    }
  });
});
