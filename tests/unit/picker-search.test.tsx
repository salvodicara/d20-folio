/**
 * PickerSearch (CO2) — the shared `.search` field for the add-modals.
 * Pins that the clear (×) control appears only when there's a query and that
 * pressing it resets the value via onChange("").
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PickerSearch } from "@/components/sheet/picker-parts";

describe("PickerSearch — clear control", () => {
  it("hides the clear button when the query is empty", () => {
    render(<PickerSearch value="" onChange={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /clear search/i })
    ).not.toBeInTheDocument();
  });

  it("shows the clear button when there's a query and resets on click", () => {
    const onChange = vi.fn();
    render(<PickerSearch value="fireball" onChange={onChange} />);
    const clear = screen.getByRole("button", { name: /clear search/i });
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith("");
  });
});
