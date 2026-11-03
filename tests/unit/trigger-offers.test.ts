/**
 * Trigger rules that offer an action (edge-case M8): Hunter's Mark and Hex "If the
 * target drops to 0 Hit Points before this spell ends, you can take a Bonus Action
 * on a later turn to move the mark to a new creature". The rule offers "move-mark"
 * only when the creature that dropped is the one marked, and within its limit.
 */
import { describe, expect, it } from "vitest";

import type { Grant } from "@/lib/grants";
import { MOCK_CHARACTER } from "@/lib/mock";
import { firedTriggerOffers } from "@/lib/smart-tracker";
import type { CharacterDoc, CustomFeature, CustomSpell } from "@/types/character";

import { customInstanceId } from "./__helpers__/custom-items";

const withRule = (grant: Grant, used = 0): CharacterDoc => {
  const feature: CustomFeature = {
    custom: true,
    title: "Mark",
    emoji: "*",
    source: "Homebrew",
    tags: [],
    contentBlocks: [],
    grants: [grant],
    instanceId: customInstanceId("mark"),
  };
  return {
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      features: [...MOCK_CHARACTER.character.features, feature],
    },
    session: {
      ...MOCK_CHARACTER.session,
      trackers: used ? { [feature.instanceId]: { used } } : {},
    },
  };
};

const moveMark: Grant = {
  type: "trigger",
  on: "reduced-to-zero",
  if: { target: "marked" },
  do: { kind: "offer", actionId: "move-mark" },
};

describe("an offer when the marked creature drops", () => {
  it("offers to move the mark only for the marked creature", () => {
    const doc = withRule(moveMark);
    expect(firedTriggerOffers(doc, "reduced-to-zero", { targetMarked: true })).toEqual([
      expect.objectContaining({ actionId: "move-mark" }),
    ]);
    expect(firedTriggerOffers(doc, "reduced-to-zero", { targetMarked: false })).toEqual(
      []
    );
    expect(firedTriggerOffers(doc, "initiative", { targetMarked: true })).toEqual([]);
  });

  it("a limited rule offers while within its limit", () => {
    const limited: Grant = { ...moveMark, limit: { per: "long-rest", max: 1 } };
    const fresh = withRule(limited);
    expect(
      firedTriggerOffers(fresh, "reduced-to-zero", { targetMarked: true })
    ).toHaveLength(1);
  });

  it("a slotted Divination spell, within the predicate", () => {
    const adept: Grant = {
      type: "trigger",
      on: "cast-spell",
      if: { school: "divination", slot: true },
      do: { kind: "offer", actionId: "divination-refill" },
    };
    const doc = withRule(adept);
    expect(
      firedTriggerOffers(doc, "cast-spell", { school: "divination", slot: true })
    ).toHaveLength(1);
    expect(
      firedTriggerOffers(doc, "cast-spell", { school: "divination", slot: false })
    ).toEqual([]);
    expect(
      firedTriggerOffers(doc, "cast-spell", { school: "evocation", slot: true })
    ).toEqual([]);
  });

  it("a spell's rule fires while the spell is lit (Hunter's Mark is a spell, not a feature)", () => {
    const mark: CustomSpell = {
      custom: true,
      name: "Quarry",
      level: 1,
      school: "divination",
      castingTime: "bonus action",
      range: "90 feet",
      components: { v: true, s: false, m: false },
      duration: "1 hour",
      concentration: true,
      description: "You mark a creature.",
      prepared: true,
      instanceId: customInstanceId("Quarry"),
      mechanics: {
        grants: [
          { type: "while-active", activeKey: "homebrew-quarry", grants: [moveMark] },
        ],
      },
    };
    const doc = (lit: boolean): CharacterDoc => ({
      ...MOCK_CHARACTER,
      character: {
        ...MOCK_CHARACTER.character,
        spells: [...MOCK_CHARACTER.character.spells, mark],
      },
      session: {
        ...MOCK_CHARACTER.session,
        trackers: {},
        activeFeatures: lit ? ["homebrew-quarry"] : [],
      },
    });
    expect(
      firedTriggerOffers(doc(true), "reduced-to-zero", { targetMarked: true })
    ).toEqual([expect.objectContaining({ actionId: "move-mark" })]);
    expect(
      firedTriggerOffers(doc(false), "reduced-to-zero", { targetMarked: true })
    ).toEqual([]);
  });
});
