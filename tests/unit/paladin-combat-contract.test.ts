import { describe, expect, it } from "vitest";
import { getSpellById } from "@/data/spells";
import { buildGrantedFeatures } from "@/lib/character-build";
import { combatDamageParts } from "@/lib/combat-resolution";
import { activeRollDieAdjustments, markedTargetForActor } from "@/lib/combat-effects";
import { localizeActions } from "@/lib/views/combat-action-view";
import { makeCharacterDoc } from "./_helpers";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";

describe("Paladin combat contract", () => {
  it("keeps Fighting Style as a choice instead of silently granting Defense", () => {
    const ids = buildGrantedFeatures({
      classId: "paladin",
      level: 3,
      subclassId: "oath-of-devotion",
      raceId: "human",
    }).map(({ srdId }) => srdId);

    expect(ids).toContain("paladin-fighting-style");
    expect(ids).not.toContain("paladin-fighting-style-defense");
  });

  it("projects Bless onto every attack and save without consuming the effect", () => {
    const effect: ActiveCombatEffect = {
      id: "bless-1",
      actor: { kind: "monster", combatantId: "cleric" },
      target: { kind: "monster", combatantId: "ally" },
      source: { kind: "spell", id: "bless", actionId: "spell-bless" },
      payload: { kind: "grant-group", activeKey: "spell-bless" },
      duration: {
        kind: "concentration",
        actorId: "cleric",
        sourceId: "bless",
      },
    };

    expect(activeRollDieAdjustments([{ ...effect }])).toEqual([
      expect.objectContaining({ rollType: "attack", dice: "1d4", consume: "each" }),
      expect.objectContaining({ rollType: "save", dice: "1d4", consume: "each" }),
    ]);
  });

  it("keeps Vow of Enmity bound to the exact selected creature", () => {
    const vow: ActiveCombatEffect = {
      id: "vow-1",
      actor: { kind: "monster", combatantId: "paladin" },
      target: { kind: "monster", combatantId: "fiend" },
      source: {
        kind: "feature",
        id: "paladin-vengeance-vow-of-enmity",
        actionId: "paladin-vengeance-vow-of-enmity-free",
      },
      payload: {
        kind: "target-mark",
        activeKey: "paladin-vengeance-vow-of-enmity",
        scope: "vowed",
      },
      duration: {
        kind: "turn-boundary",
        combatantId: "paladin",
        round: 11,
        phase: "turn-end",
      },
    };
    const operations: CombatEffectOp[] = [
      { id: "apply-vow", kind: "apply", effect: vow },
    ];

    expect(markedTargetForActor(operations, "paladin", "vowed")).toEqual({
      kind: "monster",
      combatantId: "fiend",
    });
  });

  it("models Divine Smite's type-gated bonus as a separate damage component", () => {
    const doc = makeCharacterDoc(
      {
        classId: "paladin",
        level: 3,
        features: [{ srdId: "paladin-divine-smite" }],
        spells: [{ srdId: "divine-smite", prepared: true }],
      },
      {}
    );
    const smite = localizeActions(doc, "en").find(
      (candidate) => candidate.id === "spell-divine-smite"
    );
    if (!smite) throw new Error("Divine Smite action missing");
    expect(
      combatDamageParts(smite).map(({ formula, targetCreatureTypes }) => ({
        formula,
        targetCreatureTypes,
      }))
    ).toEqual([
      { formula: "2d8", targetCreatureTypes: undefined },
      { formula: "1d8", targetCreatureTypes: ["fiend", "undead"] },
    ]);
  });

  it("separates Searing Smite's initial hit from its start-turn save loop", () => {
    const spell = getSpellById("searing-smite");
    expect(spell).toMatchObject({
      damageDice: "1d6",
      damageDicePerUpcast: "1d6",
      recurrence: "start-of-turn",
      endsOnSuccessfulSave: true,
      followUp: {
        saveAbility: "CON",
        attack: { dice: "1d6", dicePerUpcast: "1d6", resolution: "automatic" },
      },
    });
    expect(spell?.saveAbility).toBeUndefined();
  });
});
