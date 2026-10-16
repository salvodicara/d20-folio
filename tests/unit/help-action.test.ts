/**
 * The Help action (SRD 5.2.1 "Help [Action]"): "Assist an Ability Check. Choose one
 * of your skill or tool proficiencies and one ally who is near enough for you to
 * assist ... That ally has Advantage on the next ability check they make with the
 * chosen skill or tool. This benefit expires if the ally doesn't use it before the
 * start of your next turn." / "Assist an Attack Roll. You momentarily distract an
 * enemy within 5 feet of you, giving Advantage to the next attack roll by one of your
 * allies against that enemy. This benefit expires at the start of your next turn."
 *
 * So the use names one creature, never yourself: an ally (the check) or an enemy
 * (the attack). Cases come from the real base-action table resolved for a sheet.
 * Blind spot: the encounter roster is a hand-built fixture (the encounter view has
 * its own suite), and whether the enemy is within 5 feet stays the table's call.
 */
import { describe, expect, it } from "vitest";
import { BASE_ACTIONS, resolveActions, type ResolvedAction } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { shouldResolveCombatAction } from "@/lib/combat-resolution";
import {
  targetStepFor,
  type TargetRoster,
} from "@/features/character/center/target-step";
import { helpBenefit, HELP_ACTION_ID } from "@/lib/play/help";
import { makeCharacterDoc } from "./_helpers";

const doc = makeCharacterDoc({ classes: [{ classId: "fighter", level: 3 }] });
const rows = new Map(
  resolveActions(doc, "spellbook").map((row) => [row.id, localizeAction(row, "en")])
);
function baseAction(id: string): ResolvedAction {
  const row = rows.get(id);
  if (!row) throw new Error(`no action for ${id}`);
  return row;
}

const SOLO: TargetRoster = { selfId: "pc-me", selfName: "Bren", rows: [] };
const FIGHT: TargetRoster = {
  selfId: "pc-me",
  selfName: "Bren",
  rows: [
    { id: "pc-me", kind: "pc", side: "ally", name: "Bren" },
    { id: "pc-cora", kind: "pc", side: "ally", name: "Coralino" },
    { id: "m-gob", kind: "monster", side: "enemy", name: "Goblin" },
    { id: "m-ogre", kind: "monster", side: "enemy", name: "Ogre" },
  ],
};

describe("Help names who it helps", () => {
  it("in a fight it offers the other allies and the enemies, one pick, never me", () => {
    const step = targetStepFor(baseAction(HELP_ACTION_ID), FIGHT);
    expect(step?.max).toBe(1);
    expect(step?.candidates.map((c) => [c.id, c.side])).toEqual([
      ["pc-cora", "ally"],
      ["m-gob", "enemy"],
      ["m-ogre", "enemy"],
    ]);
  });

  it("solo there is no creature to name, so it stays one tap", () => {
    expect(targetStepFor(baseAction(HELP_ACTION_ID), SOLO)).toBeNull();
  });

  it("it opens no resolver: the dice stay at the table", () => {
    expect(shouldResolveCombatAction(baseAction(HELP_ACTION_ID))).toBe(false);
  });

  it("no other base action without a consequence asks for a target", () => {
    // Situational base actions (Escape a Grapple shows only while Grappled) are
    // absent from a plain sheet's rows.
    const asking = BASE_ACTIONS.filter((ba) => rows.has(ba.id))
      .map((ba) => baseAction(ba.id))
      .filter((action) => !shouldResolveCombatAction(action))
      .filter((action) => targetStepFor(action, FIGHT) !== null)
      .map((action) => action.id);
    expect(asking).toEqual([HELP_ACTION_ID]);
  });

  it("the card carries both SRD options in its detail", () => {
    expect(baseAction(HELP_ACTION_ID).description).toBeTruthy();
  });
});

describe("helpBenefit", () => {
  it("an ally gets Advantage on their next ability check", () => {
    expect(helpBenefit(["pc-cora"], FIGHT.rows)).toEqual({
      kind: "check",
      name: "Coralino",
    });
  });

  it("an enemy gives the allies Advantage on their next attack against it", () => {
    expect(helpBenefit(["m-ogre"], FIGHT.rows)).toEqual({ kind: "attack", name: "Ogre" });
  });

  it("a row without a side follows its kind (a PC is an ally)", () => {
    expect(helpBenefit(["pc-x"], [{ id: "pc-x", kind: "pc", name: "Dana" }])).toEqual({
      kind: "check",
      name: "Dana",
    });
  });

  it("no pick, or a pick no longer in the fight, names nobody", () => {
    expect(helpBenefit([], FIGHT.rows)).toBeNull();
    expect(helpBenefit(["m-gone"], FIGHT.rows)).toBeNull();
  });
});
