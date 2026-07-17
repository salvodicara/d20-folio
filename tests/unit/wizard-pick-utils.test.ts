/**
 * `togglePick` — the bounded multi-pick toggle shared by both wizards
 * (CreationWizard + LevelUpWizard) and mirrored by the production OptionGrid:
 * toggling a present id removes it; a new id is appended; picking past the limit
 * FIFO-drops the OLDEST so the player never hits a dead-end.
 *
 * This is the PURE home of the FIFO-at-cap contract. The CreationWizard render
 * test (`create-cleric-feat-choices.test.tsx`) keeps a thin WIRING witness — that
 * the feat-spell picker wires this helper and the DOM ceremony (`data-picked`
 * moving from the dropped pick to the new one) reflects it — but the rule itself
 * is asserted here, cheaply, against the producing function.
 */
import { describe, it, expect } from "vitest";
import { togglePick } from "@/features/wizard/pick-utils";

describe("togglePick — bounded multi-pick (FIFO past the limit)", () => {
  it("appends a new id below the limit (no drop)", () => {
    expect(togglePick([], "a", 2)).toEqual(["a"]);
    expect(togglePick(["a"], "b", 2)).toEqual(["a", "b"]);
  });

  it("toggles OFF an already-present id (removes it, keeps order)", () => {
    expect(togglePick(["a", "b"], "a", 2)).toEqual(["b"]);
    expect(togglePick(["a", "b", "c"], "b", 3)).toEqual(["a", "c"]);
  });

  it("picking past a full slot FIFO-drops the OLDEST (the no-dead-end rule)", () => {
    // The canonical create-cleric regression: a full 2-cantrip slot, a third pick
    // drops the oldest (Guidance) rather than blocking.
    expect(togglePick(["guidance", "sacred-flame"], "light", 2)).toEqual([
      "sacred-flame",
      "light",
    ]);
  });

  it("FIFO drops as many as needed to honor a shrunk-below limit", () => {
    // Defensive: a smaller limit than the current pile sheds oldest-first until
    // the new id fits (length never exceeds the limit).
    expect(togglePick(["a", "b", "c"], "d", 2)).toEqual(["c", "d"]);
    expect(togglePick(["a", "b", "c"], "d", 1)).toEqual(["d"]);
  });

  it("a limit of 1 always keeps only the newest pick", () => {
    expect(togglePick(["a"], "b", 1)).toEqual(["b"]);
    expect(togglePick([], "a", 1)).toEqual(["a"]);
  });

  it("never mutates the input array (pure)", () => {
    const input = ["a", "b"];
    const out = togglePick(input, "c", 2);
    expect(input).toEqual(["a", "b"]); // unchanged
    expect(out).not.toBe(input);
  });
});
