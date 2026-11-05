/**
 * The Play dialog for a use on another creature's roll (Cutting Words): «Su chi?»
 * lists the living creatures in the fight, enemies first (a Bard cuts an enemy's
 * roll), never the user; «Su quale tiro?» lists the rolls the use can touch. Out of
 * a fight it asks only the roll.
 */
import { describe, expect, it } from "vitest";

import { rollReactionView } from "@/features/character/center/roll-reaction-view";
import type { RollReaction } from "@/lib/play/roll-reactions";

const cutting: RollReaction = {
  kind: "die",
  die: "1d8",
  operations: ["subtract"],
  rolls: ["attack", "check", "damage"],
  whose: "other",
  timing: "before-outcome",
};

const fight = {
  myId: "pc-me",
  rows: [
    { id: "pc-me", kind: "pc" as const, name: "Lyra" },
    { id: "pc-bren", kind: "pc" as const, name: "Bren" },
    { id: "m-gob", kind: "monster" as const, name: "Goblin" },
    { id: "m-ogre", kind: "monster" as const, name: "Ogre", down: true },
  ],
};

describe("rollReactionView", () => {
  it("in a fight: the living others, enemies first, and the rolls it touches", () => {
    expect(rollReactionView(cutting, fight)).toEqual({
      targets: [
        { id: "m-gob", name: "Goblin", side: "enemy", self: false },
        { id: "pc-bren", name: "Bren", side: "ally", self: false },
      ],
      rolls: ["attack", "check", "damage"],
      operations: ["subtract"],
      die: "1d8",
    });
  });

  it("out of a fight: only the roll", () => {
    expect(rollReactionView(cutting, null)).toMatchObject({ targets: [] });
  });

  it("a use on your own roll asks no target", () => {
    expect(rollReactionView({ ...cutting, whose: "self" }, fight)).toMatchObject({
      targets: [],
    });
  });

  it("a reroll has no die to show", () => {
    expect(
      rollReactionView({ kind: "reroll", rolls: ["save"], whose: "any" }, null)
    ).toBeNull();
  });
});
