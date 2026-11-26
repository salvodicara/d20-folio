/**
 * The DM's «Iniziativa» dialog, opened from a monster line's number: type the new
 * initiative and save; nothing to save while the number is invalid or unchanged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { InitiativeDialog } from "@/domains/combat/ui/InitiativeDialog";

describe("InitiativeDialog", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  const open = () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <InitiativeDialog
        name="Wolf"
        count={2}
        value={13}
        onSave={onSave}
        onClose={onClose}
      />
    );
    return { onSave, onClose };
  };

  it("saves the typed number and closes", () => {
    const { onSave, onClose } = open();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(18);
    expect(onClose).toHaveBeenCalled();
  });

  it("has nothing to save while the number is unchanged or invalid", () => {
    open();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    expect(save).toHaveAttribute("aria-disabled", "true");
  });

  it("says the whole group moves", () => {
    open();
    expect(screen.getByText(/2 creatures/)).toBeInTheDocument();
  });
});
