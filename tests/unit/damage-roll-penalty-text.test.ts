/**
 * A spell that makes its target subtract dice from its damage rolls, from the spell's own
 * SRD 5.2.1 text (Ray of Enfeeblement): "On a failed save, the target has Disadvantage on
 * Strength-based D20 Tests for the duration. During that time, it also subtracts 1d8 from
 * all its damage rolls." → one state the failed save leaves on the target it names
 * (`recipient: "selected"`) for the spell's duration, never a hit's rider and never the
 * caster's.
 */
import { describe, expect, it } from "vitest";

import { getSpellById } from "@/data/spells";
import en from "@/i18n/en/srd/spells.json";
import { resolveCombatEffectGrantGroup } from "@/lib/resolve-grant-sources";
import { resolveActions } from "@/lib/smart-tracker";
import { timedSpellDuration } from "@/data/spells/duration";
import { makeCharacterDoc } from "./_helpers";

const text = (id: string) =>
  (en as Record<string, { description?: string }>)[id]?.description ?? "";

const WEAKENED = {
  type: "while-active",
  activeKey: "spell-ray-of-enfeeblement",
  duration: timedSpellDuration(1),
  recipient: "selected",
  grants: [
    // "Disadvantage on Strength-based D20 Tests": checks, saves and attack rolls.
    { type: "disadvantage-on", rollType: "check", vs: "str" },
    { type: "disadvantage-on", rollType: "save", vs: "str" },
    {
      type: "disadvantage-on",
      rollType: "attack",
      scope: "strength",
      vs: "ray-of-enfeeblement",
    },
    // "it also subtracts 1d8 from all its damage rolls"
    {
      type: "roll-die-adjustment",
      rollType: "damage",
      operation: "subtract",
      dice: "1d8",
      consume: "each",
    },
  ],
};

describe("Ray of Enfeeblement: a failed save weakens the target", () => {
  const spell = getSpellById("ray-of-enfeeblement");

  it("the SRD text the state reads", () => {
    const srd = text("ray-of-enfeeblement");
    expect(srd).toMatch(/must make a Constitution saving throw/i);
    expect(srd).toMatch(/Disadvantage on Strength-based D20 Tests for the duration/i);
    expect(srd).toMatch(/subtracts 1d8 from all its damage rolls/i);
  });

  it("is a save, never an attack roll", () => {
    expect(spell?.saveAbility).toBe("CON");
    expect(spell?.attackType).toBeUndefined();
    expect(spell?.targeting).toEqual({ affinity: "enemy", maxTargets: 1 });
  });

  it("leaves one state on the target it names, for the spell's duration", () => {
    expect(spell?.grants).toEqual([WEAKENED]);
    // No hit rider (the 2014 wiring): its only target state is the success's
    // one-shot Disadvantage (save-success-next-attack-disadvantage.test.ts).
    expect(spell?.effects?.map((e) => [e.kind, e.saveOutcome])).toEqual([
      ["next-attack-disadvantage", "success"],
    ]);
    expect(spell?.targetStates?.map((s) => s.activeKey)).toEqual([
      "ray-of-enfeeblement-next-attack",
    ]);
  });

  it("a fight effect on the target resolves to the state by its key", () => {
    const state = resolveCombatEffectGrantGroup({
      id: "e1",
      actor: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: "c1" },
      target: { kind: "monster", combatantId: "goblin" },
      source: { kind: "spell", id: "ray-of-enfeeblement", actionId: "spell-x" },
      payload: { kind: "grant-group", activeKey: "spell-ray-of-enfeeblement" },
      duration: {
        kind: "concentration",
        actorId: "pc-me",
        sourceId: "ray-of-enfeeblement",
      },
    });
    expect(state?.grants).toEqual(WEAKENED.grants);
  });

  it("the cast row has no attack bonus to roll", () => {
    const doc = makeCharacterDoc({
      classes: [{ classId: "wizard", level: 5 }],
      spells: [{ srdId: "ray-of-enfeeblement" }],
    });
    const cast = resolveActions(doc, "spellbook").find(
      (a) => a.spellId === "ray-of-enfeeblement"
    );
    expect(cast).toBeDefined();
    expect(cast?.summary.attackBonus).toBeUndefined();
  });
});
