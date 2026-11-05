/**
 * Every SRD spell carries a one-line `gist` in English and Italian: the
 * compendium's «In breve» line and the spell picker's summary. Plain facts in one
 * line, so each stays under the length cap and ends without a full stop.
 */
import { describe, expect, it } from "vitest";
import { srd } from "../_harness/loc";
import { SRD_CANTRIPS } from "@/data/spells/cantrips";
import { SRD_SPELLS_LEVEL1 } from "@/data/spells/level1";
import { SRD_SPELLS_LEVEL2 } from "@/data/spells/level2";
import { SRD_SPELLS_LEVEL3 } from "@/data/spells/level3";
import { SRD_SPELLS_LEVEL4 } from "@/data/spells/level4";
import { SRD_SPELLS_LEVEL5 } from "@/data/spells/level5";
import { SRD_SPELLS_LEVEL6 } from "@/data/spells/level6";
import { SRD_SPELLS_LEVEL7 } from "@/data/spells/level7";
import { SRD_SPELLS_LEVEL8 } from "@/data/spells/level8";
import { SRD_SPELLS_LEVEL9 } from "@/data/spells/level9";

const GIST_MAX = 90;

const SRD_SPELLS = [
  ...SRD_CANTRIPS,
  ...SRD_SPELLS_LEVEL1,
  ...SRD_SPELLS_LEVEL2,
  ...SRD_SPELLS_LEVEL3,
  ...SRD_SPELLS_LEVEL4,
  ...SRD_SPELLS_LEVEL5,
  ...SRD_SPELLS_LEVEL6,
  ...SRD_SPELLS_LEVEL7,
  ...SRD_SPELLS_LEVEL8,
  ...SRD_SPELLS_LEVEL9,
];

describe("spell gists", () => {
  it("covers the SRD spells", () => {
    expect(SRD_SPELLS.length).toBeGreaterThan(300);
  });

  for (const locale of ["en", "it"] as const) {
    it(`every SRD spell has a ${locale} gist of one short line`, () => {
      const bad = SRD_SPELLS.flatMap((spell) => {
        const gist = srd("spell", spell.id, "gist", locale);
        if (gist === "") return [`${spell.id}: missing`];
        if (gist.length > GIST_MAX) return [`${spell.id}: ${gist.length} chars`];
        if (/[.\n]$/.test(gist) || gist.includes("\n"))
          return [`${spell.id}: not one line`];
        return [];
      });
      expect(bad).toEqual([]);
    });
  }
});
