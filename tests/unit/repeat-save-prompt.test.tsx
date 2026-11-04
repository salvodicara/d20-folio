/**
 * A repeat save waiting on its target's card: «Saved: end it» revokes the condition
 * effect with an undo that puts it back (under a fresh id) and the prompt with it;
 * «Failed: it stays» only closes the prompt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const io = vi.hoisted(() => ({
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  reinstatePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);
vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
const rules = vi.hoisted(() => ({ v26: false }));
vi.mock("@/lib/deployed-rules", () => ({ combatEffectsV26On: () => rules.v26 }));

import { RepeatSavePrompts } from "@/domains/combat/ui/RepeatSavePrompt";
import {
  useRepeatSaveStore,
  type PendingRepeatSave,
} from "@/features/campaigns/repeat-save-store";
import { useToastStore } from "@/stores/toastStore";

const save: PendingRepeatSave = {
  id: "e1",
  campaignId: "c1",
  conditionId: "frightened",
  targetId: "m1",
  targetName: "Goblin",
  ability: "WIS",
  at: "target-turn-end",
  dc: 15,
  effect: { id: "e1" } as PendingRepeatSave["effect"],
};

describe("RepeatSavePrompts", () => {
  beforeEach(() => {
    io.revokePersistentCombatEffect.mockClear();
    io.appendPersistentCombatEffect.mockClear();
    io.reinstatePersistentCombatEffect.mockClear();
    rules.v26 = false;
    useRepeatSaveStore.setState({ saves: [save] });
    useToastStore.setState({ toasts: [] });
  });

  it("shows only the saves of its combatants", () => {
    const { container } = render(<RepeatSavePrompts targetIds={["pc-a"]} locale="en" />);
    expect(container.textContent).toBe("");
  });

  it("names the save and what a success ends", () => {
    render(<RepeatSavePrompts targetIds={["m1"]} locale="en" />);
    expect(
      screen.getByText(
        /End of Goblin's turn: a successful Wisdom save \(DC 15\) ends Frightened\./
      )
    ).toBeTruthy();
  });

  it("says when the save came due: on damage with Advantage, at turn start, out of sight", () => {
    useRepeatSaveStore.setState({
      saves: [
        { ...save, id: "d", at: "target-damaged", advantage: true },
        { ...save, id: "s", targetId: "m2", targetName: "Ogre", at: "target-turn-start" },
        {
          ...save,
          id: "u",
          targetId: "m3",
          targetName: "Orc",
          when: "out-of-actor-sight",
          actorName: "Lyra",
        },
      ],
    });
    render(<RepeatSavePrompts targetIds={["m1", "m2", "m3"]} locale="en" />);
    expect(
      screen.getByText(
        "Goblin took damage: a successful Wisdom with Advantage save (DC 15) ends Frightened."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Start of Ogre's turn: a successful Wisdom save (DC 15) ends Frightened."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "End of Orc's turn: if it can't see Lyra, a successful Wisdom save (DC 15) ends Frightened."
      )
    ).toBeTruthy();
  });

  it("with the v0.26 rules, undo reinstates the same effect and its prompt", async () => {
    rules.v26 = true;
    render(<RepeatSavePrompts targetIds={["m1"]} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Saved: end it" }));
    useToastStore.getState().toasts[0]?.onUndo?.();
    await waitFor(() =>
      expect(io.reinstatePersistentCombatEffect).toHaveBeenCalledWith("c1", "e1")
    );
    expect(io.appendPersistentCombatEffect).not.toHaveBeenCalled();
    expect(useRepeatSaveStore.getState().saves.map((s) => s.id)).toEqual(["e1"]);
  });

  it("before the v0.26 rules, a success ends the condition; undo puts a copy back with its prompt", async () => {
    render(<RepeatSavePrompts targetIds={["m1"]} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Saved: end it" }));
    await waitFor(() =>
      expect(io.revokePersistentCombatEffect).toHaveBeenCalledWith("c1", "e1")
    );
    expect(useRepeatSaveStore.getState().saves).toEqual([]);
    const toast = useToastStore.getState().toasts[0];
    expect(toast?.message).toBe("Frightened ends: Goblin");
    toast?.onUndo?.();
    await waitFor(() => expect(io.appendPersistentCombatEffect).toHaveBeenCalledOnce());
    const [, effect] = io.appendPersistentCombatEffect.mock.calls[0] as unknown as [
      string,
      { id: string },
    ];
    expect(effect.id).not.toBe("e1");
    expect(useRepeatSaveStore.getState().saves.map((s) => s.id)).toEqual([effect.id]);
  });

  it("a failure keeps the condition and closes the prompt", () => {
    render(<RepeatSavePrompts targetIds={["m1"]} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Failed: it stays" }));
    expect(io.revokePersistentCombatEffect).not.toHaveBeenCalled();
    expect(useRepeatSaveStore.getState().saves).toEqual([]);
  });
});
