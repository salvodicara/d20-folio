/**
 * The DM's end-of-fight write-up on the new fight screen, at parity with the classic
 * «Save this fight to the Chronicle» dialog: a title (the date when left blank), the
 * DM's account, the outcome, the fight's record with removable lines; «Save to
 * Chronicle» hands back one chapter, «Skip» ends without saving.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", () => ({ appendChronicleChapter: vi.fn() }));

import type { EncounterClose } from "@/domains/combat/fight-write-up";
import { EndFightDialog } from "@/domains/combat/ui/EndFightDialog";

const lines = [
  { id: "l1", round: 1, text: "Kaela deals 8 damage to the Ogre" },
  { id: "l2", round: 2, text: "The Ogre misses" },
];

describe("EndFightDialog", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  const open = (
    onSave = vi.fn((close: EncounterClose) => Promise.resolve(void close))
  ) => {
    const onSkip = vi.fn();
    const onCancel = vi.fn();
    render(
      <EndFightDialog
        lines={lines}
        outcome="victory"
        onSave={onSave}
        onSkip={onSkip}
        onCancel={onCancel}
      />
    );
    return { onSave, onSkip, onCancel };
  };

  it("saves one chapter with the title, the account, the outcome and the kept lines", async () => {
    const { onSave } = open();
    fireEvent.change(screen.getByRole("textbox", { name: "Chapter title" }), {
      target: { value: "The bridge" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Your account of the fight" }), {
      target: { value: "Close call." },
    });
    fireEvent.click(screen.getByRole("button", { name: "The fight ends" }));
    const second = screen.getAllByRole("button", { name: "Remove this line" })[1];
    if (!second) throw new Error("no second line");
    fireEvent.click(second);
    fireEvent.click(screen.getByRole("button", { name: "Save to Chronicle" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const close = onSave.mock.calls[0]?.[0];
    if (!close) throw new Error("no close");
    expect(close.note).toBe("Close call.");
    expect(close.outcome).toBe("ended");
    expect(close.chapter).toContain("The bridge");
    expect(close.chapter).toContain("Kaela deals 8 damage to the Ogre");
    expect(close.chapter).not.toContain("The Ogre misses");
  });

  it("the outcome starts from the fight's own guess", () => {
    open();
    expect(
      screen.getByRole("button", { name: "The party is victorious" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("«Skip» ends without saving", () => {
    const { onSave, onSkip } = open();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("a refused save keeps the dialog open for a retry", async () => {
    const onSave = vi.fn((close: EncounterClose) =>
      Promise.reject(new Error(`offline: ${close.outcome}`))
    );
    open(onSave);
    const save = screen.getByRole("button", { name: "Save to Chronicle" });
    fireEvent.click(save);
    await waitFor(() => expect(save).not.toHaveAttribute("aria-disabled", "true"));
    expect(screen.getByRole("textbox", { name: "Chapter title" })).toBeInTheDocument();
  });
});
