/**
 * Dispel Magic (SRD 5.2.1, edge-case family M17): any spell of level 3 or lower on
 * the target ends (one level higher per slot above 3rd); a higher one needs an
 * ability check with the caster's spellcasting ability, DC 10 + its level.
 */
import { describe, expect, it } from "vitest";

import { dispelOptions, dispelOutcome } from "@/lib/play/dispel";
import type { CombatEffectOp } from "@/types/combat-effect";

const rule = { autoMaxLevel: 3, perUpcast: 1 };

describe("dispelOutcome", () => {
  it("ends a spell up to the cast's reach; above it, a check at DC 10 + its level", () => {
    expect(dispelOutcome(rule, 3, 3)).toEqual({ kind: "ends" });
    expect(dispelOutcome(rule, 3, 4)).toEqual({ kind: "check", dc: 14 });
    // Cast at 5th: spells of 5th level or lower end.
    expect(dispelOutcome(rule, 5, 5)).toEqual({ kind: "ends" });
    expect(dispelOutcome(rule, 5, 6)).toEqual({ kind: "check", dc: 16 });
  });
});

const op = (
  id: string,
  target: string,
  spellId: string,
  castLevel: number,
  conditionId = "frightened"
): CombatEffectOp => ({
  id: `op-${id}`,
  kind: "apply",
  effect: {
    id,
    actor: { kind: "monster", combatantId: "m-mage" },
    target: { kind: "monster", combatantId: target },
    source: { kind: "spell", id: spellId, actionId: "cast", castLevel },
    payload: { kind: "condition", conditionId },
    duration: { kind: "encounter" },
  },
});

describe("dispelOptions", () => {
  it("lists each spell on the target once, with its effects and outcome", () => {
    const ops = [
      op("a", "m-ogre", "bless", 1),
      op("b", "m-ogre", "hold-person", 5),
      op("c", "m-ogre", "hold-person", 5, "paralyzed"),
      op("d", "m-other", "bless", 1),
    ];
    expect(dispelOptions(ops, "m-ogre", rule, 3)).toEqual([
      { spellId: "bless", level: 1, effectIds: ["a"], outcome: { kind: "ends" } },
      {
        spellId: "hold-person",
        level: 5,
        effectIds: ["b", "c"],
        outcome: { kind: "check", dc: 15 },
      },
    ]);
  });
});
