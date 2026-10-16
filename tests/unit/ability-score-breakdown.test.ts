/**
 * Every number explained (re-foundation phase 2): an effective ability score
 * decomposes into its stored base and, by name, what an item or feature does to it.
 * A floor ("your score becomes 19", Amulet of Health), an additive bonus and the
 * resulting-score cap that trims it ("+2, to a maximum of 20", Belt of Dwarvenkind).
 * The stored base is kept whole: the increases baked into it are not recorded
 * reliably, so the breakdown never invents a split. The guard runs over every dev
 * scenario and all six abilities, so the explanation equals the shown score.
 */

import { describe, expect, it } from "vitest";

import {
  abilityScoreBreakdown,
  aggregateCharacterGrants,
} from "@/lib/aggregate-character";
import { aggregateAbilityScores } from "@/lib/compute";
import { DEV_SCENARIOS, buildDevScenario } from "@/lib/dev-scenarios";
import { breakdownTotal, type RawBreakdownPart } from "@/lib/value-breakdown";
import { makeCharacterDoc } from "./_helpers";
import type { AbilityCode } from "@/data/types";

const ABILITIES: AbilityCode[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

function labelOf(part: RawBreakdownPart): string {
  if ("term" in part.label) return `term:${part.label.term}`;
  if ("ability" in part.label) return `ability:${part.label.ability}`;
  const loc = part.label.loc as { srd?: { kind: string; key: string } };
  return loc.srd ? `${loc.srd.kind}:${loc.srd.key}` : "loc";
}

const rows = (parts: RawBreakdownPart[]) =>
  parts.map((p) => [labelOf(p), "value" in p ? p.value : 0]);

function withItem(srdId: string, con: number) {
  const doc = makeCharacterDoc({ classId: "fighter", level: 5 });
  doc.character.abilityScores = { ...doc.character.abilityScores, CON: con };
  doc.character.equipment = [{ srdId, equipped: true, attuned: true }];
  return doc;
}

describe("ability score breakdown", () => {
  it("is the stored base alone when nothing changes it", () => {
    const doc = makeCharacterDoc({ classId: "fighter", level: 5 });
    const agg = aggregateCharacterGrants(doc.character, doc.session);
    expect(rows(abilityScoreBreakdown(doc.character.abilityScores, agg, "STR"))).toEqual([
      ["term:breakdown.base", doc.character.abilityScores.STR],
    ]);
  });

  it("names the item that raises the score to a floor (Amulet of Health)", () => {
    const doc = withItem("amulet-of-health", 12);
    const agg = aggregateCharacterGrants(doc.character, doc.session);
    expect(rows(abilityScoreBreakdown(doc.character.abilityScores, agg, "CON"))).toEqual([
      ["term:breakdown.base", 12],
      ["magic-item:amulet-of-health", 7],
    ]);
  });

  it("names the item's bonus and the cap that trims it (Belt of Dwarvenkind)", () => {
    const doc = withItem("belt-of-dwarvenkind", 19);
    const agg = aggregateCharacterGrants(doc.character, doc.session);
    expect(rows(abilityScoreBreakdown(doc.character.abilityScores, agg, "CON"))).toEqual([
      ["term:breakdown.base", 19],
      ["magic-item:belt-of-dwarvenkind", 2],
      ["magic-item:belt-of-dwarvenkind", -1],
    ]);
  });

  it("sums to the shown score for every dev scenario and every ability", () => {
    for (const id of Object.keys(DEV_SCENARIOS)) {
      const doc = buildDevScenario(id);
      if (!doc) continue;
      const agg = aggregateCharacterGrants(doc.character, doc.session);
      const shown = aggregateAbilityScores(doc.character.abilityScores, agg);
      for (const ability of ABILITIES) {
        expect(
          breakdownTotal(
            abilityScoreBreakdown(doc.character.abilityScores, agg, ability)
          ),
          `${id} ${ability}`
        ).toBe(shown[ability]);
      }
    }
  });
});
