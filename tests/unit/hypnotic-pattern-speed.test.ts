/**
 * Hypnotic Pattern (SRD 5.2.1): a creature that fails the save has the Charmed
 * condition; while Charmed it has the Incapacitated condition and a Speed of 0. The
 * Speed 0 lives exactly as long as the condition the spell put there (damage ends
 * both), so it reads off that condition occurrence, not a separate timer.
 */
import { describe, expect, it } from "vitest";
import { monsterTurnModifiers } from "@/lib/play/monster-turn-modifiers";
import type {
  ActiveCombatEffect,
  CombatEffectOp,
  CombatantRef,
} from "@/types/combat-effect";

const bard: CombatantRef = {
  kind: "pc",
  combatantId: "pc-ana",
  memberUid: "ana",
  characterId: "c1",
};
const orc: CombatantRef = { kind: "monster", combatantId: "orc-1" };

const charmedBy = (spellId: string, id = "e1"): CombatEffectOp => {
  const effect: ActiveCombatEffect = {
    id,
    actor: bard,
    target: orc,
    source: { kind: "spell", id: spellId, actionId: spellId },
    payload: { kind: "condition", conditionId: "charmed" },
    duration: { kind: "concentration", actorId: "pc-ana", sourceId: spellId },
  };
  return { id: `op-${id}`, kind: "apply", effect };
};

describe("Hypnotic Pattern's Speed 0", () => {
  it("the creature it Charms has a Speed of 0", () => {
    expect(monsterTurnModifiers([charmedBy("hypnotic-pattern")], "orc-1").speedZero).toBe(
      true
    );
  });

  it("Charmed from another spell leaves its Speed alone", () => {
    expect(monsterTurnModifiers([charmedBy("charm-person")], "orc-1").speedZero).toBe(
      false
    );
  });

  it("once the condition ends (damage revokes it), the Speed comes back", () => {
    const ops: CombatEffectOp[] = [
      charmedBy("hypnotic-pattern"),
      {
        id: "op-r",
        kind: "revoke",
        effectId: "e1",
        actorId: "pc-ana",
        targetId: "orc-1",
      },
    ];
    expect(monsterTurnModifiers(ops, "orc-1").speedZero).toBe(false);
  });
});
