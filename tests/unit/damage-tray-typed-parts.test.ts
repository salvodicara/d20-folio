/**
 * A hit of more than one damage type (edge-case family M4): each type's total meets
 * the target's own defense against that type. 10 Fire + 10 Radiant against a
 * fire-resistant target is 5 + 10 = 15 (SAC #36); a save halves each part first.
 *
 * Corpus: Resistance per target; Damage typed in without a type breakdown.
 */
import { describe, expect, it } from "vitest";

import { NO_DEFENSES, type DamageDefenses } from "@/lib/damage-intake";
import {
  initialTrayRow,
  rowAmountByType,
  toggleSaved,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import type { DamageType } from "@/types/damage";

const defenses = (
  resistances: DamageType[],
  immunities: DamageType[] = []
): DamageDefenses => ({
  ...NO_DEFENSES,
  resistances: new Set(resistances),
  immunities: new Set(immunities),
});

const smite: DamageTrayPlan = {
  effect: "damage",
  damageTypes: ["fire", "radiant"],
  targets: ["monster-1", "monster-2"],
};

describe("a hit of two damage types, one total per type", () => {
  it("each part meets its own defense: fire halved, radiant whole", () => {
    const row = initialTrayRow(smite, "monster-1", defenses(["fire"]));
    expect(row.partDefense).toEqual({ fire: "resistant" });
    expect(rowAmountByType({ fire: 10, radiant: 10 }, row, smite)).toBe(15);
  });

  it("a target with no defense takes both in full", () => {
    const row = initialTrayRow(smite, "monster-2");
    expect(rowAmountByType({ fire: 10, radiant: 10 }, row, smite)).toBe(20);
  });

  it("an immunity drops its part", () => {
    const row = initialTrayRow(smite, "monster-1", defenses([], ["radiant"]));
    expect(rowAmountByType({ fire: 7, radiant: 9 }, row, smite)).toBe(7);
  });

  it("the defense chip off counts each part in full", () => {
    const row = {
      ...initialTrayRow(smite, "monster-1", defenses(["fire"])),
      defenseOn: false,
    };
    expect(rowAmountByType({ fire: 10, radiant: 10 }, row, smite)).toBe(20);
  });

  it("a saved target halves each part, then its resistance halves again (round down)", () => {
    const saving: DamageTrayPlan = { ...smite, save: { ability: "DEX", onSave: "half" } };
    const row = toggleSaved(
      initialTrayRow(saving, "monster-1", defenses(["fire"])),
      saving
    );
    // fire 11 → 5 (save) → 2 (resistance); radiant 9 → 4.
    expect(rowAmountByType({ fire: 11, radiant: 9 }, row, saving)).toBe(6);
  });
});
