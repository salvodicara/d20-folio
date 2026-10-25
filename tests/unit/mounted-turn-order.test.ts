/**
 * SRD 5.2.1 Mounted Combat: a controlled mount's initiative changes to match the
 * rider's while it carries it; it acts right after the rider. An independent mount
 * keeps its own turn. Begin Turns freezes the order with each controlled mount moved
 * after its rider (`mountedTurnOrder`).
 */
import { describe, expect, it } from "vitest";

import {
  addMonster,
  beginEncounterTurns,
  startEncounter,
} from "@/features/campaigns/encounter";
import type { EncounterState } from "@/types/campaign";

function fight(controlled: boolean): { enc: EncounterState; rider: string } {
  let enc = startEncounter(
    { mara: { characterId: "char-mara" } },
    ["mara"],
    1_717_000_000_000
  );
  enc = addMonster(enc, { name: "Warhorse", ac: 11, maxHp: 19, count: 1, initiative: 5 });
  enc = addMonster(enc, { name: "Goblin", ac: 13, maxHp: 7, count: 1, initiative: 12 });
  const rider = enc.combatants.find((c) => c.kind === "pc")?.id ?? "";
  return {
    enc: { ...enc, mounts: [{ mountId: "monster-1", riderId: rider, controlled }] },
    rider,
  };
}

describe("Begin Turns with a mount", () => {
  it("a controlled mount acts right after its rider", () => {
    const { enc, rider } = fight(true);
    const begun = beginEncounterTurns(enc, [rider, "monster-2", "monster-1"]);
    expect(begun.order).toEqual([rider, "monster-1", "monster-2"]);
    expect(begun.currentCombatantId).toBe(rider);
  });

  it("an independent mount keeps its own turn", () => {
    const { enc, rider } = fight(false);
    expect(beginEncounterTurns(enc, [rider, "monster-2", "monster-1"]).order).toEqual([
      rider,
      "monster-2",
      "monster-1",
    ]);
  });
});
