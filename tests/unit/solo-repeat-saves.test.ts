/**
 * The solo End Turn's repeat saves (#1333): a condition the sheet holds from a known
 * source whose rule repeats the save at the end (or start) of the target's turn.
 */
import { describe, expect, it } from "vitest";

import {
  sheetSourcedConditions,
  soloRepeatSavesDue,
  type SheetSourcedCondition,
} from "@/lib/play/solo-repeat-saves";
import type { ActiveCombatEffect } from "@/types/combat-effect";

const holdPerson = (saveDc?: number): SheetSourcedCondition => ({
  key: "hp-1",
  conditionId: "paralyzed",
  source: { kind: "spell", id: "hold-person", actionId: "hold-person" },
  ...(saveDc !== undefined ? { saveDc } : {}),
});

describe("soloRepeatSavesDue", () => {
  it("Hold Person's Paralyzed asks a WIS save at the end of the turn", () => {
    expect(soloRepeatSavesDue([holdPerson()])).toEqual([
      {
        id: "hp-1",
        conditionId: "paralyzed",
        conditionIds: ["paralyzed"],
        keys: ["hp-1"],
        source: { kind: "spell", id: "hold-person" },
        ability: "WIS",
        at: "target-turn-end",
      },
    ]);
  });

  it("the DC shows only when the source recorded one", () => {
    expect(soloRepeatSavesDue([holdPerson(15)])[0]?.dc).toBe(15);
    expect(soloRepeatSavesDue([holdPerson()])[0]).not.toHaveProperty("dc");
  });

  it("a condition whose source has no repeat-save rule raises nothing", () => {
    expect(
      soloRepeatSavesDue([
        {
          key: "x",
          conditionId: "frightened",
          source: { kind: "feature", id: "paladin-abjure-foes", actionId: "abjure" },
        },
      ])
    ).toEqual([]);
  });

  it("a campaign prompt already asking for the condition keeps the strip silent", () => {
    expect(
      soloRepeatSavesDue([holdPerson()], { campaignConditions: ["paralyzed"] })
    ).toEqual([]);
  });

  it("a save due at the turn's start is raised at the same solo edge", () => {
    const [save] = soloRepeatSavesDue([
      {
        key: "ce-1",
        conditionId: "restrained",
        source: { kind: "spell", id: "conjure-elemental", actionId: "conjure-elemental" },
      },
    ]);
    expect(save).toMatchObject({ ability: "DEX", at: "target-turn-start" });
  });

  it("one cast's two conditions are one save (Hideous Laughter)", () => {
    const of = (key: string, conditionId: string): SheetSourcedCondition => ({
      key,
      conditionId,
      source: { kind: "spell", id: "tashas-hideous-laughter", actionId: "thl" },
    });
    const strips = soloRepeatSavesDue([of("a", "prone"), of("b", "incapacitated")]);
    expect(strips).toHaveLength(1);
    expect(strips[0]).toMatchObject({
      conditionIds: ["prone", "incapacitated"],
      keys: ["a", "b"],
    });
  });

  it("a save track (Sleep) is not one tap: left out", () => {
    expect(
      soloRepeatSavesDue([
        {
          key: "s",
          conditionId: "incapacitated",
          source: { kind: "spell", id: "sleep", actionId: "sleep" },
        },
      ])
    ).toEqual([]);
  });
});

describe("sheetSourcedConditions", () => {
  it("reads the sheet's condition effects with their source and DC", () => {
    const effect = {
      id: "e1",
      actor: { kind: "monster", combatantId: "m1" },
      target: { kind: "pc", combatantId: "self", memberUid: "u", characterId: "c" },
      source: { kind: "spell", id: "hold-person", actionId: "hold-person" },
      payload: { kind: "condition", conditionId: "paralyzed" },
      bindings: { saveDc: 14 },
      duration: { kind: "encounter" },
    } as ActiveCombatEffect;
    const grant = {
      ...effect,
      id: "e2",
      payload: { kind: "grant-group", activeKey: "spell-bless" },
    } as ActiveCombatEffect;
    expect(sheetSourcedConditions([effect, grant])).toEqual([
      {
        key: "e1",
        conditionId: "paralyzed",
        source: { kind: "spell", id: "hold-person", actionId: "hold-person" },
        saveDc: 14,
      },
    ]);
  });
});
