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

  it("keeps a save while its effect lasts and its target's next turn hasn't come", () => {
    const saves = [save("e1", "m1"), save("e2", "m2")];
    expect(
      prunedRepeatSaves(saves, {
        currentCombatantId: "pc-a",
        active: new Set(["e1", "e2"]),
      })
    ).toEqual(saves);
  });

  it("drops a save whose effect ended, and one whose target's next turn began", () => {
    const saves = [save("e1", "m1"), save("e2", "m2")];
    expect(
      prunedRepeatSaves(saves, { currentCombatantId: "m2", active: new Set(["e2"]) }).map(
        (s) => s.id
      )
    ).toEqual([]);
  });

  it("answering removes it", () => {
    const { add, remove } = useRepeatSaveStore.getState();
    add(save("e1", "m1"));
    remove("e1");
    expect(useRepeatSaveStore.getState().saves).toEqual([]);
  });
});
