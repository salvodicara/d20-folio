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
import { SkillOrToolPicker } from "@/components/sheet/SkillOrToolPicker";
import { LanguageChoicePicker } from "@/components/sheet/LanguageChoicePicker";

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
    // A homogeneous skill pool needs no repeated category seal: it would add
    // no distinction between rows and falsely imply entity-level meaning.
    expect(container.querySelector(".wiz-socket")).toBeNull();
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
    expect(container.querySelector(".wiz-socket")).toBeNull();
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

describe("picker icon semantics — hierarchy before decoration", () => {
  it("groups a heterogeneous skill/tool pool and reserves seals for tool subtypes", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SkillOrToolPicker
        slots={[{ slotId: "slot-0", amount: 3 }]}
        picks={{}}
        onChange={onChange}
        existingSkillIds={new Set()}
      />
    );

    expect(screen.getByText("Skills", { selector: ".wiz-group" })).toBeInTheDocument();
    expect(screen.getByText("Tools", { selector: ".wiz-group" })).toBeInTheDocument();

    const skillRow = screen.getByRole("button", { name: /acrobatics/i });
    expect(skillRow.querySelector(".wiz-socket")).toBeNull();
    const toolRow = screen.getByRole("button", { name: /bagpipes/i });
    expect(toolRow.querySelector(".wiz-socket")).not.toBeNull();

    fireEvent.click(skillRow);
    expect(onChange).toHaveBeenCalledWith({ "slot-0": ["acrobatics"] });
    expect(container.querySelectorAll(".wiz-group")).toHaveLength(2);
  });

  it("does not repeat a Languages seal inside a homogeneous language pool", () => {
    const { container } = render(
      <LanguageChoicePicker
        slots={[
          {
            slotId: "slot-0",
            amount: 1,
            options: ["common", "elvish"],
          },
        ]}
        picks={{}}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /common/i })).toBeInTheDocument();
    expect(container.querySelector(".wiz-socket")).toBeNull();
  });
});
