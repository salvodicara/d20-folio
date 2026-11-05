/**
 * "The ability increased by this feat" (Fey-Touched: «The spells' spellcasting
 * ability is the ability increased by this feat»): one stored answer on the feat
 * ref, read live by its spells, its Concentration bonus and its formulas. While
 * the answer is missing, each reads what it read before the answer was stored.
 *
 * Public leg: synthetic feat ids and grant lists (the pack feats that carry these
 * shapes are pinned in content-pack/tests/unit/feat-ability.pack.test.ts).
 */
import { describe, expect, it } from "vitest";

import {
  featAbilityMatters,
  featAbilityOf,
  featsOwingAbility,
  resolveFeatAbilityGrants,
} from "@/lib/feat-ability";
import { getAlwaysPreparedFromGrants, injectExpandedSpells } from "@/lib/expanded-spells";
import type { Grant } from "@/lib/grants";
import { resolveSpellAbility, spellAbilityPinned } from "@/lib/resolve-spell-ability";
import { resolveConcentrationSaveBonus } from "@/lib/compute";
import { evaluateGrants } from "@/lib/grants";
import type { CharacterData, SrdFeatureRef, SrdSpellRef } from "@/types/character";

const INCREASE: Grant = {
  type: "choice-ability-score",
  abilities: ["INT", "WIS", "CHA"],
  amount: 1,
  cap: 20,
};

type Caster = Pick<
  CharacterData,
  "spellcasting" | "speciesSpellAbility" | "classes" | "features"
>;

function caster(features: SrdFeatureRef[], speciesSpellAbility?: "INT"): Caster {
  return {
    classes: [{ classId: "wizard", level: 5 }],
    spellcasting: { ability: "INT" } as CharacterData["spellcasting"],
    features,
    ...(speciesSpellAbility ? { speciesSpellAbility } : {}),
  };
}

describe("featAbilityOf", () => {
  it("reads the feat ref's stored answer, null while unanswered", () => {
    expect(featAbilityOf({ features: [{ srdId: "x", featAbility: "WIS" }] }, "x")).toBe(
      "WIS"
    );
    expect(featAbilityOf({ features: [{ srdId: "x" }] }, "x")).toBeNull();
    expect(featAbilityOf({ features: [] }, "x")).toBeNull();
  });
});

describe("a feat's spell cast with the ability increased by the feat", () => {
  const grants: Grant[] = [
    INCREASE,
    { type: "always-prepared-spell", spellId: "misty-step", spellAbilitySource: "feat" },
  ];

  it("is stamped with the feat that owns it", () => {
    expect(getAlwaysPreparedFromGrants([{ id: "x", grants }])).toEqual([
      { spellId: "misty-step", featSpellAbility: "x" },
    ]);
  });

  it("a stored copy of the spell gains the marker on read, keeping a player pin", () => {
    const entries = getAlwaysPreparedFromGrants([{ id: "x", grants }]);
    expect(
      injectExpandedSpells([{ srdId: "misty-step", prepared: true }], entries)
    ).toEqual([
      {
        srdId: "misty-step",
        prepared: true,
        alwaysPrepared: true,
        featSpellAbility: "x",
      },
    ]);
    expect(
      injectExpandedSpells(
        [{ srdId: "misty-step", prepared: true, spellAbilityOverride: "CHA" }],
        entries
      )
    ).toEqual([
      {
        srdId: "misty-step",
        prepared: true,
        alwaysPrepared: true,
        spellAbilityOverride: "CHA",
      },
    ]);
  });

  const spell: SrdSpellRef = { srdId: "misty-step", featSpellAbility: "x" };

  it("casts with the feat's answer", () => {
    const ch = caster([{ srdId: "x", featAbility: "WIS" }]);
    expect(resolveSpellAbility(spell, ch)).toBe("WIS");
    expect(spellAbilityPinned(spell, ch)).toBe(true);
  });

  it("unanswered, casts with the class ability, as before", () => {
    const ch = caster([{ srdId: "x" }]);
    expect(resolveSpellAbility(spell, ch)).toBe("INT");
    expect(spellAbilityPinned(spell, ch)).toBe(false);
  });

  it("a concrete pin on the spell still wins over the feat's answer", () => {
    const ch = caster([{ srdId: "x", featAbility: "WIS" }]);
    expect(resolveSpellAbility({ ...spell, spellAbilityOverride: "CHA" }, ch)).toBe(
      "CHA"
    );
  });
});

