/**
 * A damage rider with its own saving throw and a condition on a failure: the
 * creature hit makes the save, and on a failure takes the rider's damage and gains
 * the condition (2024 Poisoner, Brew Poison: "that creature must succeed on a
 * Constitution saving throw (DC 8 plus the modifier of the ability increased by this
 * feat and your Proficiency Bonus) or take 2d8 Poison damage and have the Poisoned
 * condition until the end of your next turn"; many monster and item riders read the
 * same way).
 *
 * The DC is 8 + PB + the best modifier among the rider's DC abilities. The tray
 * offers the condition behind the hit, with the rider's own save, like Topple's Prone.
 */
import { describe, expect, it } from "vitest";

import { combatResolutionSpec } from "@/lib/combat-resolution";
import type { Grant } from "@/lib/grants";
import { damageTrayPlan } from "@/lib/play/damage-tray";
import { localizeActions } from "@/lib/views/combat-action-view";
import type { CustomFeature } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";
import { customInstanceId } from "./__helpers__/custom-items";

const VENOM: Grant = {
  type: "damage-rider",
  appliesTo: "weapon",
  dice: "2d8",
  damageType: "poison",
  save: { ability: "CON", dcAbilities: ["DEX", "INT"] },
  onFailedSave: { conditions: ["poisoned"], until: "end-of-your-next-turn" },
};

const coating = (grants: Grant[]): CustomFeature => ({
  custom: true,
  title: "Venom Coat",
  emoji: "🧪",
  source: "Homebrew",
  tags: [],
  contentBlocks: [],
  grants,
  instanceId: customInstanceId("Venom Coat"),
});

// Fighter 5 (PB 3), DEX 16 (+3), INT 10: DC 8 + 3 + 3 = 14.
const doc = (grants: Grant[] = [VENOM]) =>
  makeCharacterDoc({
    abilityScores: { STR: 16, DEX: 16, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    features: [coating(grants)],
    weapons: [{ srdId: "shortsword", quantity: 1 }],
  });

const sword = (grants?: Grant[]) => {
  const found = localizeActions(doc(grants), "en").find(
    (a) => a.id === "weapon-shortsword"
  );
  if (!found) throw new Error("no shortsword row");
  return found;
};

describe("a damage rider with a save and a condition", () => {
  it("carries its save, computed DC and condition on the weapon row", () => {
    expect(sword().summary.extraDamage).toEqual([
      expect.objectContaining({
        dice: "2d8",
        damageType: "poison",
        save: { ability: "CON", dc: 14 },
        failedSaveConditions: ["poisoned"],
      }),
    ]);
  });

  it("applies the condition on a hit, until the end of the attacker's next turn", () => {
    expect(combatResolutionSpec(sword()).conditionApplication).toEqual({
      options: ["poisoned"],
      on: "hit",
      lifetimes: {
        poisoned: { kind: "turn-boundary", phase: "turn-end", turns: 1 },
      },
    });
  });

  it("the tray offers it behind the hit, against the rider's own save", () => {
    expect(damageTrayPlan(sword(), ["monster-1"], "pc-me")?.conditions).toEqual({
      options: ["poisoned"],
      pickOne: false,
      optIn: true,
      save: { ability: "CON", dc: 14 },
    });
  });

  it("a rider with no save brings no condition", () => {
    const plain: Grant = {
      type: "damage-rider",
      appliesTo: "weapon",
      dice: "1d6",
      damageType: "poison",
    };
    expect(combatResolutionSpec(sword([plain])).conditionApplication).toBeUndefined();
  });
});
