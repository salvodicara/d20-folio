/**
 * A feat that changes a creature your spell summons (edge-case family M6, Familiar
 * Friend: "the familiar's Hit Point maximum increases by twice your character
 * level"): the familiar's maximum reads the bonus; without the feat, the stat block's.
 */
import { describe, expect, it } from "vitest";

import { conformHomebrewGrant, type Grant } from "@/lib/grants";
import { summonMaxHp } from "@/lib/play/companions";
import type { CustomFeature } from "@/types/character";

import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

const friend: Grant = {
  type: "companion-mod",
  companion: "find-familiar",
  hpBonus: { perCharacterLevel: 2 },
};

const withFeat = (grants: Grant[]) => {
  const feature: CustomFeature = {
    custom: true,
    title: "Friend",
    emoji: "*",
    source: "Homebrew",
    tags: [],
    contentBlocks: [],
    grants,
    instanceId: customInstanceId("friend"),
  };
  return makeCharacterDoc({ classId: "wizard", level: 5, features: [feature] });
};

describe("companion-mod", () => {
  it("adds twice the character level to the familiar's maximum", () => {
    expect(summonMaxHp(withFeat([friend]), "find-familiar", 3)).toBe(13);
  });

  it("changes only the creature it names, and nothing without the feat", () => {
    expect(summonMaxHp(withFeat([friend]), "summon-beast", 30)).toBe(30);
    expect(summonMaxHp(withFeat([]), "find-familiar", 3)).toBe(3);
  });

  it("is a homebrew grant the schema keeps", () => {
    expect(conformHomebrewGrant(friend)).toEqual(friend);
  });
});
