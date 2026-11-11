/**
 * The dev campaign's full-table fight (the owner's campaign video): its turn order is the
 * engine's own sort of what has been rolled, never an order written by hand (a hand-written
 * one showed 19 · 15 · 15 · 17 · 17 once bonuses were added). The characters start
 * without a roll, so the order they slot into is computed with their real bonuses.
 */
import { describe, expect, it } from "vitest";

import { makeDevTableFight } from "@/features/campaigns/dev-fixture";
import { sortByInitiative } from "@/lib/play/encounter";

describe("makeDevTableFight", () => {
  const fight = makeDevTableFight();
  const rolled = fight.combatants.flatMap((c) =>
    c.kind === "monster" && c.initiative !== null
      ? [{ id: c.id, initiative: c.initiative }]
      : []
  );

  it("its order is the engine's sort of the rolled combatants", () => {
    expect(fight.order).toEqual(sortByInitiative(rolled).map((r) => r.id));
  });

  it("starts on the top of that order, before turns have begun", () => {
    expect(fight.currentCombatantId).toBe(fight.order?.[0]);
    expect(fight.clock?.turnsBegun).toBe(false);
  });

  it("every character is in the fight, still to roll", () => {
    expect(fight.combatants.filter((c) => c.kind === "pc")).toHaveLength(4);
    expect(fight.order?.some((id) => id.startsWith("pc-"))).toBe(false);
  });
});
