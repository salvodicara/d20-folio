/**
 * Jumping as derived numbers (SRD 5.2.1 rules glossary "Long Jump" / "High Jump"):
 * with a 10-ft running start a Long Jump covers feet equal to your Strength score
 * and a High Jump 3 + your Strength modifier feet (minimum 0); from a standstill,
 * half. The grants that change jumping come from their own catalogue text:
 *  - Second-Story Work (Thief): "You can determine your jump distance using your
 *    Dexterity rather than your Strength."
 *  - Boots of Striding and Springing, Jump: "jump up to 30 feet by spending only
 *    10 feet of movement", once on each of your turns.
 * Every number carries breakdown parts that sum to it.
 */
import { describe, expect, it } from "vitest";

import classFeaturesEn from "@/i18n/en/srd/class-features.json";
import magicItemsEn from "@/i18n/en/srd/magic-items.json";
import spellsEn from "@/i18n/en/srd/spells.json";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { aggregateAbilityScores } from "@/lib/compute";
import { deriveJumps } from "@/lib/jump";
import { srdText } from "@/lib/loc-text";
import { breakdownTotal, type RawBreakdownPart } from "@/lib/value-breakdown";
import type { CharacterDoc } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

function jumpsOf(doc: CharacterDoc) {
  const agg = aggregateCharacterGrants(doc.character, doc.session);
  return deriveJumps(aggregateAbilityScores(doc.character.abilityScores, agg), agg);
}

function scores(STR: number, DEX = 10) {
  return { STR, DEX, CON: 10, INT: 10, WIS: 10, CHA: 10 };
}

function labelOf(part: RawBreakdownPart): string {
  if ("term" in part.label) return `term:${part.label.term}`;
  if ("ability" in part.label) return `ability:${part.label.ability}`;
  const loc = part.label.loc as { srd?: { kind: string; key: string } };
  return loc.srd ? `${loc.srd.kind}:${loc.srd.key}` : "loc";
}

const rows = (parts: ReadonlyArray<RawBreakdownPart>) =>
  parts.map((p) => [labelOf(p), "value" in p ? p.value : 0]);

describe("jump distances from Strength (SRD 5.2.1)", () => {
  it.each([
    // [STR, long, high]: long = score; high = 3 + modifier, minimum 0.
    [15, 15, 5],
    [10, 10, 3],
    [8, 8, 2],
    [6, 6, 1],
    [3, 3, 0],
    [1, 1, 0],
    [20, 20, 8],
  ])("STR %i jumps %i ft long and %i ft high", (str, long, high) => {
    const jumps = jumpsOf(makeCharacterDoc({ abilityScores: scores(str) }));
    expect(jumps.long).toBe(long);
    expect(jumps.high).toBe(high);
    expect(breakdownTotal(jumps.longParts)).toBe(long);
    expect(breakdownTotal(jumps.highParts)).toBe(high);
    // From a standstill, half (the SRD rounds nothing: the half may be a fraction).
    expect(jumps.standingLong).toBe(long / 2);
    expect(jumps.standingHigh).toBe(high / 2);
  });

  it("names the Strength score, the base 3 and the modifier", () => {
    const jumps = jumpsOf(makeCharacterDoc({ abilityScores: scores(16) }));
    expect(rows(jumps.longParts)).toEqual([["ability:STR", 16]]);
    expect(rows(jumps.highParts)).toEqual([
      ["term:breakdown.base", 3],
      ["ability:STR", 3],
    ]);
  });

  it("a modifier below -3 shows the minimum of 0 as its own line", () => {
    const jumps = jumpsOf(makeCharacterDoc({ abilityScores: scores(1) }));
    expect(rows(jumps.highParts)).toEqual([
      ["term:breakdown.base", 3],
      ["ability:STR", -5],
      ["term:breakdown.speed.minimum", 2],
    ]);
  });
});

describe("Second-Story Work: jump distance from Dexterity", () => {
  it("its catalogue text says so", () => {
    expect(
      (classFeaturesEn as unknown as Record<string, { description: string }>)[
        "rogue-thief-second-story-work"
      ]?.description
    ).toMatch(/jump distance using your Dexterity rather than your Strength/);
  });

  const thief = (str: number, dex: number) =>
    makeCharacterDoc({
      classId: "rogue",
      subclassId: "thief",
      level: 3,
      abilityScores: scores(str, dex),
      features: [{ srdId: "rogue-thief-second-story-work" }],
    });

  it("a Thief with the better Dexterity jumps by it", () => {
    const jumps = jumpsOf(thief(10, 18));
    expect(jumps.long).toBe(18);
    expect(jumps.high).toBe(7);
    expect(rows(jumps.longParts)).toEqual([["ability:DEX", 18]]);
    const dex = jumps.longParts[0];
    expect(dex && dex.why?.rule).toEqual({
      loc: srdText("class-feature", "rogue-thief-second-story-work", "name"),
    });
  });

  it("keeps Strength when it is the better score", () => {
    const jumps = jumpsOf(thief(16, 12));
    expect(jumps.long).toBe(16);
    expect(rows(jumps.longParts)).toEqual([["ability:STR", 16]]);
  });

  it("anyone else jumps by Strength even with a higher Dexterity", () => {
    const jumps = jumpsOf(makeCharacterDoc({ abilityScores: scores(10, 18) }));
    expect(jumps.long).toBe(10);
  });
});

describe("a 30-ft leap for 10 ft of movement, once per turn", () => {
  it("is what the Boots and the Jump spell say", () => {
    const items = magicItemsEn as unknown as Record<string, { description: string }>;
    const spells = spellsEn as unknown as Record<string, { description: string }>;
    expect(items["boots-of-striding-and-springing"]?.description).toMatch(
      /Once on each of your turns, you can jump up to 30 feet by spending only 10 feet of movement/
    );
    expect(spells["jump"]?.description).toMatch(
      /Once on each of its turns .* jump up to 30 feet by spending 10 feet of movement/
    );
  });

  it("comes with the Boots worn and attuned", () => {
    const jumps = jumpsOf(
      makeCharacterDoc({
        abilityScores: scores(10),
        equipment: [
          { srdId: "boots-of-striding-and-springing", equipped: true, attuned: true },
        ],
      })
    );
    expect(jumps.leap).toMatchObject({ distanceFt: 30, movementCostFt: 10 });
    expect(rows(jumps.leap?.parts ?? [])).toEqual([
      ["magic-item:boots-of-striding-and-springing", 30],
    ]);
    // The Boots never change the Strength jumps.
    expect(jumps.long).toBe(10);
  });

  it("not without attunement", () => {
    const jumps = jumpsOf(
      makeCharacterDoc({
        equipment: [{ srdId: "boots-of-striding-and-springing", equipped: true }],
      })
    );
    expect(jumps.leap).toBeNull();
  });

  it("comes while Jump is lit on you", () => {
    const doc = makeCharacterDoc(
      { abilityScores: scores(10), spells: [{ srdId: "jump", prepared: true }] },
      { activeFeatures: ["spell-jump"] }
    );
    const jumps = jumpsOf(doc);
    expect(jumps.leap).toMatchObject({ distanceFt: 30, movementCostFt: 10 });
    expect(rows(jumps.leap?.parts ?? [])).toEqual([["spell:jump", 30]]);
  });

  it("not while Jump is only prepared", () => {
    const doc = makeCharacterDoc({ spells: [{ srdId: "jump", prepared: true }] });
    expect(jumpsOf(doc).leap).toBeNull();
  });

  it("nothing else grants one", () => {
    expect(jumpsOf(makeCharacterDoc()).leap).toBeNull();
  });
});
