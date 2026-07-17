/**
 * PoolSpendModal — rebuilt on the shared `ModalShell` (Radix-backed) + carved
 * `NumberStepper` (Phase-6 T2 / W1). It must read as a real accessible dialog
 * (named, ESC-dismissable), step the amount within [1, max], and emit the chosen
 * amount on confirm / nothing on cancel.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { PoolSpendModal } from "@/components/sheet/PoolSpendModal";

// `unit` is the stable TOKEN ("hp"); the modal localizes it at the render
// boundary (golden rule 7) → "HP" in EN, "PF" in IT.
const request = {
  featureName: "Lay on Hands",
  unit: "hp" as const,
  max: 25,
  defaultAmount: 5,
};

describe("PoolSpendModal", () => {
  it("renders nothing without a request", () => {
    const { container } = render(
      <PoolSpendModal request={null} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is an accessible dialog named by the feature", () => {
    render(<PoolSpendModal request={request} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName(/lay on hands/i);
  });

  it("localizes the unit TOKEN at the render boundary (hp → 'HP' in EN)", () => {
    render(<PoolSpendModal request={request} onConfirm={() => {}} onCancel={() => {}} />);
    // The "hp" token must render as "HP" (never the raw token) in the spend label.
    expect(screen.getByText(/how many HP are you spending\?/i)).toBeInTheDocument();
    // …and the remaining subtitle.
    expect(screen.getByText(/25 HP remaining/i)).toBeInTheDocument();
  });

  it("confirms the chosen amount (default, then stepped up)", () => {
    const onConfirm = vi.fn();
    render(
      <PoolSpendModal request={request} onConfirm={onConfirm} onCancel={() => {}} />
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /increase/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: /spend/i }));
    expect(onConfirm).toHaveBeenCalledWith(6); // default 5 + 1
  });

  it("clamps the amount to the remaining max", () => {
    const onConfirm = vi.fn();
    render(
      <PoolSpendModal
        request={{ ...request, defaultAmount: 25 }}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    const dialog = screen.getByRole("dialog");
    // Already at max → increase is disabled, confirm spends exactly max.
    expect(within(dialog).getByRole("button", { name: /increase/i })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: /spend/i }));
    expect(onConfirm).toHaveBeenCalledWith(25);
  });

  it("cancels via the Cancel button and via Escape", async () => {
    const onCancel = vi.fn();
    render(<PoolSpendModal request={request} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(2));
  });
});
