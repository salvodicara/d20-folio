/**
 * L12 — GrantBundleSelector render + interaction.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GrantBundleSelector } from "@/components/sheet/GrantBundleSelector";
import type { GrantBundle } from "@/lib/grants";
import { litText } from "@/lib/loc-text";

const TERRAIN: GrantBundle = {
  bundleKey: "druid-land-terrain",
  sourceId: "druid-land-circle-spells",
  label: litText({ en: "Land Type", it: "Tipo di Terra" }),
  options: [
    { id: "arid", label: litText({ en: "Arid", it: "Arida" }) },
    { id: "polar", label: litText({ en: "Polar", it: "Polare" }) },
  ],
  selected: null,
  choiceFrequency: "rest",
};

describe("GrantBundleSelector", () => {
  it("renders nothing with no bundles", () => {
    const { container } = render(
      <GrantBundleSelector bundles={[]} locale="en" onSelect={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders one button per option with the locale label", () => {
    render(<GrantBundleSelector bundles={[TERRAIN]} locale="en" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Arid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Polar" })).toBeInTheDocument();
  });

  it("marks the selected option via aria-pressed", () => {
    render(
      <GrantBundleSelector
        bundles={[{ ...TERRAIN, selected: "polar" }]}
        locale="en"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Polar" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Arid" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("calls onSelect with (bundleKey, optionId) when clicked", () => {
    const onSelect = vi.fn();
    render(<GrantBundleSelector bundles={[TERRAIN]} locale="en" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Arid" }));
    expect(onSelect).toHaveBeenCalledWith("druid-land-terrain", "arid");
  });

  it("shows one selector when two bundles share a key", () => {
    render(
      <GrantBundleSelector
        bundles={[TERRAIN, { ...TERRAIN, sourceId: "druid-land-natures-ward" }]}
        locale="en"
        onSelect={vi.fn()}
      />
    );
    // De-duplicated → only one Arid button.
    expect(screen.getAllByRole("button", { name: "Arid" })).toHaveLength(1);
  });
});
