import { describe, expect, it } from "vitest";
import {
  effectiveSessionConditions,
  projectedEncounterConditions,
} from "@/lib/effective-conditions";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import { conc } from "./__helpers__/concentration";

function encounterEffect(id: string, conditionId: string): ActiveCombatEffect {
  return {
    id,
    actor: { kind: "monster", combatantId: "caster" },
    target: { kind: "monster", combatantId: "target" },
    source: { kind: "spell", id: "hold-person", actionId: "spell-hold-person" },
    payload: { kind: "condition", conditionId },
    duration: {
      kind: "concentration",
      actorId: "caster",
      sourceId: "hold-person",
    },
  };
}

describe("effective source-owned conditions", () => {
  it("unions manual, current solo-source and encounter conditions without duplicates", () => {
    const projected = encounterEffect("encounter", "paralyzed");
    expect(
      effectiveSessionConditions({
        conditions: ["prone", "paralyzed"],
        concentration: conc("hold-person"),
        concentrationConditions: ["paralyzed"],
        encounterEffects: [projected],
      })
    ).toEqual(["prone", "paralyzed"]);
  });

  it("makes a solo condition inert when its owning concentration ends or swaps", () => {
    const concentrationConditions = ["invisible"];
    expect(
      effectiveSessionConditions({
        conditions: [],
        concentration: conc("invisibility"),
        concentrationConditions,
      })
    ).toEqual(["invisible"]);
    expect(
      effectiveSessionConditions({
        conditions: [],
        concentration: "",
        concentrationConditions,
      })
    ).toEqual([]);
  });

  it("projects only condition payloads from the campaign ledger", () => {
    const condition = encounterEffect("condition", "paralyzed");
    const mark: ActiveCombatEffect = {
      ...condition,
      id: "mark",
      payload: { kind: "target-mark", activeKey: "spell-hex", scope: "cursed" },
    };
    expect(projectedEncounterConditions([condition, mark])).toEqual(["paralyzed"]);
  });
});
