import { describe, expect, it } from "vitest";
import {
  effectiveWalkingSpeedFt,
  extraActionRulesThisTurn,
  extraActionsThisTurn,
  isTurnEconomyBlocked,
} from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";
import type { ActiveCombatEffect } from "@/types/combat-effect";

function hasteEffect(phase: "active" | "aftereffect"): ActiveCombatEffect {
  return {
    id: `haste-${phase}`,
    actor: {
      kind: "pc",
      combatantId: "pc-caster",
      memberUid: "caster",
      characterId: "caster-sheet",
    },
    target: {
      kind: "pc",
      combatantId: "pc-target",
      memberUid: "target",
      characterId: "target-sheet",
    },
    source: { kind: "spell", id: "haste", actionId: "spell-haste", castLevel: 3 },
    payload: { kind: "grant-group", activeKey: "spell-haste", phase },
    duration:
      phase === "active"
        ? { kind: "concentration", actorId: "pc-caster", sourceId: "haste" }
        : {
            kind: "turn-boundary",
            combatantId: "pc-target",
            round: 2,
            phase: "turn-end",
          },
  };
}

describe("campaign effect projection consumers", () => {
  it("projects Haste's limited extra action and doubled Speed onto its recipient", () => {
    const doc = makeCharacterDoc({ classId: "wizard", level: 5, speed: "30 ft" });
    doc.session.encounterEffects = [hasteEffect("active")];

    expect(extraActionsThisTurn(doc)).toEqual({ action: 1, bonus: 0 });
    expect(isTurnEconomyBlocked(doc)).toBe(false);
    expect(extraActionRulesThisTurn(doc)).toEqual([
      {
        sourceId: "combat-effect:haste-active",
        slot: "action",
        count: 1,
        allowedActions: ["attack", "dash", "disengage", "hide", "utilize"],
        maxAttacks: 1,
      },
    ]);
    expect(effectiveWalkingSpeedFt(doc)).toBe(60);
  });

  it("projects Haste's aftereffect as zero Speed with no extra action", () => {
    const doc = makeCharacterDoc({ classId: "wizard", level: 5, speed: "30 ft" });
    doc.session.encounterEffects = [hasteEffect("aftereffect")];

    expect(extraActionsThisTurn(doc)).toEqual({ action: 0, bonus: 0 });
    expect(isTurnEconomyBlocked(doc)).toBe(true);
    expect(effectiveWalkingSpeedFt(doc)).toBe(0);
  });
});
