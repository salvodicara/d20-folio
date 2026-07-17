/**
 * InfoCard atom — the ONE `.info-card` carved-vellum surface. Locks the contract
 * the ~19 migrated call sites rely on: the base class, the `flush` modifier,
 * extra `className` passthrough, the `as` element override (lists render the
 * surface on `ul`/`li`, a callout on `p`), and native-attribute forwarding.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InfoCard } from "@/components/shared/InfoCard";

describe("InfoCard", () => {
  it("renders a div with the .info-card class by default", () => {
    render(<InfoCard data-testid="c">body</InfoCard>);
    const el = screen.getByTestId("c");
    expect(el.tagName).toBe("DIV");
    expect(el).toHaveClass("info-card");
    expect(el).not.toHaveClass("flush");
  });

  it("adds `flush` and merges extra className", () => {
    render(
      <InfoCard flush className="flex flex-col gap-3" data-testid="c">
        body
      </InfoCard>
    );
    expect(screen.getByTestId("c")).toHaveClass("info-card", "flush", "flex", "flex-col");
  });

  it("renders the surface on the requested element (`as`)", () => {
    const { rerender } = render(
      <InfoCard as="ul" data-testid="c">
        <li>one</li>
      </InfoCard>
    );
    expect(screen.getByTestId("c").tagName).toBe("UL");
    rerender(
      <InfoCard as="p" data-testid="c">
        note
      </InfoCard>
    );
    expect(screen.getByTestId("c").tagName).toBe("P");
  });

  it("forwards native attributes (style, role, …) to the element", () => {
    render(
      <InfoCard role="status" style={{ marginBottom: "8px" }} data-testid="c">
        body
      </InfoCard>
    );
    const el = screen.getByTestId("c");
    expect(el).toHaveAttribute("role", "status");
    expect(el).toHaveStyle({ marginBottom: "8px" });
  });
});
