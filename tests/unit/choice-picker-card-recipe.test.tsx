/**
 * The choice pickers (creation + level-up choice resolvers) all render the ONE
 * wizard-F pick list (`WizardPickList` → `.wiz-pick` with `.wiz-row` fact rows
 * in the carved grid) and nothing else — no wrapping box. They USED to each
 * hand-write a raw card div, then shared `OptionGrid`; C1 (owner 2026-06-11)
 * moved every in-wizard pick onto the F family so all pickers read as one mind.
 *
 * These render tests pin: (1) the picker is BOXLESS and F-familied, and
 * (2) toggle behaviour. ExpertiseChoicePicker + SkillChoicePicker are the two
 * representative shapes (proficiency-gated pool vs. options-gated pool).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExpertiseChoicePicker } from "@/components/sheet/ExpertiseChoicePicker";
import { SkillChoicePicker } from "@/components/sheet/SkillChoicePicker";

describe("ExpertiseChoicePicker — unified boxless picker", () => {
  const slots = [{ slotId: "slot-0", amount: 1 }] as const;

  it("renders the unified card picker with no wrapping box", () => {
    const { container } = render(
      <ExpertiseChoicePicker
        slots={slots}
        picks={{}}
        onChange={vi.fn()}
        proficientSkillIds={new Set(["acrobatics", "stealth"])}
      />
    );
    // Boxless: neither the old ChoicePickerCard box nor the raw-Tailwind div.
    expect(container.querySelector(".choice-picker-card")).toBeNull();
    expect(
      container.querySelector(".border-border-subtle.bg-bg-secondary\\/50")
    ).toBeNull();
    // It IS the shared wizard-F pick list (gold-socket `.wiz-row` rows).
    expect(container.querySelector(".wiz-pick")).not.toBeNull();
    expect(container.querySelector(".wiz-row")).not.toBeNull();
  });

  it("toggles a proficient skill within the slot budget (behaviour unchanged)", () => {
    const onChange = vi.fn();
    render(
      <ExpertiseChoicePicker
        slots={slots}
        picks={{}}
        onChange={onChange}
        proficientSkillIds={new Set(["acrobatics"])}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /acrobatics/i }));
    expect(onChange).toHaveBeenCalledWith({ "slot-0": ["acrobatics"] });
  });

  it("FACT rows reserve the check medallion in the DOM even while UNPICKED (owner fb4: appear/disappear is one symmetric transition; the label never shifts)", () => {
    const { container } = render(
      <ExpertiseChoicePicker
        slots={slots}
        picks={{}}
        onChange={vi.fn()}
        proficientSkillIds={new Set(["acrobatics", "stealth"])}
      />
    );
    // No pick yet — every fact row still carries its (CSS-hidden) medallion.
    const rows = container.querySelectorAll(".wiz-row.wiz-row-fact");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.querySelector(".wiz-row-check")).not.toBeNull();
    }
    // And no bookless fact entry sprouts the open-book affordance whose
    // clearance used to push the check adrift mid-row.
    expect(container.querySelector(".wiz-book")).toBeNull();
  });
});

describe("SkillChoicePicker — folio card recipe", () => {
  const slots = [
    { slotId: "slot-0", amount: 1, options: ["arcana", "history"] },
  ] as const;

  it("renders the unified card picker with no wrapping box", () => {
    const { container } = render(
      <SkillChoicePicker
        slots={slots}
        picks={{}}
        onChange={vi.fn()}
        existingSkillIds={new Set()}
      />
    );
    expect(container.querySelector(".choice-picker-card")).toBeNull();
    expect(
      container.querySelector(".border-border-subtle.bg-bg-secondary\\/50")
    ).toBeNull();
    expect(container.querySelector(".wiz-pick")).not.toBeNull();
    expect(container.querySelector(".wiz-row")).not.toBeNull();
  });

  it("keeps the search box and selection toggle working after the refactor", () => {
    const onChange = vi.fn();
    // A full (>12) pool so the (now decluttered) search box is shown; short lists
    // intentionally hide it.
    render(
      <SkillChoicePicker
        slots={[{ slotId: "slot-0", amount: 1, options: [] }]}
        picks={{}}
        onChange={onChange}
        existingSkillIds={new Set()}
      />
    );
    // Search still narrows the option pool.
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "arcana" },
    });
    const arcana = screen.getByRole("button", { name: /arcana/i });
    fireEvent.click(arcana);
    expect(onChange).toHaveBeenCalledWith({ "slot-0": ["arcana"] });
  });
});
