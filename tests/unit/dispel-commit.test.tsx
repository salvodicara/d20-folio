/**
 * Dispel Magic on Play (M17): the dialog lists the target's spells with what ending
 * each takes, and the commit revokes the chosen spell's effects with one undo.
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
const io = vi.hoisted(() => ({
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  reinstatePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...io,
}));

import { PlayPrompts } from "@/domains/play/ui/PlayPrompts";
import { dispelSpell } from "@/features/character/center/dispel-commit";
import { usePlayPromptStore } from "@/features/character/center/playPromptStore";
import { useUndoStore } from "@/stores/undoStore";

afterEach(() => {
  vi.unstubAllEnvs();
  usePlayPromptStore.setState({ open: {} });
  useUndoStore.getState().clear(null);
  io.revokePersistentCombatEffect.mockClear();
  io.reinstatePersistentCombatEffect.mockClear();
});

describe("dispelSpell", () => {
  it("revokes every effect of the spell, and the undo reinstates them", () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    expect(dispelSpell("camp", ["b", "c"], "Hold Person ends")).toBe(true);
    expect(io.revokePersistentCombatEffect.mock.calls).toEqual([
      ["camp", "b"],
      ["camp", "c"],
    ]);
    useUndoStore.getState().undo();
    expect(io.reinstatePersistentCombatEffect.mock.calls).toEqual([
      ["camp", "b"],
      ["camp", "c"],
    ]);
  });
});

describe("Play's Dispel Magic dialog", () => {
  it("says which spells end and which need the check, and answers with the pick", () => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    const onConfirm = vi.fn();
    usePlayPromptStore.setState({
      open: {
        dispel: {
          source: { custom: "Dispel Magic" },
          targetName: "Ogre",
          options: [
            { spellId: "bless", level: 1, effectIds: ["a"], outcome: { kind: "ends" } },
            {
              spellId: "hold-person",
              level: 5,
              effectIds: ["b", "c"],
              outcome: { kind: "check", dc: 15 },
            },
          ],
          onConfirm,
          onCancel: vi.fn(),
        },
      },
    });
    render(<PlayPrompts locale="en" />);
    expect(screen.getByText("Which spell on Ogre?")).toBeTruthy();
    expect(screen.getByText("Spellcasting ability check, DC 15")).toBeTruthy();
    fireEvent.click(screen.getByText("Hold Person"));
    fireEvent.click(screen.getByRole("button", { name: "Check succeeded: end it" }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ spellId: "hold-person", effectIds: ["b", "c"] })
    );
  });
});
