/**
 * SectionHeader atom — the ONE `.sec-head` rubric (diamond ◆ + display-italic
 * title + fading rule + optional icon/meta). Locks the contract the ~15 migrated
 * call sites rely on: heading level, the `id` landing on the heading (for
 * `<section aria-labelledby>`), meta rendering, and native-attribute passthrough
 * (e.g. the combat economy `data-econ` tint).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeader } from "@/components/shared/SectionHeader";

describe("SectionHeader", () => {
  it("renders the title at the requested heading level (default h3)", () => {
    const { rerender } = render(<SectionHeader title="Spells" />);
    expect(screen.getByRole("heading", { level: 3, name: "Spells" })).toBeInTheDocument();

    rerender(<SectionHeader as="h2" title="Party" />);
    expect(screen.getByRole("heading", { level: 2, name: "Party" })).toBeInTheDocument();
  });

  it("places `id` on the heading so a labelled section can target it", () => {
    render(
      <section aria-labelledby="party-head">
        <SectionHeader as="h2" id="party-head" title="Party" />
      </section>
    );
    const heading = screen.getByRole("heading", { name: "Party" });
    expect(heading).toHaveAttribute("id", "party-head");
    // The wrapping section resolves its accessible name through that id.
    expect(screen.getByRole("region", { name: "Party" })).toBeInTheDocument();
  });

  it("renders meta only when provided", () => {
    const { rerender, container } = render(<SectionHeader title="Features" />);
    expect(container.querySelector(".sec-meta")).toBeNull();

    rerender(<SectionHeader title="Features" meta="3/8" />);
    expect(container.querySelector(".sec-meta")?.textContent).toBe("3/8");
  });

  it("forwards native root attributes (e.g. data-econ) to the .sec-head", () => {
    const { container } = render(
      <SectionHeader tight data-econ="reaction" title="Reactions" />
    );
    const head = container.querySelector(".sec-head");
    expect(head).toHaveClass("tight");
    expect(head).toHaveAttribute("data-econ", "reaction");
  });
});
