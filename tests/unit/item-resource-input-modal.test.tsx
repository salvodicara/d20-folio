import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ItemResourceInputModal } from "@/components/sheet/ItemResourceInputModal";
import type { ResourceInputRequest } from "@/lib/resources";

const requests: ResourceInputRequest[] = [
  {
    kind: "capacity-roll",
    resourceId: "charges",
    roll: { dice: 1, sides: 6, modifier: 1 },
    min: 2,
    max: 7,
  },
  {
    kind: "initial-roll",
    resourceId: "charges",
    roll: { dice: 1, sides: 4 },
    min: 1,
    max: 4,
  },
  {
    kind: "recovery-roll",
    resourceId: "charges",
    roll: { dice: 2, sides: 4 },
    min: 2,
    max: 8,
  },
  { kind: "depletion-d20", resourceId: "charges", min: 1, max: 20 },
];

describe("ItemResourceInputModal", () => {
  it("renders nothing without a planner request", () => {
    render(
      <ItemResourceInputModal request={null} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders every entered fact with a distinct accessible formula and bounds", () => {
    render(
      <ItemResourceInputModal
        request={{ sourceName: "Volatile Wand", requests }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const dialog = screen.getByRole("dialog", { name: "Volatile Wand" });
    expect(
      within(dialog).getByRole("spinbutton", {
        name: /1d6 \+ 1.*capacity/i,
      })
    ).toHaveAttribute("aria-valuemax", "7");
    expect(
      within(dialog).getByRole("spinbutton", {
        name: /1d4.*starting amount/i,
      })
    ).toHaveAttribute("aria-valuemin", "1");
    expect(
      within(dialog).getByRole("spinbutton", {
        name: /2d4.*recovered/i,
      })
    ).toHaveAttribute("aria-valuemax", "8");
    expect(
      within(dialog).getByRole("spinbutton", {
        name: /d20.*last charge/i,
      })
    ).toHaveAttribute("aria-valuemax", "20");
    expect(screen.queryByText("charges")).not.toBeInTheDocument();
  });

  it("returns all clamped values atomically on Continue", () => {
    const onConfirm = vi.fn();
    render(
      <ItemResourceInputModal
        request={{ sourceName: "Volatile Wand", requests }}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    const dialog = screen.getByRole("dialog");
    const recovery = within(dialog).getByRole("spinbutton", {
      name: /2d4.*recovered/i,
    });
    fireEvent.focus(recovery);
    fireEvent.change(recovery, { target: { value: "99" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /continue/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const answer = onConfirm.mock.calls[0]?.[0] as ReadonlyMap<string, number>;
    expect(Object.fromEntries(answer)).toEqual({
      "capacity-roll": 2,
      "initial-roll": 1,
      "recovery-roll": 8,
      "depletion-d20": 10,
    });
  });

  it("cancels without confirming from the button or Escape", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const depletionRequest = requests[3];
    if (!depletionRequest) throw new Error("depletion request fixture missing");
    render(
      <ItemResourceInputModal
        request={{ sourceName: "Volatile Wand", requests: [depletionRequest] }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(2));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
