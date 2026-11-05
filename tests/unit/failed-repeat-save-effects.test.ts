/**
 * What a failed repeat save does to its target (edge-case M3): each failure applies
 * the condition's `onFailedRepeatSave`. Vision of Elapsing Eons: 1 Exhaustion level
 * a failure, on top of what the sheet shows, never past the table's maximum, and
 * nothing on a creature immune to Exhaustion.
 */
import { describe, expect, it } from "vitest";

import { failedRepeatSaveEffects } from "@/lib/play/repeat-saves";
import type { CharacterDoc, CustomFeature } from "@/types/character";
import type { ActiveCombatEffect } from "@/types/combat-effect";

import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

const eons = { onFail: [{ kind: "exhaustion" as const, levels: 1 }] };

const sheet = (exhaustion: number, extra: Partial<CharacterDoc["session"]> = {}) => {
  const doc = makeCharacterDoc({ classId: "fighter", level: 5 });
  return { ...doc, session: { ...doc.session, exhaustion, ...extra } };
};

describe("a failed repeat save's effects", () => {
  it("Vision of Elapsing Eons: one more Exhaustion level", () => {
    expect(failedRepeatSaveEffects(sheet(0), eons)).toEqual({ levels: 1, exhaustion: 1 });
    expect(failedRepeatSaveEffects(sheet(2), eons)).toEqual({ levels: 1, exhaustion: 3 });
  });

  it("counts from the level the sheet shows, sources' levels included", () => {
    const spell: ActiveCombatEffect = {
      id: "w",
      actor: { kind: "monster", combatantId: "lich" },
      target: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: "c" },
      source: { kind: "spell", id: "a-spell", actionId: "cast" },
      payload: { kind: "condition", conditionId: "exhaustion" },
      duration: { kind: "encounter" },
    };
    expect(
      failedRepeatSaveEffects(sheet(1, { encounterEffects: [spell] }), eons)?.exhaustion
    ).toBe(3);
  });

  it("never past the table's maximum", () => {
    expect(failedRepeatSaveEffects(sheet(6), eons)).toBeNull();
  });

  it("nothing when the failure applies no Exhaustion", () => {
    expect(failedRepeatSaveEffects(sheet(0), {})).toBeNull();
  });

  it("nothing on a creature immune to Exhaustion", () => {
    const doc = sheet(0);
    const feature: CustomFeature = {
      custom: true,
      title: "Homebrew",
      emoji: "*",
      source: "Homebrew",
      tags: [],
      contentBlocks: [],
      grants: [{ type: "condition-immunity", condition: "exhaustion" }],
      instanceId: customInstanceId("immunity"),
    };
    const immune: CharacterDoc = {
      ...doc,
      character: { ...doc.character, features: [feature] },
    };
    expect(failedRepeatSaveEffects(immune, eons)).toBeNull();
  });
});
