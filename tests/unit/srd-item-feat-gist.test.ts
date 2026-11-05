/**
 * Every SRD feat, magic item and piece of equipment with rules text carries a
 * one-line `gist` in English and Italian, for the compendium's «In breve» line.
 * The entries come from the public English catalogues: a top-level, named entry
 * with a description.
 */
import { describe, expect, it } from "vitest";
import { srd } from "../_harness/loc";
import type { SrdKind } from "@/i18n/resolver";
import enFeats from "@/i18n/en/srd/feats.json";
import enMagicItems from "@/i18n/en/srd/magic-items.json";
import enEquipment from "@/i18n/en/srd/equipment.json";

const GIST_MAX = 90;

const CATALOGUES: readonly [SrdKind, Record<string, Record<string, unknown>>][] = [
  ["feat", enFeats],
  ["magic-item", enMagicItems],
  ["equipment", enEquipment],
];

function describedIds(catalogue: Record<string, Record<string, unknown>>): string[] {
  return Object.entries(catalogue)
    .filter(([id, entry]) => !id.includes(".") && "name" in entry && entry.description)
    .map(([id]) => id);
}

describe("SRD feat and item gists", () => {
  for (const [kind, catalogue] of CATALOGUES) {
    const ids = describedIds(catalogue);

    it(`finds the ${kind} entries`, () => {
      expect(ids.length).toBeGreaterThan(10);
    });

    for (const locale of ["en", "it"] as const) {
      it(`every ${kind} has a ${locale} gist of one short line`, () => {
        const bad = ids.flatMap((id) => {
          const gist = srd(kind, id, "gist", locale);
          if (gist === "") return [`${id}: missing`];
          if (gist.length > GIST_MAX) return [`${id}: ${gist.length} chars`];
          if (gist.endsWith(".") || gist.includes("\n")) return [`${id}: not one line`];
          return [];
        });
        expect(bad).toEqual([]);
      });
    }
  }
});
