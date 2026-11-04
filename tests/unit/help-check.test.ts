/**
 * Help on an ability check (SRD 5.2.1 "Help [Action]", edge-case family M17): named
 * on an ally, it leaves Advantage on that ally's next ability check, spent by that
 * check, gone at the start of the helper's next turn. Named on an enemy, it stays
 * the attack form.
 */
import { describe, expect, it } from "vitest";

import { helpEffect } from "@/features/character/center/outcome-offer";
import { activeRollModeAdjustments, effectIdsConsumedByRoll } from "@/lib/combat-effects";
import type { CombatEffectOp } from "@/types/combat-effect";

const helper = {
  kind: "pc" as const,
  combatantId: "pc-me",
  memberUid: "me",
  characterId: "c1",
};
const ally = {
  kind: "pc" as const,
  combatantId: "pc-ally",
  memberUid: "ally",
  characterId: "c2",
};

const apply = (form: "attack" | "check"): CombatEffectOp => ({
  id: `op-${form}`,
  kind: "apply",
  effect: helpEffect({ helper, enemy: ally, round: 2, effectId: `fx-${form}`, form }),
});

describe("Help on an ability check", () => {
  it("leaves Advantage on the ally's next check until the helper's next turn", () => {
    const effect = helpEffect({
      helper,
      enemy: ally,
      round: 2,
      effectId: "fx",
      form: "check",
    });
    expect(effect.payload).toEqual({ kind: "grant-group", activeKey: "helped-check" });
    expect(effect.duration).toMatchObject({
      kind: "turn-boundary",
      combatantId: "pc-me",
      round: 3,
      phase: "turn-start",
    });
    expect(activeRollModeAdjustments([effect], "check")).toEqual([
      expect.objectContaining({ mode: "advantage", consume: "next" }),
    ]);
  });

  it("the ally's next check spends it; an attack form isn't spent by a check", () => {
    expect(effectIdsConsumedByRoll([apply("check")], "pc-ally", "check")).toEqual([
      "fx-check",
    ]);
    expect(effectIdsConsumedByRoll([apply("attack")], "pc-ally", "check")).toEqual([]);
    expect(effectIdsConsumedByRoll([apply("check")], "pc-me", "check")).toEqual([]);
  });
});
