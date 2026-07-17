/**
 * A4 Phase 3 + Phase 8 — Damage Resistance integrity test.
 *
 * After Phase 8 the legacy `deriveResistances` regex parser is deleted.
 * This test now ensures every race trait whose description mentions
 * "Resistance to X damage" carries a declarative `damage-resistance`
 * grant — otherwise the sheet header silently loses the resistance.
 */

import { describe, it, expect } from "vitest";
import { srd } from "../_harness/loc";
import { SRD_RACES, rawRaceTraitCatKey } from "@/data/races";

describe("A4 — every race resistance trait carries a declarative grant", () => {
  for (const race of SRD_RACES) {
    for (const trait of race.traits) {
      const desc = srd("race", rawRaceTraitCatKey(race.id, trait), "description", "en");
      // Only check non-situational permanent resistances
      if (!/Resistance to [A-Za-z]+ damage/.test(desc)) continue;
      if (/resistance to all damage/i.test(desc)) continue;
      // Dragonborn's "the damage type determined by your Draconic Ancestry"
      // is a choice grant — Phase 7 handles separately; not in scope here.
      if (/determined by your/i.test(desc)) continue;
      // A PLAYER-CHOSEN resistance ("Resistance to one damage type of your
      // choice: …", Reborn Strange Endurance) is a `choice-resistance` grant
      // (pick 1 of N, re-selectable), not a flat `damage-resistance` — handled
      // by the choice-resistance picker, same as Dragonborn's ancestry choice.
      if (/of your choice/i.test(desc)) continue;

      it(`${srd("race", race.id, "name", "en")} / ${srd("race", rawRaceTraitCatKey(race.id, trait), "name", "en")}: has damage-resistance grant`, () => {
        const has = (trait.grants ?? []).some((g) => g.type === "damage-resistance");
        expect(has).toBe(true);
      });
    }
  }
});
