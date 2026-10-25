/**
 * SRD 5.2.1 Summon Dragon (and the other "shares your Initiative count" summons): the
 * creature takes its turn immediately after yours. Begin Turns freezes the order with
 * each linked summon right after its caster (`summonedTurnOrder`), alongside the
 * mounted-combat order. Inert while the encounter `summons` writer is held.
 */
import { describe, expect, it } from "vitest";

import {
  addMonster,
  beginEncounterTurns,
  startEncounter,
} from "@/features/campaigns/encounter";
import type { EncounterState } from "@/types/campaign";

function fight(): { enc: EncounterState; caster: string } {
  let enc = startEncounter(
    { mara: { characterId: "char-mara" } },
    ["mara"],
    1_717_000_000_000
  );
  enc = addMonster(enc, {
    name: "Draconic Spirit",
    ac: 14,
    maxHp: 50,
    count: 1,
    initiative: null,
  });
  enc = addMonster(enc, { name: "Goblin", ac: 13, maxHp: 7, count: 1, initiative: 12 });
  const caster = enc.combatants.find((c) => c.kind === "pc")?.id ?? "";
  return { enc, caster };
}

describe("Begin Turns with a summoned creature", () => {
  it("a linked summon acts right after its caster", () => {
    const { enc, caster } = fight();
    const linked = { ...enc, summons: [{ summonId: "monster-1", casterId: caster }] };
    expect(beginEncounterTurns(linked, [caster, "monster-2", "monster-1"]).order).toEqual(
      [caster, "monster-1", "monster-2"]
    );
  });

  it("with no link (the writer is held) the order is the one the DM rolled", () => {
    const { enc, caster } = fight();
    expect(beginEncounterTurns(enc, [caster, "monster-2", "monster-1"]).order).toEqual([
      caster,
      "monster-2",
      "monster-1",
    ]);
  });
});
