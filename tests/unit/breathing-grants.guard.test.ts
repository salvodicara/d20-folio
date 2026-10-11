import { describe, expect, it } from "vitest";
import { classFeatures } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import enClassFeatures from "@/i18n/en/srd/class-features.json";
import enFeats from "@/i18n/en/srd/feats.json";
import enInvocations from "@/i18n/en/srd/invocations.json";
import enMagicItems from "@/i18n/en/srd/magic-items.json";

/**
 * Every standing "you can breathe underwater" / "breathe normally in any
 * environment" clause in the catalogue text declares the
 * `air-and-water-breathing` grant, so the sheet shows it (docs/RULES_COVERAGE.md).
 * Cases come from the English SRD text, not a hand list. Potions are timed
 * consumables and spells target others: neither is a standing trait.
 */
const BREATHES = /you can breathe underwater|breathe normally in any environment/i;

type Texts = Record<string, { description?: string } | undefined>;

const sources: Array<{ id: string; text: string | undefined; grants: unknown }> = [
  ...SRD_MAGIC_ITEMS.filter((item) => item.type !== "potion").map((item) => ({
    id: `magic-item:${item.id}`,
    text: (enMagicItems as Texts)[item.id]?.description,
    grants: item.grants,
  })),
  ...SRD_INVOCATIONS.map((invocation) => ({
    id: `invocation:${invocation.id}`,
    text: (enInvocations as Texts)[invocation.id]?.description,
    grants: invocation.grants,
  })),
  ...SRD_FEATS.map((feat) => ({
    id: `feat:${feat.id}`,
    text: (enFeats as Texts)[feat.id]?.description,
    grants: feat.grants,
  })),
  ...classFeatures.map((feature) => ({
    id: `class-feature:${feature.id}`,
    text: (enClassFeatures as Texts)[feature.id]?.description,
    grants: feature.grants,
  })),
];

const breathers = sources.filter((source) => BREATHES.test(source.text ?? ""));

describe("underwater breathing is a grant wherever the text gives it", () => {
  it("finds the clause in the catalogue text", () => {
    expect(breathers.length).toBeGreaterThan(0);
  });

  it.each(breathers.map((source) => [source.id, source]))(
    "%s declares air-and-water-breathing",
    (_id, source) => {
      expect(JSON.stringify(source.grants ?? [])).toContain(
        '"type":"air-and-water-breathing"'
      );
    }
  );
});
