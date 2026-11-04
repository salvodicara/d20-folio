/**
 * A spell's target states (Grave Ground's −1d6 on damage): the encounter effect a
 * failed save leaves names one by `activeKey`, and the target's grants resolve
 * from the spell's `targetStates`, never from its caster-owned `grants`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/spells", async (orig) => {
  const real = await orig<typeof import("@/data/spells")>();
  return {
    ...real,
    getSpellById: (id: string) =>
      id === "test-grave"
        ? {
            id,
            level: 5,
            targetStates: [
              {
                type: "while-active",
                activeKey: "weakened",
                grants: [
                  {
                    type: "roll-die-adjustment",
                    rollType: "damage",
                    operation: "subtract",
                    dice: "1d6",
                    consume: "each",
                  },
                ],
              },
            ],
          }
        : real.getSpellById(id),
  };
});

import { resolveCombatEffectGrants } from "@/lib/resolve-grant-sources";
import type { ActiveCombatEffect } from "@/types/combat-effect";

describe("a spell's target state", () => {
  it("resolves from the spell's targetStates by its activeKey", () => {
    const effect: ActiveCombatEffect = {
      id: "e1",
      actor: { kind: "monster", combatantId: "monster-1" },
      target: { kind: "pc", combatantId: "pc-u1", memberUid: "u1", characterId: "c1" },
      source: { kind: "spell", id: "test-grave", actionId: "cast" },
      payload: { kind: "grant-group", activeKey: "weakened" },
      duration: { kind: "encounter" },
    };
    expect(resolveCombatEffectGrants(effect)).toEqual([
      expect.objectContaining({
        type: "roll-die-adjustment",
        rollType: "damage",
        dice: "1d6",
      }),
    ]);
  });
});
