/**
 * Attacker-side damage rules (edge-case family M4): "spells you cast ignore
 * Resistance to damage of the chosen type", and "treat any 1 on a damage die as a 2"
 * for those spells (Elemental Adept's Energy Mastery). Immunity still applies.
 *
 * Corpus: Elemental Adept (feat:elemental-adept); Resistance per target.
 */
import { describe, expect, it } from "vitest";

import { NO_DEFENSES, type DamageDefenses } from "@/lib/damage-intake";
import type { Grant } from "@/lib/grants";
import { damageTrayPlan, initialTrayRow, rowAmount } from "@/lib/play/damage-tray";
import { localizeActions } from "@/lib/views/combat-action-view";
import type { CharacterDoc, CustomFeature } from "@/types/character";
import type { DamageType } from "@/types/damage";

import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

const adept = (grants: Grant[]): CharacterDoc => {
  const feature: CustomFeature = {
    custom: true,
    title: "Adept",
    emoji: "*",
    source: "Homebrew",
    tags: [],
    contentBlocks: [],
    grants,
    instanceId: customInstanceId("adept"),
  };
  const doc = makeCharacterDoc({
    classId: "wizard",
    level: 5,
    spells: [
      { srdId: "fire-bolt", prepared: true },
      { srdId: "ray-of-frost", prepared: true },
    ],
  });
  return { ...doc, character: { ...doc.character, features: [feature] } };
};

const FIRE_ADEPT: Grant[] = [
  {
    type: "damage-penetration",
    damageTypes: ["fire"],
    ignores: "resistance",
    appliesTo: "spell",
  },
  {
    type: "damage-die-modifier",
    mode: "floor",
    appliesTo: "spell",
    damageType: "fire",
    floorBelow: 1,
    floorTo: 2,
  },
];

const defenses = (
  resistances: DamageType[],
  immunities: DamageType[] = []
): DamageDefenses => ({
  ...NO_DEFENSES,
  resistances: new Set(resistances),
  immunities: new Set(immunities),
});

const action = (doc: CharacterDoc, id: string) => {
  const found = localizeActions(doc, "en").find((a) => a.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};

describe("a spell of the chosen type ignores Resistance", () => {
  it("Fire Bolt carries the rule; a fire-resistant target takes it whole", () => {
    const bolt = action(adept(FIRE_ADEPT), "spell-fire-bolt");
    expect(bolt.summary.ignoresResistance).toEqual(["fire"]);
    const plan = damageTrayPlan(bolt, ["monster-1"], "pc-me");
    if (!plan) throw new Error("no plan");
    const row = initialTrayRow(plan, "monster-1", defenses(["fire"]));
    expect(row.defense).toBeNull();
    expect(rowAmount(10, row, plan)).toBe(10);
  });

  it("immunity still applies", () => {
    const plan = damageTrayPlan(
      action(adept(FIRE_ADEPT), "spell-fire-bolt"),
      ["m"],
      "pc-me"
    );
    if (!plan) throw new Error("no plan");
    expect(initialTrayRow(plan, "m", defenses([], ["fire"])).defense).toBe("immune");
  });

  it("a spell of another type is halved as usual", () => {
    const frost = action(adept(FIRE_ADEPT), "spell-ray-of-frost");
    expect(frost.summary.ignoresResistance).toBeUndefined();
    const plan = damageTrayPlan(frost, ["m"], "pc-me");
    if (!plan) throw new Error("no plan");
    expect(initialTrayRow(plan, "m", defenses(["cold"])).defense).toBe("resistant");
  });
});

describe("a 1 on a damage die of the chosen type counts as a 2", () => {
  it("Fire Bolt's tray carries the floor; Ray of Frost's does not", () => {
    const doc = adept(FIRE_ADEPT);
    expect(
      damageTrayPlan(action(doc, "spell-fire-bolt"), ["m"], "pc-me")?.dieFloor
    ).toEqual({
      floorBelow: 1,
      floorTo: 2,
    });
    expect(
      damageTrayPlan(action(doc, "spell-ray-of-frost"), ["m"], "pc-me")?.dieFloor
    ).toBeUndefined();
  });
});
