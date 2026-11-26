/**
 * The DM's «Iniziativa» dialog, S3: on a hero's line the DM types the d20 a player
 * rolled without the app (the total shows with the hero's bonus); «Su» / «Giù» move the
 * line one place for a tie, and are absent where there is nowhere to go.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { InitiativeDialog } from "@/domains/combat/ui/InitiativeDialog";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});

describe("a hero's line", () => {
  const open = () => {
    const onSave = vi.fn();
    render(
      <InitiativeDialog
        name="Kaela"
        count={1}
        value={null}
        hero={{ bonus: 3 }}
        onSave={onSave}
        onClose={() => {}}
      />
    );
    return { onSave };
  };

  it("takes the d20 and shows the total with the bonus", () => {
    const { onSave } = open();
    fireEvent.change(screen.getByRole("textbox", { name: "d20 roll" }), {
      target: { value: "14" },
    });
    expect(screen.getByText("Bonus +3 · total 17")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(14);
  });

  it("a d20 is 1 to 20", () => {
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "d20 roll" }), {
      target: { value: "21" },
    });
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });
});

describe("«Su» / «Giù»", () => {
  it("move the line and close; absent where there is nowhere to go", () => {
    const onUp = vi.fn();
    const onClose = vi.fn();
    render(
      <InitiativeDialog
        name="Wolf"
        count={2}
        value={13}
        onSave={() => {}}
        onUp={onUp}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    expect(onUp).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Move down" })).toBeNull();
  });
});
