/**
 * CollapsibleSearch (W5) — the unified lens→field cockpit search.
 *
 * At rest it's a lens button and the input is OUT of the tab order; focusing
 * (or a live query) opens it; the clear button empties and keeps focus. This
 * pins that behaviour so the three tab searches that share it stay consistent.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { CollapsibleSearch } from "@/components/shared/CollapsibleSearch";

/** Controlled host — mirrors how the tabs wire value/onChange. */
function Host({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return <CollapsibleSearch value={v} onChange={setV} placeholder="Search spells…" />;
}

describe("CollapsibleSearch", () => {
  it("starts collapsed: the lens shows, the input is out of the tab order", () => {
    render(<Host />);
    const lens = screen.getByRole("button", { name: "Search spells…" });
    expect(lens).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByPlaceholderText("Search spells…")).toHaveAttribute(
      "tabindex",
      "-1"
    );
  });

  it("opens on focus and accepts a query", () => {
    render(<Host />);
    const input = screen.getByPlaceholderText("Search spells…");
    fireEvent.focus(input);
    expect(screen.getByRole("button", { name: "Search spells…" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    fireEvent.change(input, { target: { value: "fire" } });
    expect(input).toHaveValue("fire");
    expect(input).toHaveAttribute("tabindex", "0");
  });

  it("stays open while a query is present even after blur", () => {
    render(<Host initial="bless" />);
    const input = screen.getByPlaceholderText("Search spells…");
    fireEvent.blur(input);
    // A live query keeps it open (so it never collapses mid-search).
    expect(input).toHaveAttribute("tabindex", "0");
  });

  it("collapses on blur when empty", () => {
    render(<Host />);
    const input = screen.getByPlaceholderText("Search spells…");
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(input).toHaveAttribute("tabindex", "-1");
  });

  it("the clear button empties the query", () => {
    render(<Host initial="fire" />);
    const clear = screen.getByRole("button", { name: /clear/i });
    fireEvent.click(clear);
    expect(screen.getByPlaceholderText("Search spells…")).toHaveValue("");
  });

  it("shows no clear button when empty", () => {
    render(<Host />);
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });

  it("does not call onChange spuriously on mount", () => {
    const onChange = vi.fn();
    render(
      <CollapsibleSearch value="" onChange={onChange} placeholder="Search spells…" />
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
