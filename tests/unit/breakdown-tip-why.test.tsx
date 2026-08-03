/**
 * BreakdownTip — the WHY accordion.
 *
 * A breakdown row that a RULE produced becomes a `.cause-toggle` disclosure; a
 * row with nothing non-obvious to explain must render EXACTLY as it always has
 * (rule 19 — only, and all, the necessary). This pins that split, the
 * one-open-at-a-time accordion, the a11y contract (real button, `aria-expanded`,
 * `aria-controls`), and the `1d4 → 1d6` substitution cell.
 *
 * BLIND SPOT: jsdom cannot see CSS — the chevron's 90° rotation and the motion
 * gating are asserted only as the CLASS the stylesheet keys on (`rotate-90`);
 * the actual painted rotation is verified in real Chromium (rule 15).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import i18n from "@/i18n";
import { BreakdownTip } from "@/components/shared/BreakdownTip";
import type { BreakdownLine } from "@/lib/value-breakdown";

afterEach(async () => {
  if (i18n.language !== "en") await i18n.changeLanguage("en");
});

/** A die row a rule REPLACED, an explained ability row, and a PLAIN control row. */
const LINES: BreakdownLine[] = [
  {
    kind: "loc",
    label: "Dagger",
    value: "1d6",
    fromValue: "1d4",
    why: {
      term: "breakdown.why.dieUpgrade",
      params: { cls: "Monk", die: "1d6", printed: "1d4", level: 3 },
      rule: "Martial Arts",
    },
  },
  {
    kind: "ability",
    ability: "DEX",
    value: "+3",
    why: { term: "breakdown.why.finesse", params: { property: "Finesse" } },
  },
  { kind: "term", term: "character.proficiencyBonus", value: "+2" },
];

function openTip() {
  render(<BreakdownTip label="1d6+3" lines={LINES} flavor="damage" />);
  // The trigger's accessible name IS the rubric — LOCALIZED, so resolve it from
  // the catalogue rather than pinning an English string (golden rule 7).
  const rubric = i18n.getFixedT(i18n.language)("combat.damageBreakdown");
  fireEvent.click(screen.getByRole("button", { name: rubric }));
  return screen.getByRole("dialog");
}

describe("BreakdownTip — the why accordion", () => {
  it("only rows WITH a why become cause-toggles; a plain row is untouched", () => {
    const pop = openTip();
    const toggles = within(pop).getAllByRole("button", { expanded: false });
    expect(toggles).toHaveLength(2);
    expect(toggles.map((b) => b.textContent)).toEqual(["Dagger", "DEX"]);
    for (const t of toggles) expect(t).toHaveClass("cause-toggle");
    // The Proficiency Bonus row carries no rule — it renders as plain text, so
    // it is NOT among the popover's buttons (no chevron, no disclosure).
    expect(within(pop).getByText("Proficiency Bonus").tagName).not.toBe("BUTTON");
  });

  it("renders the substitution `1d4 → 1d6` in the value cell", () => {
    const pop = openTip();
    // Both the superseded and the effective die are shown; the arrow separates.
    expect(within(pop).getByText("1d4")).toBeInTheDocument();
    expect(within(pop).getByText("1d6")).toBeInTheDocument();
    expect(within(pop).getByText("→")).toBeInTheDocument();
  });

  it("tapping a row unfolds its explanation beneath it, with the gold lead-in", () => {
    const pop = openTip();
    const dagger = within(pop).getByRole("button", { name: "Dagger" });
    expect(pop.textContent).not.toContain("Martial Arts");
    fireEvent.click(dagger);
    expect(dagger).toHaveAttribute("aria-expanded", "true");
    // The rule NAME leads, then the interpolated plain-language sentence.
    expect(pop.textContent).toContain("Martial Arts");
    expect(pop.textContent).toContain("replaces the weapon's printed die (1d4)");
    // `aria-controls` points at the element that actually appeared.
    const controls = dagger.getAttribute("aria-controls") ?? "";
    expect(controls).not.toBe("");
    expect(pop.querySelector(`#${CSS.escape(controls)}`)).not.toBeNull();
  });

  it("is an ACCORDION — opening a second row closes the first", () => {
    const pop = openTip();
    fireEvent.click(within(pop).getByRole("button", { name: "Dagger" }));
    fireEvent.click(within(pop).getByRole("button", { name: "DEX" }));
    expect(within(pop).getByRole("button", { name: "Dagger" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(pop.textContent).not.toContain("replaces this weapon's printed");
    expect(pop.textContent).toContain("can use Dexterity or Strength");
  });

  it("tapping an OPEN row closes it", () => {
    const pop = openTip();
    const dagger = within(pop).getByRole("button", { name: "Dagger" });
    fireEvent.click(dagger);
    fireEvent.click(dagger);
    expect(dagger).toHaveAttribute("aria-expanded", "false");
    expect(pop.textContent).not.toContain("Martial Arts");
  });

  it("the chevron carries the rotation class only while open", () => {
    const pop = openTip();
    const dagger = within(pop).getByRole("button", { name: "Dagger" });
    expect(dagger.querySelector(".rotate-90")).toBeNull();
    fireEvent.click(dagger);
    expect(dagger.querySelector(".rotate-90")).not.toBeNull();
  });

  it("renders the explanation in Italian too", async () => {
    await i18n.changeLanguage("it");
    const pop = openTip();
    fireEvent.click(within(pop).getByRole("button", { name: "Dagger" }));
    expect(pop.textContent).toContain("sostituisce il dado stampato dell'arma (1d4)");
  });
});
