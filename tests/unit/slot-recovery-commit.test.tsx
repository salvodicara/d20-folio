/**
 * A cast's slot recovery on Play (M12): the dialog picks within the rule, and the
 * commit restores the picked slots with one undo.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayPrompts } from "@/domains/play/ui/PlayPrompts";
import { usePlayPromptStore } from "@/features/character/center/playPromptStore";
import { recoverSlots } from "@/features/character/center/slot-recovery-commit";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";

import { makeCharacterDoc } from "./_helpers";

afterEach(() => {
  useCharacterStore.setState({ character: null });
  usePlayPromptStore.setState({ open: {} });
  useUndoStore.getState().clear(null);
});

const used = () => useCharacterStore.getState().character?.session.spellSlots;

describe("recoverSlots", () => {
  it("restores the picked slots within the rule, and one undo spends them again", () => {
    const doc = makeCharacterDoc(
      {
        classId: "wizard",
        level: 9,
        spellSlots: [
          { level: 1, total: 4 },
          { level: 2, total: 3 },
          { level: 3, total: 3 },
        ],
      },
      { spellSlots: { "1": { used: 2 }, "2": { used: 1 }, "3": { used: 1 } } }
    );
    useCharacterStore.setState({ character: doc, readonly: false });
    const rule = { count: 2, maxSlotLevel: 2 };
    expect(recoverSlots(rule, [3], () => "x")).toBe(false);
    expect(recoverSlots(rule, [1, 2], () => "x")).toBe(true);
    expect(used()?.["1"]?.used).toBe(1);
    expect(used()?.["2"]?.used).toBe(0);
    useUndoStore.getState().undo();
    expect(used()?.["1"]?.used).toBe(2);
    expect(used()?.["2"]?.used).toBe(1);
  });
});

describe("Play's slot-recovery dialog", () => {
  it("counts slots against the spell's budget and answers with the picks", () => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    const onConfirm = vi.fn();
    usePlayPromptStore.setState({
      open: {
        "slot-recovery": {
          source: { custom: "Recovery" },
          rule: { count: 2, maxSlotLevel: 2 },
          expended: [
            { level: 1, expended: 2 },
            { level: 2, expended: 1 },
            { level: 3, expended: 1 },
          ],
          onConfirm,
          onCancel: vi.fn(),
        },
      },
    });
    render(<PlayPrompts locale="en" />);
    expect(screen.getByText("2 of 2 slots left")).toBeTruthy();
    // A 3rd-level slot is above the spell's ceiling: no row for it.
    expect(screen.queryByText("Level 3 slot")).toBeNull();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Increase" })[1] as HTMLElement
    );
    fireEvent.click(screen.getByRole("button", { name: "Recover" }));
    expect(onConfirm).toHaveBeenCalledWith([2]);
  });
});
