/**
 * CollapsibleSearch — the lens is a TRUE toggle (owner bug, 2026-07-31): with
 * the field open, clicking the lens CLOSES it (clearing any query) instead of
 * flashing shut-and-reopen; with it closed, clicking opens and focuses.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import { CollapsibleSearch } from "@/components/shared/CollapsibleSearch";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <CollapsibleSearch value={value} onChange={setValue} placeholder="Search" />;
}

describe("CollapsibleSearch toggle", () => {
  it("opens and focuses from rest", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });

  it("closes when clicked while open (focused, empty)", () => {
    render(<Harness />);
    const input = screen.getByRole("searchbox");
    act(() => input.focus());
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(document.activeElement).not.toBe(input);
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("closes AND clears when clicked while open with a query", () => {
    render(<Harness initial="dagger" />);
    const input = screen.getByRole("searchbox");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(input).toHaveValue("");
    expect(document.activeElement).not.toBe(input);
  });
});
