/**
 * RunicEmptyState — the shared empty-state hero. Covers the `titleEmphasis`
 * gold-rubric slot added in T6/H5.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Compass } from "lucide-react";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";

describe("RunicEmptyState — titleEmphasis", () => {
  it("wraps the emphasised word in an <em> within the title", () => {
    render(
      <RunicEmptyState glyph={Compass} title="Your folio awaits" titleEmphasis="folio" />
    );
    const heading = screen.getByRole("heading", { name: /your folio awaits/i });
    const em = heading.querySelector("em");
    expect(em).not.toBeNull();
    expect(em?.textContent).toBe("folio");
  });

  it("renders a plain title when no emphasis is given", () => {
    render(<RunicEmptyState glyph={Compass} title="Nothing here" />);
    const heading = screen.getByRole("heading", { name: "Nothing here" });
    expect(heading.querySelector("em")).toBeNull();
  });
});
