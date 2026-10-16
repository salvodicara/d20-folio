/**
 * BreakdownTip — the equation view (direction B, owner 2026-10-16).
 *
 * A short, purely numeric breakdown reads as an equation a beginner can follow
 * ("10 Base + 2 DEX = 12 AC"); anything richer keeps the receipt list. The cases
 * come from the fallback rules in `equationTerms`: dice, a rule's why, a note,
 * more than four parts, a negative first term.
 *
 * BLIND SPOT: jsdom sees the structure, not the layout; the look is checked in
 * real Chromium.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import i18n from "@/i18n";
import { BreakdownTip } from "@/components/shared/BreakdownTip";
import type { BreakdownLine } from "@/lib/value-breakdown";

const base: BreakdownLine = { kind: "loc", label: "Chain Mail", value: "16" };
const shield: BreakdownLine = { kind: "loc", label: "Shield", value: "+2" };

function open(lines: BreakdownLine[], label: string, name?: string) {
  const { container } = render(<BreakdownTip label={label} lines={lines} name={name} />);
  const rubric = i18n.getFixedT(i18n.language)("breakdown.rubric");
  fireEvent.click(screen.getByRole("button", { name: rubric }));
  const pop = screen.getByRole("dialog");
  return { pop, container };
}

describe("BreakdownTip — the equation view", () => {
  it("writes a short numeric breakdown as terms, operators and the named total", () => {
    const { pop } = open([base, shield], "18", "AC");
    const eq = pop.querySelector(".bd-eq");
    expect(eq).not.toBeNull();
    const terms = [...pop.querySelectorAll(".bd-eq-term")].map((t) => t.textContent);
    expect(terms).toEqual(["16Chain Mail", "2Shield", "18AC"]);
    const ops = [...pop.querySelectorAll(".bd-eq-op")].map((o) => o.textContent);
    expect(ops).toEqual(["+", "="]);
  });

  it("a negative part is a minus operator, still read aloud", () => {
    const { pop } = open([base, { kind: "ability", ability: "DEX", value: "−1" }], "15");
    const ops = [...pop.querySelectorAll(".bd-eq-op")].map((o) => o.textContent);
    expect(ops).toEqual(["−", "="]);
    expect(pop.querySelectorAll(".bd-eq-term")[1]?.textContent).toContain("−1");
  });

  const fallbacks: [string, BreakdownLine[]][] = [
    ["a die", [{ kind: "loc", label: "Mace", value: "1d6" }, shield]],
    [
      "a rule's why",
      [base, { ...shield, why: { term: "breakdown.why.finesse", params: {} } }],
    ],
    ["a note", [base, { ...shield, note: { term: "combat.whileActiveNote" } }]],
    ["five parts", [base, shield, shield, shield, shield]],
    ["a negative first part", [{ ...base, value: "−1" }, shield]],
    ["a single part", [base]],
  ];
  for (const [what, lines] of fallbacks) {
    it(`keeps the receipt list for ${what}`, () => {
      const { pop } = open(lines, "18");
      expect(pop.querySelector(".bd-eq")).toBeNull();
    });
  }
});
