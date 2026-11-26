/**
 * The DM's monster card dialog: name, Armor Class and private notes in place, one
 * «Save» for what changed; the stat block below when the creature has one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { MonsterCardDialog } from "@/domains/combat/ui/MonsterCardDialog";

describe("MonsterCardDialog", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  const open = (statBlock?: React.ReactNode) => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <MonsterCardDialog
        monster={{ name: "Ogre", ac: 11, notes: "" }}
        statBlock={statBlock}
        onSave={onSave}
        onClose={onClose}
      />
    );
    return { onSave, onClose };
  };

  it("saves the edited fields and closes", () => {
    const { onSave, onClose } = open();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Grull" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "AC" }), {
      target: { value: "13" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "DM notes" }), {
      target: { value: "Hates fire" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ name: "Grull", ac: 13, notes: "Hates fire" });
    expect(onClose).toHaveBeenCalled();
  });

  it("has nothing to save while unchanged, or with an empty name or a bad AC", () => {
    open();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(screen.getByRole("textbox", { name: "AC" }), {
      target: { value: "x" },
    });
    expect(save).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(screen.getByRole("textbox", { name: "AC" }), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: " " },
    });
    expect(save).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the stat block when there is one", () => {
    open(<p>stat block here</p>);
    expect(screen.getByText("stat block here")).toBeInTheDocument();
  });
});
