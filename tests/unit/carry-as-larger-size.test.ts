import { describe, expect, it } from "vitest";
import { SRD_FEATS } from "@/data/feats";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { SRD_RACES } from "@/data/races";
import { carryingCapacity } from "@/lib/compute";
import { evaluateGrants } from "@/lib/grants";
import type { Grant } from "@/lib/grant-schema";
import enFeats from "@/i18n/en/srd/feats.json";
import enMagicItems from "@/i18n/en/srd/magic-items.json";
import enRaces from "@/i18n/en/srd/races.json";

/**
 * "You count as one size larger when determining your carrying capacity"
 * (Goliath Powerful Build) doubles a Medium character's capacity (2024: Large
 * ×2). Cases come from the English SRD text (docs/RULES_COVERAGE.md).
 */
const LARGER = /count as one size larger when determining your carrying capacity/i;

type Texts = Record<string, { description?: string } | undefined>;

const sources: Array<{
  id: string;
  text: string | undefined;
  grants?: readonly Grant[];
}> = [
  ...SRD_RACES.flatMap((race) =>
    race.traits.map((trait) => ({
      id: `${race.id}.traits.${trait.id}`,
      text: (enRaces as Texts)[`${race.id}.traits.${trait.id}`]?.description,
      grants: trait.grants,
    }))
  ),
  ...SRD_FEATS.map((feat) => ({
    id: feat.id,
    text: (enFeats as Texts)[feat.id]?.description,
    grants: feat.grants,
  })),
  ...SRD_MAGIC_ITEMS.map((item) => ({
    id: item.id,
    text: (enMagicItems as Texts)[item.id]?.description,
    grants: item.grants,
  })),
];

const larger = sources.filter((source) => LARGER.test(source.text ?? ""));

describe("carrying capacity as one size larger", () => {
  it("finds the clause in the catalogue text", () => {
    expect(larger.length).toBeGreaterThan(0);
  });

  it.each(larger.map((source) => [source.id, source]))(
    "%s makes the character carry as one size larger",
    (_id, source) => {
      const aggregate = evaluateGrants([{ id: source.id, grants: source.grants ?? [] }]);
      expect(aggregate.carryAsLargerSize).toBe(true);
    }
  );

  it("a Medium character carrying as Large doubles capacity and push/drag/lift", () => {
    expect(carryingCapacity(15)).toEqual({ carry: 225, pushDragLift: 450 });
    expect(carryingCapacity(15, { asLargerSize: true })).toEqual({
      carry: 450,
      pushDragLift: 900,
    });
  });
});
