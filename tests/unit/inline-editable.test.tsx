/**
 * Tests for InlineEditable component
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InlineEditable } from "@/components/shared/InlineEditable";

describe("InlineEditable — read-only mode", () => {
  it("renders text value as plain span when not editable", () => {
    render(<InlineEditable type="text" value="Hello" onChange={vi.fn()} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders number value with format function when not editable", () => {
    render(
      <InlineEditable
        type="number"
        value={3}
        onChange={vi.fn()}
        format={(v) => `+${v}`}
      />
    );
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("renders select label (not value) when not editable", () => {
    render(
      <InlineEditable
        type="select"
        value="short"
        onChange={vi.fn()}
        options={[
          { value: "short", label: "Short Rest" },
          { value: "long", label: "Long Rest" },
        ]}
      />
    );
    expect(screen.getByText("Short Rest")).toBeInTheDocument();
  });

  // Regression (inventory #60): the editable number must be CONTROLLED — when the
  // value changes externally (e.g. a stack grows 60 → 80 by buying more bolts) the
  // editor must reflect the new value, not freeze at its first render. The old raw
  // `<input defaultValue>` was uncontrolled and showed a stale count.
  it("reflects an external value change while editable (controlled, not stale)", () => {
    const { rerender } = render(
      <InlineEditable type="number" editable value={60} onChange={vi.fn()} />
    );
    expect(screen.getByRole("button")).toHaveTextContent("60");
    rerender(<InlineEditable type="number" editable value={80} onChange={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveTextContent("80");
    expect(screen.queryByText("60")).not.toBeInTheDocument();
  });

  it("renders placeholder when text value is empty", () => {
    render(
      <InlineEditable
        type="text"
        value=""
        onChange={vi.fn()}
        editable
        placeholder="Enter name"
      />
    );
    expect(screen.getByText("Enter name")).toBeInTheDocument();
  });
});

describe("InlineEditable — edit mode (text)", () => {
  it("enters edit state on click when editable", () => {
    render(<InlineEditable type="text" value="Hello" onChange={vi.fn()} editable />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("textbox")).toHaveValue("Hello");
  });

  it("commits new value on blur", () => {
    const onChange = vi.fn();
    render(<InlineEditable type="text" value="Hello" onChange={onChange} editable />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "World" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("World");
  });

  it("commits on Enter key", () => {
    const onChange = vi.fn();
    render(<InlineEditable type="text" value="Hello" onChange={onChange} editable />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "New" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("New");
  });

  it("cancels on Escape key (no onChange call)", () => {
    const onChange = vi.fn();
    render(<InlineEditable type="text" value="Hello" onChange={onChange} editable />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Changed" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not call onChange if value unchanged", () => {
    const onChange = vi.fn();
    render(<InlineEditable type="text" value="Same" onChange={onChange} editable />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.blur(screen.getByRole("textbox"));
    expect(onChange).not.toHaveBeenCalled();
  });

  // Golden rule 20 — a `required` text field has a NON-EMPTY domain: clearing it
  // REVERTS to the prior value instead of persisting "". This is the cockpit name
  // field's constraint; the live WRITE source of the nameless-snapshot crash was a
  // name cleared to "" → fanned out as a nameless party snapshot.
  it("required: an empty commit REVERTS (never persists '') and re-shows the prior value", () => {
    const onChange = vi.fn();
    render(
      <InlineEditable type="text" value="Lyra" onChange={onChange} editable required />
    );
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    // The empty commit was swallowed — the store never sees "".
    expect(onChange).not.toHaveBeenCalled();
    // …and the field snapped back to the prior name (not blank).
    expect(screen.getByRole("button")).toHaveTextContent("Lyra");
  });

  it("required: a NON-empty edit still commits normally", () => {
    const onChange = vi.fn();
    render(
      <InlineEditable type="text" value="Lyra" onChange={onChange} editable required />
    );
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Bo" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("Bo");
  });

  it("without required, an empty commit clears the value (unchanged default behavior)", () => {
    const onChange = vi.fn();
    render(<InlineEditable type="text" value="Note" onChange={onChange} editable />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("InlineEditable — edit mode (number)", () => {
  it("enters edit state on click when editable", () => {
    render(<InlineEditable type="number" value={18} onChange={vi.fn()} editable />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("spinbutton")).toHaveValue(18);
  });

  it("clamps value to min/max", () => {
    const onChange = vi.fn();
    render(
      <InlineEditable
        type="number"
        value={10}
        onChange={onChange}
        editable
        min={1}
        max={20}
      />
    );
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it("ignores NaN input (no onChange call)", () => {
    const onChange = vi.fn();
    render(<InlineEditable type="number" value={10} onChange={onChange} editable />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  // B13 (GR20): entering edit mode must select-all the prior value, mirroring the
  // text variant — otherwise a typed digit INSERTS into "16" ("168") instead of
  // replacing it, and blur silently clamps the mangled number.
  it("select-alls the value on entering edit mode, mirroring the text variant", () => {
    const selectSpy = vi.spyOn(HTMLInputElement.prototype, "select");
    render(<InlineEditable type="number" value={16} onChange={vi.fn()} editable />);
    fireEvent.click(screen.getByRole("button"));
    expect(selectSpy).toHaveBeenCalled();
    selectSpy.mockRestore();
  });
});

describe("InlineEditable — override indicator", () => {
  it("shows override styling when value differs from computedValue", () => {
    render(
      <InlineEditable
        type="number"
        value={20}
        computedValue={16}
        onChange={vi.fn()}
        onReset={vi.fn()}
        editable
      />
    );
    // The editable button signals override via the folio carved-input recipe
    // (data-overridden) rather than the old Tailwind text-warning classes.
    const btn = screen.getByTitle("Click to override");
    expect(btn.className).toContain("inline-edit-btn");
    expect(btn).toHaveAttribute("data-overridden", "true");
  });

  it("shows reset button when overridden", () => {
    render(
      <InlineEditable
        type="number"
        value={20}
        computedValue={16}
        onChange={vi.fn()}
        onReset={vi.fn()}
        editable
      />
    );
    expect(screen.getByLabelText("Reset to auto-computed value")).toBeInTheDocument();
  });

  it("calls onReset when reset button clicked", () => {
    const onReset = vi.fn();
    render(
      <InlineEditable
        type="number"
        value={20}
        computedValue={16}
        onChange={vi.fn()}
        onReset={onReset}
        editable
      />
    );
    fireEvent.click(screen.getByLabelText("Reset to auto-computed value"));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("does not show override indicator when value equals computedValue", () => {
    render(
      <InlineEditable
        type="number"
        value={16}
        computedValue={16}
        onChange={vi.fn()}
        onReset={vi.fn()}
        editable
      />
    );
    expect(
      screen.queryByLabelText("Reset to auto-computed value")
    ).not.toBeInTheDocument();
  });
});

describe("InlineEditable — select variant", () => {
  it("renders as a dropdown when editable", () => {
    render(
      <InlineEditable
        type="select"
        value="short"
        onChange={vi.fn()}
        editable
        options={[
          { value: "short", label: "Short Rest" },
          { value: "long", label: "Long Rest" },
        ]}
      />
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("calls onChange when selection changes", () => {
    const onChange = vi.fn();
    render(
      <InlineEditable
        type="select"
        value="short"
        onChange={onChange}
        editable
        options={[
          { value: "short", label: "Short Rest" },
          { value: "long", label: "Long Rest" },
        ]}
      />
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "long" } });
    expect(onChange).toHaveBeenCalledWith("long");
  });
});

describe("InlineEditable — tooltip", () => {
  it("renders title attribute with tooltip text", () => {
    render(
      <InlineEditable
        type="number"
        value={18}
        onChange={vi.fn()}
        tooltip="Armor Class: your defense against attacks"
      />
    );
    expect(screen.getByText("18")).toHaveAttribute(
      "title",
      "Armor Class: your defense against attacks"
    );
  });
});
