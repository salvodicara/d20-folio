/**
 * The Scontro tab's «Tira l'iniziativa» (rehearsal, 2026-11-13): the dialog showed «+0»
 * until the party's sheets were read, and a roll confirmed then was ordered and
 * reported without the bonus. While the bonus is not known the dialog says so and
 * «Conferma» waits; once known it shows it and the total.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RollDialog } from "@/domains/combat/ui/FightActions";

describe("the initiative roll dialog", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  it("bonus not known yet: no +0, and Confirm waits", () => {
    const onRoll = vi.fn();
    render(<RollDialog bonus={null} onClose={() => {}} onRoll={onRoll} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "12" } });
    expect(screen.queryByText(/\+0/)).toBeNull();
    expect(screen.getByText(/Reading the party/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onRoll).not.toHaveBeenCalled();
  });

  it("bonus known: the total with it, and Confirm rolls", () => {
    const onRoll = vi.fn();
    render(<RollDialog bonus={3} onClose={() => {}} onRoll={onRoll} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "12" } });
    expect(screen.getByText(/With your bonus \(\+3\): 15/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onRoll).toHaveBeenCalledWith(12);
  });
});
