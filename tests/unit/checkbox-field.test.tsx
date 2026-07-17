import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CheckboxField } from "@/components/ui/selection";

/**
 * CheckboxField is the ONE labelled checkbox that replaced ~16 raw native
 * `<input type=checkbox>` rows. The native rows toggled when you clicked their
 * wrapping `<label>` text and were named by it for free; a Radix `role=checkbox`
 * button gets neither automatically, so these tests pin that the `id`/`htmlFor`
 * association restores BOTH — the exact regression the audit flagged.
 */
describe("CheckboxField", () => {
  it("exposes its label as the checkbox's accessible name", () => {
    render(
      <CheckboxField checked={false} onCheckedChange={() => {}} label="Concentration" />
    );
    expect(screen.getByRole("checkbox", { name: "Concentration" })).toBeInTheDocument();
  });

  it("toggles when the LABEL TEXT is clicked (not just the box)", () => {
    const onChange = vi.fn();
    render(<CheckboxField checked={false} onCheckedChange={onChange} label="Verbal" />);
    fireEvent.click(screen.getByText("Verbal"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("emits a real boolean (Radix 'indeterminate' is coerced away)", () => {
    const onChange = vi.fn();
    render(<CheckboxField checked={true} onCheckedChange={onChange} label="Somatic" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Somatic" }));
    expect(onChange).toHaveBeenCalledWith(false);
    expect(typeof onChange.mock.calls[0]?.[0]).toBe("boolean");
  });

  it("reflects the checked state and honours disabled", () => {
    render(<CheckboxField checked disabled onCheckedChange={() => {}} label="Locked" />);
    const box = screen.getByRole("checkbox", { name: "Locked" });
    expect(box).toHaveAttribute("data-state", "checked");
    expect(box).toBeDisabled();
  });

  it("renders the optional hint beneath the label", () => {
    render(
      <CheckboxField
        checked={false}
        onCheckedChange={() => {}}
        label="Track uses"
        hint="Adds a usage tracker"
      />
    );
    expect(screen.getByText("Adds a usage tracker")).toBeInTheDocument();
  });
});
