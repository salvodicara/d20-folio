/**
 * Burrow Speed as a first-class speed, like Fly, Swim and Climb. SRD 5.2.1 (Rules
 * Glossary): "Burrow Speed. A creature that has a Burrow Speed can use that speed to
 * move through sand, earth, mud, or ice. The creature can't burrow through solid
 * rock unless it has a trait that allows it to do so."
 *
 * A burrow speed reaches the character through a `burrow-speed` grant (a homebrew
 * species trait or feature, the same language as `fly-speed`); a Beast form's stat
 * block already carries one (polymorph stamps it). The number is explained (its
 * source names it), and a hand-set range keeps the explanation.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type Grant } from "@/lib/grants";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { breakdownTotal, isHandSet } from "@/lib/value-breakdown";
import { deriveCharacter } from "@/lib/views/derive-character";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import { deriveSensesAndSpeeds, SPEED_KINDS } from "@/lib/views/sheet-view";
import type { CharacterDoc, CustomFeature } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";
import { customInstanceId } from "./__helpers__/custom-items";

const trait = (title: string, grants: Grant[]): CustomFeature => ({
  custom: true,
  title,
  emoji: "⛏️",
  source: "Homebrew",
  tags: [],
  contentBlocks: [],
  grants,
  instanceId: customInstanceId(title),
});

const burrower = (
  grants: Grant[],
  extra: Partial<CharacterDoc["character"]> = {}
): CharacterDoc =>
  makeCharacterDoc({ features: [trait("Earth Glide", grants)], ...extra });

const aggregateOf = (doc: CharacterDoc) =>
  evaluateGrants(resolveGrantSourcesForFeatures(doc.character.features), new Set());

describe("a burrow speed is a speed like fly, swim and climb", () => {
  it("is one of the speed kinds", () => {
    expect(SPEED_KINDS).toContain("burrow");
  });

  it("a grant gives it; the largest of two wins, like any speed", () => {
    expect(aggregateOf(makeCharacterDoc()).burrowSpeed).toBeNull();
    const doc = makeCharacterDoc({
      features: [
        trait("Earth Glide", [{ type: "burrow-speed", amount: 20 }]),
        trait("Deep Delver", [{ type: "burrow-speed", amount: 15 }]),
      ],
    });
    expect(aggregateOf(doc).burrowSpeed).toBe(20);
  });

  it("can equal the walking speed", () => {
    const doc = burrower([{ type: "burrow-speed", amount: "equal-to-walking" }]);
    expect(aggregateOf(doc).burrowSpeed).toBe("equal-to-walking");
    expect(deriveCharacter(doc).speeds).toEqual([{ kind: "burrow", rangeFt: 30 }]);
  });

  it("is listed with the other speeds, after climb", () => {
    const doc = burrower([
      { type: "burrow-speed", amount: 20 },
      { type: "climb-speed", amount: 30 },
    ]);
    const { speeds } = deriveSensesAndSpeeds(aggregateOf(doc), 30);
    expect(speeds).toEqual([
      { kind: "climb", rangeFt: 30 },
      { kind: "burrow", rangeFt: 20 },
    ]);
  });
});

describe("the burrow speed is explained", () => {
  it("a homebrew trait's speed reads as granted, summing to the number shown", () => {
    const n = sheetNumbers(burrower([{ type: "burrow-speed", amount: 20 }]));
    const burrow = n.otherSpeeds.burrow;
    expect(burrow?.total).toBe(20);
    expect(burrow?.parts).toEqual([
      { label: { term: "breakdown.speed.granted" }, value: 20 },
    ]);
    expect(isHandSet(burrow?.parts)).toBe(false);
  });

  it("a catalogue source is named (Roving: Climb and Swim equal to your Speed)", () => {
    const doc = makeCharacterDoc({
      classes: [{ classId: "ranger", level: 6 }],
      features: [{ srdId: "ranger-roving" }],
    });
    const climb = sheetNumbers(doc).otherSpeeds.climb;
    expect(climb?.total).toBe(deriveCharacter(doc).walkingSpeedFt);
    expect(climb?.parts).toEqual([
      {
        label: {
          loc: { srd: { kind: "class-feature", key: "ranger-roving", field: "name" } },
        },
        value: climb?.total,
        note: { term: "breakdown.speed.equalToWalking" },
      },
    ]);
  });

  it("a speed equal to the walking speed follows it, and says so", () => {
    const doc = burrower([{ type: "burrow-speed", amount: "twice-walking" }], {
      speedOverride: 25,
    });
    const burrow = sheetNumbers(doc).otherSpeeds.burrow;
    expect(burrow?.total).toBe(50);
    expect(burrow?.parts?.[0]?.note).toEqual({ term: "breakdown.speed.twiceWalking" });
    expect(breakdownTotal(burrow?.parts ?? [])).toBe(50);
  });

  it("a hand-set range wins and stays explained", () => {
    const doc = burrower([{ type: "burrow-speed", amount: 20 }], {
      speedOverrides: { burrow: 40 },
    });
    expect(deriveCharacter(doc).speeds).toEqual([{ kind: "burrow", rangeFt: 40 }]);
    const burrow = sheetNumbers(doc).otherSpeeds.burrow;
    expect(burrow?.total).toBe(40);
    expect(breakdownTotal(burrow?.parts ?? [])).toBe(40);
    expect(isHandSet(burrow?.parts)).toBe(true);
  });

  it("no grant, no burrow speed", () => {
    expect(sheetNumbers(makeCharacterDoc()).otherSpeeds.burrow).toBeUndefined();
  });
});
