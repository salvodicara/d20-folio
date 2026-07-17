/**
 * `attunement-slots` grant — Artificer raises the attunement cap (default 3).
 * Merge: MAX. Pins the evaluator + the Artificer feature data.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants } from "@/lib/grants";

describe("attunement-slots", () => {
  it("defaults to 3, takes the max across grants", () => {
    expect(evaluateGrants([]).attunementSlots).toBe(3);
    const agg = evaluateGrants([
      {
        id: "a",
        name: { en: "A", it: "A" },
        grants: [{ type: "attunement-slots", amount: 4 }],
      },
      {
        id: "b",
        name: { en: "B", it: "B" },
        grants: [{ type: "attunement-slots", amount: 6 }],
      },
      {
        id: "c",
        name: { en: "C", it: "C" },
        grants: [{ type: "attunement-slots", amount: 5 }],
      },
    ]);
    expect(agg.attunementSlots).toBe(6);
  });

  // (The Artificer feature-data pins — the only SRD-adjacent content that
  // raises the cap — live in
  // `content-pack/tests/unit/attunement-slots.pack.test.ts`.)
});
