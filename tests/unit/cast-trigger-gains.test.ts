/**
 * A cast-spell trigger that gives something scaled by the slot (rules sweep
 * 2026-11-04): Abjuration Adept, "when you cast an Abjuration spell with a spell
 * slot, you gain Temporary Hit Points equal to twice the slot's level";
 * Transmutation Adept, "your Speed increases by 5 feet per slot level until the end
 * of the turn" after a Transmutation spell cast with a slot.
 */
import { describe, expect, it } from "vitest";

import { conformHomebrewGrant, type Grant } from "@/lib/grants";
import { MOCK_CHARACTER } from "@/lib/mock";
import { castTriggerFacts, firedCastTriggers } from "@/lib/smart-tracker";
import type { CharacterDoc, CustomFeature } from "@/types/character";

import { customInstanceId } from "./__helpers__/custom-items";

const withRule = (grant: Grant): CharacterDoc => {
  const feature: CustomFeature = {
    custom: true,
    title: "Rule",
    emoji: "*",
    source: "Homebrew",
    tags: [],
    contentBlocks: [],
    grants: [grant],
    instanceId: customInstanceId("rule"),
  };
  return {
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      features: [...MOCK_CHARACTER.character.features, feature],
    },
    session: { ...MOCK_CHARACTER.session, trackers: {} },
  };
};

const abjurationAdept = {
  type: "trigger",
  on: "cast-spell",
  if: { school: "abjuration", slot: true },
  do: { kind: "temp-hp", perSlotLevel: 2 },
} as Grant;

const transmutationAdept = {
  type: "trigger",
  on: "cast-spell",
  if: { school: "transmutation", slot: true },
  do: { kind: "speed-bonus", perSlotLevel: 5 },
} as Grant;

const gains = (doc: CharacterDoc, spellId: string, slotLevel: number | null) =>
  firedCastTriggers(doc, castTriggerFacts(spellId, slotLevel)).gains.map(
    ({ kind, amount }) => ({ kind, amount })
  );

describe("cast-spell trigger gains scaled by the slot", () => {
  it("temp HP: twice the slot's level, on a spell of the school cast with a slot", () => {
    const doc = withRule(abjurationAdept);
    // Shield (Abjuration, level 1) upcast with a 3rd-level slot: 6 temp HP.
    expect(gains(doc, "shield", 3)).toEqual([{ kind: "temp-hp", amount: 6 }]);
    expect(gains(doc, "shield", 1)).toEqual([{ kind: "temp-hp", amount: 2 }]);
  });

  it("speed: 5 ft per slot level, on a spell of the school cast with a slot", () => {
    const doc = withRule(transmutationAdept);
    // Longstrider (Transmutation, level 1) with a 2nd-level slot: +10 ft this turn.
    expect(gains(doc, "longstrider", 2)).toEqual([{ kind: "speed-bonus", amount: 10 }]);
  });

  it("gives nothing without a slot, or for a spell of another school", () => {
    const doc = withRule(abjurationAdept);
    expect(gains(doc, "shield", null)).toEqual([]);
    expect(gains(doc, "magic-missile", 1)).toEqual([]);
  });

  it("is a homebrew grant the schema keeps, and refuses a non-number scale", () => {
    expect(conformHomebrewGrant(abjurationAdept)).toEqual(abjurationAdept);
    expect(conformHomebrewGrant(transmutationAdept)).toEqual(transmutationAdept);
    expect(
      conformHomebrewGrant({
        ...transmutationAdept,
        do: { kind: "speed-bonus", perSlotLevel: "5" },
      })
    ).toBeNull();
  });
});
