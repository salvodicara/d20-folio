/**
 * L11 — ActivatableFeaturesBar render + interaction.
 *
 * The bar now consumes render-ready `ActivatableToggleVM`s from the tracker
 * presenter (`activatableToggles` — deduped + label-localized), so it makes no
 * locale read of its own; the dedupe/localize is covered in tracker-view.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActivatableFeaturesBar } from "@/features/character/molecules/ActivatableFeaturesBar";
import type { ActivatableToggleVM } from "@/lib/views/tracker-view";

const RAGE: ActivatableToggleVM = {
  key: "barbarian-rage",
  active: false,
  label: "Rage",
};

describe("ActivatableFeaturesBar", () => {
  it("renders nothing when there are no toggles", () => {
    const { container } = render(
      <ActivatableFeaturesBar toggles={[]} onToggle={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders one toggle per VM with its localized label", () => {
    render(<ActivatableFeaturesBar toggles={[RAGE]} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Rage" })).toBeInTheDocument();
  });

  it("reflects active state via aria-pressed", () => {
    render(
      <ActivatableFeaturesBar toggles={[{ ...RAGE, active: true }]} onToggle={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Rage" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("calls onToggle with the toggle key when clicked", () => {
    const onToggle = vi.fn();
    render(<ActivatableFeaturesBar toggles={[RAGE]} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Rage" }));
    expect(onToggle).toHaveBeenCalledWith("barbarian-rage");
  });

  // ── S5 — Bloodied-gate hint (override-first: hint, never hard-disable) ──────
  const BLOODIED_BOON: ActivatableToggleVM = {
    key: "boon-of-desperate-resilience-bloodied",
    active: false,
    label: "Bloodied — Defense",
    bloodiedGateUnmet: true,
  };

  it("S5 — a gate-unmet boon shows the Bloodied precondition but stays clickable", () => {
    const onToggle = vi.fn();
    render(<ActivatableFeaturesBar toggles={[BLOODIED_BOON]} onToggle={onToggle} />);
    const btn = screen.getByRole("button", { name: /Bloodied/i });
    // Override-first — the toggle is NEVER hard-disabled (a player keeps control).
    expect(btn).not.toBeDisabled();
    // The precondition is surfaced in the accessible title.
    expect(btn).toHaveAttribute("title", expect.stringMatching(/Bloodied/i));
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith("boon-of-desperate-resilience-bloodied");
  });

  it("S5 — a met gate (no flag) carries the standard hint, not the Bloodied one", () => {
    render(
      <ActivatableFeaturesBar
        toggles={[{ ...BLOODIED_BOON, bloodiedGateUnmet: undefined }]}
        onToggle={vi.fn()}
      />
    );
    const btn = screen.getByRole("button", { name: "Bloodied — Defense" });
    // The default active-features hint mentions toggling a feature, not the gate.
    expect(btn.getAttribute("title")).not.toMatch(/at or below half/i);
  });
});
