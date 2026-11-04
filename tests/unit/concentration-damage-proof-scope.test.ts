/**
 * Concentration that damage can't break, beyond one named spell (rules sweep
 * 2026-11-04): Boon of the Iron Mind, "your Concentration ends only if you cast a
 * spell or use another effect that requires Concentration, you have the Petrified
 * or Unconscious condition, or you die" (any spell); the Conjurer's Focused
 * Conjuration, "Taking damage can't break your Concentration on a Conjuration
 * spell" (a school).
 */
import { afterEach, describe, expect, it } from "vitest";

import { damageQueuesConcentrationSave } from "@/lib/character-d20-tests";
import { concentrationValue } from "@/lib/concentration";
import { conformHomebrewGrant, type Grant } from "@/lib/grants";
import type { CustomFeature } from "@/types/character";

import { customInstanceId } from "./__helpers__/custom-items";
import { useCharacterStore } from "@/stores/characterStore";

import { makeCharacterDoc } from "./_helpers";

const holding = (spellId: string, grant?: Grant) => {
  const feature: CustomFeature = {
    custom: true,
    title: "Focus",
    emoji: "*",
    source: "Homebrew",
    tags: [],
    contentBlocks: [],
    grants: grant ? [grant] : [],
    instanceId: customInstanceId("focus"),
  };
  return makeCharacterDoc(
    { classId: "wizard", level: 5, features: [feature] },
    { concentration: spellId ? concentrationValue(spellId) : "" }
  );
};

const anySpell: Grant = { type: "concentration-damage-proof", spells: "any" };
const conjuration: Grant = {
  type: "concentration-damage-proof",
  spells: { school: "conjuration" },
};

describe("concentration-damage-proof beyond one spell", () => {
  it("any spell: damage never queues a Concentration save (Iron Mind)", () => {
    expect(damageQueuesConcentrationSave(holding("bless", anySpell))).toBe(false);
    expect(damageQueuesConcentrationSave(holding("hold-person", anySpell))).toBe(false);
  });

  it("a school: only a held spell of that school is spared (Focused Conjuration)", () => {
    // Conjure Animals is Conjuration; Bless is Enchantment.
    expect(damageQueuesConcentrationSave(holding("conjure-animals", conjuration))).toBe(
      false
    );
    expect(damageQueuesConcentrationSave(holding("bless", conjuration))).toBe(true);
  });

  it("without the grant, damage queues the save; nothing held asks nothing", () => {
    expect(damageQueuesConcentrationSave(holding("bless"))).toBe(true);
    expect(damageQueuesConcentrationSave(holding("", anySpell))).toBe(false);
  });

  it("the per-spell form still works (Relentless Hunter on Hunter's Mark)", () => {
    const mark: Grant = { type: "concentration-damage-proof", spellId: "hunters-mark" };
    expect(damageQueuesConcentrationSave(holding("hunters-mark", mark))).toBe(false);
    expect(damageQueuesConcentrationSave(holding("bless", mark))).toBe(true);
  });

  it("is a homebrew grant the schema keeps", () => {
    expect(conformHomebrewGrant(anySpell)).toEqual(anySpell);
    expect(conformHomebrewGrant(conjuration)).toEqual(conjuration);
  });
});

describe("the damage seam asks the save only when the rule allows it", () => {
  afterEach(() => useCharacterStore.setState({ character: null }));

  const hit = (doc: ReturnType<typeof holding>) => {
    const hpDoc = {
      ...doc,
      session: { ...doc.session, hp: { ...doc.session.hp, current: 30 } },
    };
    useCharacterStore.getState().setCharacter(hpDoc);
    useCharacterStore.getState().applyDamage(12);
    return useCharacterStore.getState().combatPendingConcentrationSaves;
  };

  it("Iron Mind: 12 damage while holding Bless queues no Concentration save", () => {
    expect(hit(holding("bless", anySpell))).toEqual([]);
    expect(useCharacterStore.getState().character?.session.concentration).toBe("bless");
  });

  it("without it, the same hit queues the save", () => {
    expect(hit(holding("bless"))).toHaveLength(1);
  });
});

describe("Boon of the Iron Mind: incapacitation doesn't end it either", () => {
  afterEach(() => useCharacterStore.setState({ character: null }));

  const ironMind: Grant = {
    type: "concentration-damage-proof",
    spells: "any",
    alsoWhileIncapacitated: true,
  };

  const gain = (grant: Grant | undefined, condition: "stunned" | "unconscious") => {
    useCharacterStore.getState().setCharacter(holding("bless", grant));
    useCharacterStore.getState().addCondition(condition);
    return useCharacterStore.getState().character?.session.concentration;
  };

  it("Stunned keeps Concentration; Unconscious still ends it", () => {
    expect(gain(ironMind, "stunned")).toBe("bless");
    expect(gain(ironMind, "unconscious")).toBe("");
  });

  it("without it (or with the damage-only form), Stunned ends Concentration", () => {
    expect(gain(undefined, "stunned")).toBe("");
    expect(gain(anySpell, "stunned")).toBe("");
  });

  it("is a homebrew grant the schema keeps", () => {
    expect(conformHomebrewGrant(ironMind)).toEqual(ironMind);
  });
});