describe("a feat spell whose unanswered fallback is the species pick", () => {
  const grants: Grant[] = [
    INCREASE,
    {
      type: "always-prepared-spell",
      spellId: "ray-of-frost",
      spellAbilitySource: "feat",
      spellAbilityFallback: "species",
    },
  ];
  const [entry] = getAlwaysPreparedFromGrants([{ id: "x", grants }]);

  it("carries both markers", () => {
    expect(entry).toEqual({
      spellId: "ray-of-frost",
      featSpellAbility: "x",
      speciesSpellAbility: true,
    });
  });

  const [ref] = injectExpandedSpells([], entry ? [entry] : []);

  it("answered, reads the feat; unanswered, reads the species pick (Charisma unset)", () => {
    if (!ref) throw new Error("no ref");
    expect(resolveSpellAbility(ref, caster([{ srdId: "x", featAbility: "WIS" }]))).toBe(
      "WIS"
    );
    expect(resolveSpellAbility(ref, caster([{ srdId: "x" }], "INT"))).toBe("INT");
    expect(resolveSpellAbility(ref, caster([{ srdId: "x" }]))).toBe("CHA");
  });
});

describe("feat grants that read the feat's answer", () => {
  // Inspiring Leader: «Temporary Hit Points equal to your character level plus
  // the modifier of the ability you increased with this feat» (Wis or Cha).
  const leader: Grant[] = [
    { type: "choice-ability-score", abilities: ["WIS", "CHA"], amount: 1, cap: 20 },
    { type: "temp-hp", formula: "FEAT+level" },
  ];

  it("a FEAT formula reads the answer, and the higher of the choices unanswered", () => {
    expect(resolveFeatAbilityGrants(leader, "WIS")[1]).toEqual({
      type: "temp-hp",
      formula: "WIS+level",
    });
    expect(resolveFeatAbilityGrants(leader, null)[1]).toEqual({
      type: "temp-hp",
      formula: "max(WIS,CHA)+level",
    });
  });

  // Conjuration Adept: «While you are concentrating on a Conjuration spell, you
  // add the modifier of the ability increased by this feat to the Constitution
  // saving throws you make to maintain that Concentration.»
  const adept: Grant[] = [
    INCREASE,
    { type: "concentration-save-bonus", ability: "feat", school: "conjuration" },
  ];

  it("a Concentration bonus of the feat's ability is added only once answered", () => {
    expect(resolveFeatAbilityGrants(adept, "WIS")[1]).toEqual({
      type: "concentration-save-bonus",
      ability: "WIS",
      school: "conjuration",
    });
    expect(resolveFeatAbilityGrants(adept, null)).toEqual([INCREASE]);
  });

  it("a school-scoped Concentration bonus counts only on a spell of that school", () => {
    const aggregate = evaluateGrants([
      { id: "x", grants: resolveFeatAbilityGrants(adept, "WIS") },
    ]);
    const scores = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 16, CHA: 10 };
    expect(resolveConcentrationSaveBonus(aggregate, scores, "conjuration")).toBe(3);
    expect(resolveConcentrationSaveBonus(aggregate, scores, "evocation")).toBe(0);
    expect(resolveConcentrationSaveBonus(aggregate, scores)).toBe(0);
  });

  it("grants that don't read it come back untouched", () => {
    const plain: Grant[] = [INCREASE, { type: "temp-hp", formula: "CHA+level" }];
    expect(resolveFeatAbilityGrants(plain, "WIS")).toBe(plain);
  });
});

describe("featAbilityMatters", () => {
  it("only when the feat lets you choose AND something reads the choice", () => {
    expect(
      featAbilityMatters([
        INCREASE,
        { type: "always-prepared-spell", spellId: "light", spellAbilitySource: "feat" },
      ])
    ).toBe(true);
    // The +1 is all there is: already in the scores, nothing to ask.
    expect(featAbilityMatters([INCREASE])).toBe(false);
    // A fixed increase has nothing to choose.
    expect(
      featAbilityMatters([
        { type: "ability-score", ability: "CHA", amount: 1 },
        { type: "always-prepared-spell", spellId: "light", spellAbilitySource: "feat" },
      ])
    ).toBe(false);
  });
});

describe("featsOwingAbility", () => {
  const reads: Grant[] = [
    INCREASE,
    { type: "always-prepared-spell", spellId: "light", spellAbilitySource: "feat" },
  ];
  const catalogue: Record<string, Grant[]> = { reads, plain: [INCREASE] };

  it("names each feat whose answer matters and was never stored, once", () => {
    expect(
      featsOwingAbility(
        {
          features: [
            { srdId: "reads" },
            { srdId: "reads" },
            { srdId: "plain" },
            { srdId: "unknown" },
          ],
        },
        (id) => catalogue[id]
      )
    ).toEqual(["reads"]);
    expect(
      featsOwingAbility(
        { features: [{ srdId: "reads", featAbility: "CHA" }] },
        (id) => catalogue[id]
      )
    ).toEqual([]);
  });
});
