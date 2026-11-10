/**
 * A state that gives Disadvantage on attack rolls against creatures other than the
 * one who put it there (scope `otherThanSource`): the monster's attack mode depends
 * on whom it attacks. Without a named target, the conditional state stays out of the
 * blanket mode.
 */
import { describe, expect, it, vi } from "vitest";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";

vi.mock("@/lib/resolve-grant-sources", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/resolve-grant-sources")>();
  return {
    ...real,
    resolveCombatEffectGrants: (effect: ActiveCombatEffect) =>
      effect.source.id === "duel-state"
        ? [
            {
              type: "disadvantage-on",
              rollType: "attack",
              scope: "otherThanSource",
              vs: "creatures-other-than-source",
            },
          ]
        : real.resolveCombatEffectGrants(effect),
  };
});

const { monsterTurnModifiers } = await import("@/lib/play/monster-turn-modifiers");

const duel: CombatEffectOp = {
  id: "op-1",
  kind: "apply",
  effect: {
    id: "e1",
    actor: { kind: "pc", combatantId: "pc-pal", memberUid: "u", characterId: "c" },
    target: { kind: "monster", combatantId: "orc-1" },
    source: { kind: "spell", id: "duel-state", actionId: "duel-state" },
    payload: { kind: "grant-group", activeKey: "duel-state" },
    duration: { kind: "concentration", actorId: "pc-pal", sourceId: "duel-state" },
  },
};

describe("attack Disadvantage against creatures other than the source", () => {
  it("attacking anyone else: Disadvantage", () => {
    expect(monsterTurnModifiers([duel], "orc-1", "pc-wiz").attack).toBe("disadvantage");
  });

  it("attacking the one who put it there: a straight roll", () => {
    expect(monsterTurnModifiers([duel], "orc-1", "pc-pal").attack).toBeNull();
  });

  it("no target named: the conditional state stays out of the blanket mode", () => {
    expect(monsterTurnModifiers([duel], "orc-1").attack).toBeNull();
  });
});
