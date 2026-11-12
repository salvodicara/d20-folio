/**
 * Repeat saves at the end of a turn (#710's `fightConditionEnds`) wait on the target's
 * card until answered, until the effect is gone, or until that creature's next turn
 * starts. A save already waiting is not added twice.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  prunedRepeatSaves,
  useRepeatSaveStore,
  type PendingRepeatSave,
} from "@/features/campaigns/repeat-save-store";

const save = (id: string, targetId: string): PendingRepeatSave => ({
  id,
  campaignId: "c1",
  conditionId: "frightened",
  targetId,
  targetName: "Goblin",
  ability: "WIS",
  at: "target-turn-end",
  dc: 15,
  effect: { id } as PendingRepeatSave["effect"],
});

describe("pending repeat saves", () => {
  beforeEach(() => useRepeatSaveStore.setState({ saves: [] }));

  it("adds a due save once", () => {
    const { add } = useRepeatSaveStore.getState();
    add(save("e1", "m1"));
    add(save("e1", "m1"));
    expect(useRepeatSaveStore.getState().saves.map((s) => s.id)).toEqual(["e1"]);
  });

  it("one spell's two conditions on one target ask one save (Hideous Laughter)", () => {
    // Prone and Incapacitated from the same cast: one WIS save ends the spell.
    const of = (id: string, conditionId: string): PendingRepeatSave => ({
      ...save(id, "m1"),
      conditionId,
      effect: {
        id,
        source: { kind: "spell", id: "tashas-hideous-laughter", actionId: "cast-1" },
      } as PendingRepeatSave["effect"],
    });
    const { add } = useRepeatSaveStore.getState();
    add(of("e-prone", "prone"));
    add(of("e-incap", "incapacitated"));
    const saves = useRepeatSaveStore.getState().saves;
    expect(saves.map((s) => s.id)).toEqual(["e-prone"]);
    expect(saves[0]?.siblings?.map((e) => e.id)).toEqual(["e-incap"]);
  });

  it("keeps a save while its effect lasts and its target's next turn hasn't come", () => {
    const saves = [save("e1", "m1"), save("e2", "m2")];
    expect(
      prunedRepeatSaves(saves, {
        currentCombatantId: "pc-a",
        active: new Set(["e1", "e2"]),
      }).map((s) => s.id)
    ).toEqual(["e1", "e2"]);
  });

  it("drops a save whose effect ended, and one whose target's next turn began", () => {
    const saves = [save("e1", "m1"), save("e2", "m2")];
    expect(
      prunedRepeatSaves(saves, { currentCombatantId: "m2", active: new Set(["e2"]) }).map(
        (s) => s.id
      )
    ).toEqual([]);
  });

  it("damage on the target's own turn waits for its next turn, not this one", () => {
    const due = { ...save("e1", "m1"), at: "target-damaged" as const, turnSeen: "m1" };
    const active = new Set(["e1"]);
    const onOwnTurn = prunedRepeatSaves([due], { currentCombatantId: "m1", active });
    expect(onOwnTurn.map((s) => s.id)).toEqual(["e1"]);
    const later = prunedRepeatSaves(onOwnTurn, { currentCombatantId: "pc-a", active });
    expect(later.map((s) => s.id)).toEqual(["e1"]);
    expect(prunedRepeatSaves(later, { currentCombatantId: "m1", active })).toEqual([]);
  });

  it("a save due at the start of the target's turn waits through that turn only", () => {
    const due = { ...save("e1", "m1"), at: "target-turn-start" as const, turnSeen: "m1" };
    const active = new Set(["e1"]);
    expect(prunedRepeatSaves([due], { currentCombatantId: "m1", active })).toEqual([due]);
    expect(prunedRepeatSaves([due], { currentCombatantId: "pc-a", active })).toEqual([]);
  });

  it("answering removes it", () => {
    const { add, remove } = useRepeatSaveStore.getState();
    add(save("e1", "m1"));
    remove("e1");
    expect(useRepeatSaveStore.getState().saves).toEqual([]);
  });
});
