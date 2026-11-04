/**
 * The table's optional flanking rule (M16, the campaign's «Regole» tab): with no
 * positions on the sheet, it is a melee attack fact the player taps, offered only
 * when the table switches it on: Advantage, or +2 to the attack roll.
 */
import { describe, expect, it } from "vitest";

import { evaluateGrants } from "@/lib/grants";
import { situationalAttackChips } from "@/lib/play/situations";
import {
  offeredSituations,
  resolveSituationalStateSources,
  situationKey,
} from "@/lib/situational-states";

const ids = (flanking?: "off" | "advantage" | "plus-2") =>
  offeredSituations(flanking).map((s) => s.id);

describe("flanking", () => {
  it("is offered only at a table that switches it on, in its variant", () => {
    expect(ids()).not.toContain("flanking");
    expect(ids("off")).not.toContain("flanking-plus-2");
    expect(ids("advantage")).toContain("flanking");
    expect(ids("advantage")).not.toContain("flanking-plus-2");
    expect(ids("plus-2")).toEqual(expect.arrayContaining(["flanking-plus-2"]));
  });

  it("the Advantage variant gives melee attacks Advantage, not ranged ones", () => {
    const melee = situationalAttackChips(
      ["flanking"],
      { source: "weapon", attackMode: "melee" },
      { hasSwimSpeed: false }
    );
    expect(melee.map((c) => c.mode)).toEqual(["advantage"]);
    expect(
      situationalAttackChips(
        ["flanking"],
        { source: "weapon", attackMode: "ranged" },
        { hasSwimSpeed: false }
      )
    ).toEqual([]);
  });

  it("the +2 variant adds 2 to melee weapon attack rolls while lit", () => {
    const lit = new Set([situationKey("flanking-plus-2")]);
    const bonuses = evaluateGrants(
      resolveSituationalStateSources(lit),
      lit
    ).weaponAttackBonuses;
    expect(bonuses).toEqual([expect.objectContaining({ amount: 2, scope: "melee" })]);
  });
});
