/**
 * «Su» / «Giù» in the DM's «Iniziativa» dialog (Foundry's tracker: drag a combatant up
 * or down; ours a tap, for a tie the number cannot break): the line moves past the line
 * above or below as a whole, a group with it and never into another group; a hero still
 * to roll is not in the order, so not a place to move to.
 */
import { describe, expect, it } from "vitest";

import { lineNeighbourPlace } from "@/domains/combat/initiative-edit";

const order = ["ogre", "wolf-1", "wolf-2", "pc-kaela", "pc-selene"];
const rows = [
  { ids: ["ogre"] },
  { ids: ["wolf-1", "wolf-2"] },
  { ids: ["pc-kaela"] },
  { ids: ["pc-selene"] },
  { ids: ["pc-tib"] }, // still to roll: not in the order
];

describe("lineNeighbourPlace", () => {
  it("up: before the line above, a group counted as one line", () => {
    expect(lineNeighbourPlace(order, rows, ["pc-kaela"], "up")).toEqual({
      beforeId: "wolf-1",
    });
    expect(lineNeighbourPlace(order, rows, ["wolf-1", "wolf-2"], "up")).toEqual({
      beforeId: "ogre",
    });
  });

  it("down: after the line below, the end when that was the last", () => {
    expect(lineNeighbourPlace(order, rows, ["ogre"], "down")).toEqual({
      beforeId: "pc-kaela",
    });
    expect(lineNeighbourPlace(order, rows, ["pc-kaela"], "down")).toEqual({
      beforeId: null,
    });
  });

  it("no move past the ends, and none for a hero still to roll", () => {
    expect(lineNeighbourPlace(order, rows, ["ogre"], "up")).toBeNull();
    expect(lineNeighbourPlace(order, rows, ["pc-selene"], "down")).toBeNull();
    expect(lineNeighbourPlace(order, rows, ["pc-tib"], "up")).toBeNull();
  });
});
