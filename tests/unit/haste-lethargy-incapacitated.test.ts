/**
 * Haste's lethargy (SRD 5.2.1: "When the spell ends, the target is Incapacitated and
 * has a Speed of 0 until after its next turn"): the after-effect makes the creature
 * Incapacitated, so its Reactions are gone and its Concentration breaks, not only
 * its Action and Bonus Action (the code-check of the live sheets, 2026-11-12).
 */
import { describe, expect, it } from "vitest";

import { effectiveSessionConditions } from "@/lib/effective-conditions";
import type { ActiveCombatEffect } from "@/types/combat-effect";

const pc = {
  kind: "pc" as const,
  combatantId: "pc-u1",
  memberUid: "u1",
  characterId: "c1",
};
const haste = (phase?: "aftereffect"): ActiveCombatEffect => ({
  id: phase ? "haste:aftereffect" : "haste",
  actor: pc,
  target: pc,
  source: { kind: "spell", id: "haste", actionId: "spell-haste" },
  payload: { kind: "grant-group", activeKey: "spell-haste", ...(phase ? { phase } : {}) },
  duration: { kind: "encounter" },
});
const session = (effect: ActiveCombatEffect) =>
  ({ conditions: [], concentration: "", encounterEffects: [effect] }) as never;

describe("Haste's lethargy", () => {
  it("the after-effect makes the creature Incapacitated", () => {
    expect(effectiveSessionConditions(session(haste("aftereffect")))).toContain(
      "incapacitated"
    );
  });

  it("while hasted, it isn't", () => {
    expect(effectiveSessionConditions(session(haste()))).not.toContain("incapacitated");
  });
});
