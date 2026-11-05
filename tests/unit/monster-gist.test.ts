/**
 * Every SRD monster carries a one-line `gist` in English and Italian: what it is
 * and how it fights, for the compendium's «In breve» line. The monster catalogue
 * loads lazily in every locale, so both gists sit beside the name.
 */
import { describe, expect, it } from "vitest";
import enMonsters from "@/i18n/en/srd/monsters.json";
import itMonsters from "@/i18n/it/srd/monsters.json";
import { MONSTERS } from "@/data/monsters";

const GIST_MAX = 90;

const CATALOGUES = {
  en: enMonsters as Record<string, { gist?: string }>,
  it: itMonsters as Record<string, { gist?: string }>,
};
const ids = MONSTERS.filter((m) => m.source === "SRD").map((m) => m.id);

describe("SRD monster gists", () => {
  it("finds the monsters", () => {
    expect(ids.length).toBeGreaterThan(300);
  });

  for (const locale of ["en", "it"] as const) {
    it(`every monster has a ${locale} gist of one short line`, () => {
      const bad = ids.flatMap((id) => {
        const gist = CATALOGUES[locale][id]?.gist ?? "";
        if (gist === "") return [`${id}: missing`];
        if (gist.length > GIST_MAX) return [`${id}: ${gist.length} chars`];
        if (gist.endsWith(".") || gist.includes("\n")) return [`${id}: not one line`];
        return [];
      });
      expect(bad).toEqual([]);
    });
  }
});
