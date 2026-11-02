import { describe, expect, it } from "vitest";

import { metamagicChipStates } from "@/lib/cast-options";

// Cases from the cast dialog's own rule: one primary per cast (a second primary
// swaps the first, freeing its points), Empowered/Seeking stack on top, and a pick
// can never spend more Sorcery Points than are left.
const rows = [
  {
    id: "quickened",
    cost: 2,
    affordable: true,
    appliesToSpell: true,
    stacksWithPrimary: false,
  },
  {
    id: "twinned",
    cost: 1,
    affordable: true,
    appliesToSpell: false,
    stacksWithPrimary: false,
  },
  {
    id: "careful",
    cost: 1,
    affordable: true,
    appliesToSpell: true,
    stacksWithPrimary: false,
  },
  {
    id: "empowered",
    cost: 1,
    affordable: true,
    appliesToSpell: true,
    stacksWithPrimary: true,
  },
];

describe("metamagicChipStates", () => {
  it("with nothing picked, every applicable affordable option is open", () => {
    const s = metamagicChipStates(rows, [], 3);
    expect(s.remaining).toBe(3);
    expect(s.chips.map((c) => [c.id, c.enabled, c.why])).toEqual([
      ["quickened", true, null],
      ["twinned", false, "not-applicable"],
      ["careful", true, null],
      ["empowered", true, null],
    ]);
  });

  it("a second primary swaps the first and may use the points it frees", () => {
    const s = metamagicChipStates(rows, ["careful", "empowered"], 3);
    expect(s.remaining).toBe(1);
    const quick = s.chips.find((c) => c.id === "quickened");
    // 1 left + 1 freed by dropping Careful = 2: Quickened fits, as a swap.
    expect(quick).toMatchObject({ enabled: true, why: "swaps" });
  });

  it("a pick that would overspend is closed; a picked chip can always be undone", () => {
    const s = metamagicChipStates(rows, ["quickened"], 2);
    expect(s.remaining).toBe(0);
    expect(s.chips.find((c) => c.id === "empowered")).toMatchObject({
      enabled: false,
      why: "not-enough",
    });
    expect(s.chips.find((c) => c.id === "quickened")).toMatchObject({
      selected: true,
      enabled: true,
    });
  });
});
