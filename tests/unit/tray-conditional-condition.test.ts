/**
 * A condition a hit imposes only on a target that already has another (SRD 5.2.1
 * Summon Undead, Putrid Spirit's Rotting Claw: "If the target is Poisoned, it has the
 * Paralyzed condition until the end of its next turn"). The tray starts it on for a
 * Poisoned target and off for any other, so the table never lands it by mistake.
 */
import { describe, expect, it } from "vitest";

import { initialTrayRow, type DamageTrayPlan } from "@/lib/play/damage-tray";

const rottingClaw: DamageTrayPlan = {
  effect: "damage",
  damageType: "slashing",
  attack: { onMiss: "none" },
  conditions: { options: ["paralyzed"], pickOne: false, ifTargetHas: ["poisoned"] },
  targets: ["ghoul"],
};

describe("a condition gated on the target's own", () => {
  it("is on for a target that has the gate", () => {
    const row = initialTrayRow(rottingClaw, "ghoul", undefined, undefined, undefined, [
      "poisoned",
    ]);
    expect(row.conditions).toEqual(["paralyzed"]);
  });

  it("is off for a target without it, or whose conditions aren't known", () => {
    expect(
      initialTrayRow(rottingClaw, "ghoul", undefined, undefined, undefined, ["prone"])
        .conditions
    ).toEqual([]);
    expect(initialTrayRow(rottingClaw, "ghoul").conditions).toEqual([]);
  });

  it("an ungated condition is unchanged", () => {
    const plain: DamageTrayPlan = {
      ...rottingClaw,
      conditions: { options: ["prone"], pickOne: false },
    };
    expect(initialTrayRow(plain, "ghoul").conditions).toEqual(["prone"]);
  });
});
