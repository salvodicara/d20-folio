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
import { useSaveTallyStore } from "@/features/campaigns/save-tally-store";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";

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

/**
 * A save track (Contagion: "After three successes, the spell ends; after three
 * failures, it lasts for the duration"; Flesh to Stone the same): each answer counts,
 * only the last one decides.
 */
describe("a tracked repeat save", () => {
  const tracked = { ...save, track: { successes: 3, failures: 3 } };
  const answer = (name: "Saved: end it" | "Failed: it stays") => {
    useRepeatSaveStore.setState({ saves: [tracked] });
    const view = render(<RepeatSavePrompts targetIds={["m1"]} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name }));
    view.unmount();
  };
  const tally = () => useSaveTallyStore.getState().tallies["c1:e1"];

  beforeEach(() => {
    io.revokePersistentCombatEffect.mockClear();
    useSaveTallyStore.setState({ tallies: {} });
    useToastStore.setState({ toasts: [] });
  });

  it("shows the count, and a success before the third only counts", () => {
    useSaveTallyStore.setState({ tallies: { "c1:e1": { successes: 1, failures: 2 } } });
    useRepeatSaveStore.setState({ saves: [tracked] });
    render(<RepeatSavePrompts targetIds={["m1"]} locale="en" />);
    expect(screen.getByText("Successes 1/3 · failures 2/3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Saved: end it" }));
    expect(io.revokePersistentCombatEffect).not.toHaveBeenCalled();
    expect(tally()).toEqual({ successes: 2, failures: 2 });
    expect(useRepeatSaveStore.getState().saves).toEqual([]);
  });

  it("the third success ends it and clears the count", async () => {
    useSaveTallyStore.setState({ tallies: { "c1:e1": { successes: 2, failures: 0 } } });
    answer("Saved: end it");
    await waitFor(() =>
      expect(io.revokePersistentCombatEffect).toHaveBeenCalledWith("c1", "e1")
    );
    expect(tally()).toBeUndefined();
  });

  it("the third failure settles it; undo puts the count and the prompt back", () => {
    useSaveTallyStore.setState({ tallies: { "c1:e1": { successes: 1, failures: 2 } } });
    answer("Failed: it stays");
    expect(tally()).toEqual({ successes: 1, failures: 3 });
    const toast = useToastStore.getState().toasts[0];
    expect(toast?.message).toBe("Frightened lasts its full duration: Goblin");
    toast?.onUndo?.();
    expect(tally()).toEqual({ successes: 1, failures: 2 });
    expect(useRepeatSaveStore.getState().saves.map((s) => s.id)).toEqual(["e1"]);
  });
});

/** Vision of Elapsing Eons: "on each failed save, the target gains 1 Exhaustion level". */
describe("what a failed repeat save does", () => {
  const eons = { ...save, onFail: [{ kind: "exhaustion" as const, levels: 1 }] };
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    useCharacterStore.getState().setCharacter({
      ...MOCK_CHARACTER,
      id: "char-1",
      session: { ...MOCK_CHARACTER.session, exhaustion: 1 },
    });
  });
  const fail = (s: PendingRepeatSave) => {
    useRepeatSaveStore.setState({ saves: [s] });
    render(<RepeatSavePrompts targetIds={["m1"]} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Failed: it stays" }));
  };
  const exhaustion = () => useCharacterStore.getState().character?.session.exhaustion;

  it("on my own character, the Exhaustion lands on my sheet, with an undo", () => {
    fail({ ...eons, targetName: "Lyra", characterId: "char-1" });
    expect(exhaustion()).toBe(2);
    const toast = useToastStore.getState().toasts.at(-1);
    expect(toast?.message).toBe("Lyra fails the save: +1 Exhaustion.");
    toast?.onUndo?.();
    expect(exhaustion()).toBe(1);
  });

  it("on a monster, the DM gets a note; no sheet changes", () => {
    fail(eons);
    expect(exhaustion()).toBe(1);
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe(
      "Goblin fails the save: +1 Exhaustion; keep track of it on the monster."
    );
  });
});

/** Flesh to Stone: "If it fails three of these saves, it is petrified". */
describe("a track settled into another condition", () => {
  const stone = {
    ...save,
    conditionId: "restrained",
    actorId: "monster-medusa",
    track: { successes: 3, failures: 3, settlesInto: "petrified" },
  };
  const settle = (s: PendingRepeatSave) => {
    useSaveTallyStore.setState({ tallies: { "c1:e1": { successes: 0, failures: 2 } } });
    useRepeatSaveStore.setState({ saves: [s] });
    render(<RepeatSavePrompts targetIds={["m1"]} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Failed: it stays" }));
  };
  beforeEach(() => {
    io.revokePersistentCombatEffect.mockClear();
    io.appendPersistentCombatEffect.mockClear();
    useToastStore.setState({ toasts: [] });
    useCharacterStore.getState().setCharacter({
      ...MOCK_CHARACTER,
      id: "char-1",
      session: { ...MOCK_CHARACTER.session, conditions: [] },
    });
  });

  it("a monster's Restrained ends and Petrified lands from the DM's device", async () => {
    settle(stone);
    await waitFor(() =>
      expect(io.appendPersistentCombatEffect).toHaveBeenCalledWith(
        "c1",
        expect.objectContaining({
          id: "e1:petrified",
          payload: { kind: "condition", conditionId: "petrified" },
        })
      )
    );
    expect(io.revokePersistentCombatEffect).toHaveBeenCalledWith("c1", "e1");
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe(
      "Restrained becomes Petrified: Goblin"
    );
  });

  it("on my own character, Petrified goes on my sheet; undo takes it off", () => {
    settle({ ...stone, targetName: "Lyra", characterId: "char-1" });
    const conditions = () =>
      useCharacterStore.getState().character?.session.conditions ?? [];
    expect(conditions()).toContain("petrified");
    expect(io.appendPersistentCombatEffect).not.toHaveBeenCalled();
    useToastStore.getState().toasts.at(-1)?.onUndo?.();
    expect(conditions()).not.toContain("petrified");
    expect(useSaveTallyStore.getState().tallies["c1:e1"]).toEqual({
      successes: 0,
      failures: 2,
    });
  });
});
