/**
 * Sanctuary on an ally (SRD 5.2.1: "The spell ends if the warded creature makes an
 * attack roll, casts a spell, or deals damage"). The ward lives on the encounter as
 * a combat effect targeting the ally, not on the caster's sheet, so the ally's own
 * act must find it there: the live effects on the acting creature whose state ends
 * early on that act.
 */
import { describe, expect, it } from "vitest";

import { effectIdsEndingOnAct } from "@/lib/combat-effects";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";

const ward = (id: string, targetId: string, spell = "sanctuary"): CombatEffectOp => {
  const effect: ActiveCombatEffect = {
    id,
    actor: { kind: "monster", combatantId: "cleric" },
    target: { kind: "monster", combatantId: targetId },
    source: { kind: "spell", id: spell, actionId: `spell-${spell}` },
    payload: { kind: "grant-group", activeKey: `spell-${spell}` },
    duration: { kind: "encounter" },
  };
  return { id: `apply-${id}`, kind: "apply", effect };
};

describe("effectIdsEndingOnAct", () => {
  it("the warded ally's attack roll, spell or damage ends its Sanctuary", () => {
    const ops = [ward("w1", "fighter")];
    expect(effectIdsEndingOnAct(ops, "fighter", "attack-roll")).toEqual(["w1"]);
    expect(effectIdsEndingOnAct(ops, "fighter", "cast-spell")).toEqual(["w1"]);
    expect(effectIdsEndingOnAct(ops, "fighter", "deal-damage")).toEqual(["w1"]);
  });

  it("only the acting creature's ward ends, and a revoked one is already gone", () => {
    const ops: CombatEffectOp[] = [
      ward("w1", "fighter"),
      ward("w2", "rogue"),
      ward("w3", "wizard"),
      {
        id: "revoke:w3",
        kind: "revoke",
        effectId: "w3",
        actorId: "cleric",
        targetId: "wizard",
      },
    ];
    expect(effectIdsEndingOnAct(ops, "fighter", "attack-roll")).toEqual(["w1"]);
    expect(effectIdsEndingOnAct(ops, "wizard", "attack-roll")).toEqual([]);
  });

  it("an act the ward doesn't name leaves it (moving)", () => {
    expect(effectIdsEndingOnAct([ward("w1", "fighter")], "fighter", "move")).toEqual([]);
  });

  it("an effect that doesn't end on acts stays (Bless)", () => {
    expect(
      effectIdsEndingOnAct([ward("b1", "fighter", "bless")], "fighter", "attack-roll")
    ).toEqual([]);
  });
});
