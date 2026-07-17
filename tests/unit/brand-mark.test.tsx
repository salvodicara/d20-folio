/**
 * BrandMark / D20Mark tests (logo lockup).
 *
 * Locks the brand component's behaviour: variant geometry, accessible naming
 * (decorative-by-default mark vs labelled mark vs wordmark text), size wiring,
 * and per-instance gradient-id namespacing so two gilt marks never collide in
 * the SVG <defs> registry. The coverage gate is logic-only, so these are
 * behaviour locks per CLAUDE rule 2 rather than threshold movers.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandMark, D20Mark } from "@/components/ui/brand-mark";

describe("D20Mark", () => {
  it("renders the line variant as a currentColor single-stroke die by default", () => {
    const { container } = render(<D20Mark label="logo" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveClass("brand-d20");
    expect(svg).not.toHaveClass("brand-d20-gilt");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    // viewBox is the shared 100-grid d20 net — the line + gilt marks use the SAME
    // derived face-on icosahedron geometry (pointy-top hexagon + the true 10-face
    // projection) so the bare mark reads unmistakably as a d20 even at favicon size.
    expect(svg).toHaveAttribute("viewBox", "0 0 100 100");
  });

  it("renders the gilt variant with gradient fills on a 100-grid", () => {
    const { container } = render(<D20Mark variant="gilt" label="logo" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("brand-d20", "brand-d20-gilt");
    expect(svg).toHaveAttribute("viewBox", "0 0 100 100");
    // the struck "20" face proves we drew the faceted die, not the line glyph.
    expect(screen.getByText("20")).toBeInTheDocument();
    // gradient defs exist.
    expect(container.querySelectorAll("linearGradient").length).toBeGreaterThan(0);
    expect(container.querySelector("radialGradient")).not.toBeNull();
  });

  it("is decorative (aria-hidden) when no label is given", () => {
    const { container } = render(<D20Mark />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
  });

  it("exposes an accessible image with the given label", () => {
    render(<D20Mark label="d20 Folio" />);
    expect(screen.getByRole("img", { name: "d20 Folio" })).toBeInTheDocument();
  });

  it("maps each size step to a concrete pixel width/height", () => {
    const { container, rerender } = render(<D20Mark size="sm" />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "24");
    rerender(<D20Mark size="xl" />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "88");
  });

  it("namespaces gilt gradient ids per instance so two marks never collide", () => {
    const { container } = render(
      <>
        <D20Mark variant="gilt" />
        <D20Mark variant="gilt" />
      </>
    );
    const ids = Array.from(container.querySelectorAll("linearGradient,radialGradient"))
      .map((n) => n.id)
      .filter(Boolean);
    expect(ids.length).toBeGreaterThan(1);
    // every id is unique → no cross-instance fill bleed.
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("BrandMark", () => {
  it("renders the wordmark text by default with the d20/Folio split", () => {
    render(<BrandMark />);
    expect(screen.getByText("d20")).toBeInTheDocument();
    expect(screen.getByText("Folio")).toBeInTheDocument();
  });

  it("hides the mark from AT when the wordmark text is present (no double-naming)", () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector("svg");
    // the visible wordmark names the lockup; the mark stays decorative.
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("labels the bare mark when the wordmark is suppressed", () => {
    render(<BrandMark showWordmark={false} label="d20 Folio" />);
    expect(screen.getByRole("img", { name: "d20 Folio" })).toBeInTheDocument();
    expect(screen.queryByText("Folio")).not.toBeInTheDocument();
  });

  it("applies the size modifier class to the lockup wrapper", () => {
    const { container } = render(<BrandMark size="lg" />);
    expect(container.querySelector(".brand-lockup")).toHaveClass("brand-lg");
  });

  it("forwards a custom className onto the lockup", () => {
    const { container } = render(<BrandMark className="custom-x" />);
    expect(container.querySelector(".brand-lockup")).toHaveClass("custom-x");
  });

  it("can render the gilt mark inside the lockup", () => {
    const { container } = render(<BrandMark variant="gilt" />);
    expect(container.querySelector(".brand-d20-gilt")).not.toBeNull();
  });
});
