/**
 * Rules whose text says "at the start/end of each of its turns …" carry it as data,
 * on mechanisms that already exist, so a fight (and the solo turn strip) can act on
 * them. Each case is copied from the SRD 5.2.1 text of the rule.
 *
 * - Berserker Intimidating Presence: "a Wisdom saving throw … or have the Frightened
 *   condition for 1 minute. At the end of each of the Frightened creature's turns,
 *   it repeats the save, ending the effect on itself on a success."
 * - Cunning Strike (Poison): "a Constitution saving throw … or have the Poisoned
 *   condition for 1 minute. At the end of each of its turns, the Poisoned target
 *   repeats the save, ending the effect on itself on a success."
 */
import { describe, expect, it } from "vitest";

import { damageTrayPlan } from "@/lib/play/damage-tray";
import { conditionEndsOf, fightConditionEnds } from "@/lib/play/fight-condition-ends";
import type { FightLook } from "@/lib/play/fight-condition-ends";
import { resolveActions } from "@/lib/smart-tracker";
import { getSrdFeatureSource } from "@/lib/srd-feature-lookup";
import type { CombatEffectOp } from "@/types/combat-effect";
import { makeCharacterDoc } from "./_helpers";

describe("a repeat save that ends a condition, from the rule text", () => {
  const cases = [
    {
      rule: "Intimidating Presence",
      source: {
        kind: "feature" as const,
        id: "barbarian-berserker-intimidating-presence",
      },
      condition: "frightened",
      ends: [{ on: "repeat-save", ability: "WIS", at: "target-turn-end" }],
    },
  ];

  it.each(cases)("$rule: $condition, repeat save as written", (c) => {
    expect(conditionEndsOf(c.source, c.condition)).toEqual(c.ends);
  });

  it("Intimidating Presence: a WIS save against 8 + STR + PB, Frightened for 1 minute", () => {
    const action = getSrdFeatureSource("barbarian-berserker-intimidating-presence")
      ?.mechanics?.actions?.[0];
    expect(action).toMatchObject({
      type: "bonus",
      saveAbility: "WIS",
      saveDcAbility: "STR",
      conditionApplication: {
        options: ["frightened"],
        on: "failed-save",
        lifetime: { kind: "timed", minutes: 1, maxRounds: 10 },
      },
    });
  });

  it("Intimidating Presence on a real Berserker: DC 8 + STR + PB, any number of chosen creatures", () => {
    const berserker = makeCharacterDoc({
      classId: "barbarian",
      subclassId: "berserker",
      level: 14,
      abilityScores: { STR: 18, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 8 },
      features: [{ srdId: "barbarian-berserker-intimidating-presence" }],
    });
    const action = resolveActions(berserker, "combat").find((a) =>
      a.id.includes("intimidating-presence")
    );
    expect(action?.summary.conditionSource).toEqual({
      kind: "feature",
      id: "barbarian-berserker-intimidating-presence",
    });
    // "Each creature of your choice": the picker has no cap.
    expect(action?.summary.targeting).toEqual({ affinity: "enemy" });
    // STR 18 (+4), PB +5 at level 14: DC 17. Three chosen creatures all save.
    expect(action && damageTrayPlan(action, ["m1", "m2", "m3"], "pc-me")).toMatchObject({
      save: { ability: "WIS", dc: 17, onSave: "none" },
      conditions: { options: ["frightened"], pickOne: false },
      targets: ["m1", "m2", "m3"],
    });
  });

  it("Cunning Strike (Poison): Poisoned for 1 minute, a CON save at the end of each turn", () => {
    const source = getSrdFeatureSource("rogue-cunning-strike");
    const grants = source && "grants" in source ? (source.grants ?? []) : [];
    const poison = grants.find(
      (g) => g.type === "cunning-strike-option" && g.optionId === "poison"
    );
    expect(poison).toMatchObject({
      save: "CON",
      condition: "poisoned",
      lifetime: { kind: "timed", minutes: 1, maxRounds: 10 },
      ends: [{ on: "repeat-save", ability: "CON", at: "target-turn-end" }],
    });
  });
});

describe("Intimidating Presence in a fight", () => {
  const frightened: CombatEffectOp = {
    id: "op-ip",
    kind: "apply",
    effect: {
      id: "ip-1",
      actor: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: "c1" },
      target: { kind: "monster", combatantId: "orc" },
      source: {
        kind: "feature",
        id: "barbarian-berserker-intimidating-presence",
        actionId: "intimidating-presence",
      },
      payload: { kind: "condition", conditionId: "frightened" },
      bindings: { saveDc: 16 },
      duration: { kind: "encounter" },
    },
  };
  const look = (turn: string): FightLook => ({
    rows: [{ id: "orc", currentHp: 15, tempHp: 0, conditions: ["frightened"] }],
    currentCombatantId: turn,
  });

  it("the end of the Frightened creature's turn asks its WIS save against the DC", () => {
    const result = fightConditionEnds([frightened], look("orc"), look("pc-me"));
    expect(result.ended).toEqual([]);
    expect(result.saves).toEqual([
      {
        id: "ip-1",
        conditionId: "frightened",
        targetId: "orc",
        ability: "WIS",
        dc: 16,
        at: "target-turn-end",
        actorId: "pc-me",
      },
    ]);
  });

  it("the start of its turn asks nothing", () => {
    expect(fightConditionEnds([frightened], look("pc-me"), look("orc")).saves).toEqual(
      []
    );
  });
});
