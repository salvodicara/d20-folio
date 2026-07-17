/**
 * `cunning-strike-option` grant — the Rogue Cunning Strike catalogue primitive.
 *
 * A Cunning Strike option rides on a Sneak Attack hit and is paid for by
 * forgoing Sneak Attack dice (NOT the action economy). The base feature (L5),
 * Devious Strikes (L14), and subclass adders (Thief Supreme Sneak L9, Scion
 * Strike Fear L9) all contribute options to one `cunningStrikeOptions`
 * catalogue. This file proves the EVALUATOR aggregates the kind; the consumer
 * (`resolveCunningStrikeOptions`) is covered in its own file.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, emptyAggregate, type GrantSource } from "@/lib/grants";
import { loc } from "../_harness/loc";

const BASE_CUNNING_STRIKE: GrantSource = {
  id: "rogue-cunning-strike",
  name: { en: "Cunning Strike", it: "Colpo Astuto" },
  grants: [
    {
      type: "cunning-strike-option",
      optionId: "poison",
      name: { en: "Poison", it: "Veleno" },
      cost: 1,
      description: { en: "CON save or Poisoned.", it: "TS COS o Avvelenato." },
      save: "CON",
      condition: "poisoned",
    },
    {
      type: "cunning-strike-option",
      optionId: "withdraw",
      name: { en: "Withdraw", it: "Ritirata" },
      cost: 1,
      description: { en: "Move half your Speed.", it: "Muoviti di metà Velocità." },
    },
  ],
};

const SUPREME_SNEAK: GrantSource = {
  id: "rogue-thief-supreme-sneak",
  name: { en: "Supreme Sneak", it: "Furtività Suprema" },
  grants: [
    {
      type: "cunning-strike-option",
      optionId: "stealth-attack",
      name: { en: "Stealth Attack", it: "Attacco Furtivo" },
      cost: 1,
      description: {
        en: "Hide's Invisible isn't ended behind Three-Quarters/Total Cover.",
        it: "Invisibile di Nascondersi non termina dietro copertura.",
      },
    },
  ],
};

describe("cunning-strike-option evaluator", () => {
  it("is empty by default and on the empty aggregate", () => {
    expect(emptyAggregate().cunningStrikeOptions).toEqual([]);
    expect(evaluateGrants([]).cunningStrikeOptions).toEqual([]);
  });

  it("aggregates an option with its source, cost, save and condition", () => {
    const agg = evaluateGrants([BASE_CUNNING_STRIKE]);
    expect(agg.cunningStrikeOptions).toHaveLength(2);
    const poison = agg.cunningStrikeOptions.find((o) => o.optionId === "poison");
    expect(poison).toMatchObject({
      sourceId: "rogue-cunning-strike",
      optionId: "poison",
      cost: 1,
      save: "CON",
      condition: "poisoned",
    });
    expect(loc(poison?.name, "it")).toBe("Veleno");
  });

  it("carries no save/condition for a save-less option (Withdraw)", () => {
    const agg = evaluateGrants([BASE_CUNNING_STRIKE]);
    const withdraw = agg.cunningStrikeOptions.find((o) => o.optionId === "withdraw");
    expect(withdraw?.save).toBeUndefined();
    expect(withdraw?.condition).toBeUndefined();
    expect(withdraw?.cost).toBe(1);
  });

  it("unions options from multiple sources (base + subclass adder)", () => {
    const agg = evaluateGrants([BASE_CUNNING_STRIKE, SUPREME_SNEAK]);
    expect(agg.cunningStrikeOptions.map((o) => o.optionId).sort()).toEqual([
      "poison",
      "stealth-attack",
      "withdraw",
    ]);
    // The Thief option is attributed to its own subclass feature.
    expect(
      agg.cunningStrikeOptions.find((o) => o.optionId === "stealth-attack")?.sourceId
    ).toBe("rogue-thief-supreme-sneak");
  });

  it("dedupes by optionId — first source wins its attribution", () => {
    const duplicateSource: GrantSource = {
      id: "some-other-feature",
      name: { en: "Other", it: "Altro" },
      grants: [
        {
          type: "cunning-strike-option",
          optionId: "poison",
          name: { en: "Poison (dup)", it: "Veleno (dup)" },
          cost: 2,
          description: { en: "dup", it: "dup" },
          save: "DEX",
        },
      ],
    };
    const agg = evaluateGrants([BASE_CUNNING_STRIKE, duplicateSource]);
    const poison = agg.cunningStrikeOptions.filter((o) => o.optionId === "poison");
    expect(poison).toHaveLength(1);
    // First wins — keeps the base feature's cost/save, not the duplicate's.
    expect(poison[0]?.sourceId).toBe("rogue-cunning-strike");
    expect(poison[0]?.cost).toBe(1);
    expect(poison[0]?.save).toBe("CON");
  });

  it("surfaces through a while-active wrapper like any other inner grant", () => {
    const wrapped: GrantSource = {
      id: "hypothetical-toggle",
      name: { en: "Toggle", it: "Interruttore" },
      grants: [
        {
          type: "while-active",
          activeKey: "hypothetical-toggle",
          label: { en: "Toggle", it: "Interruttore" },
          grants: [
            {
              type: "cunning-strike-option",
              optionId: "trip",
              name: { en: "Trip", it: "Sgambetto" },
              cost: 1,
              description: { en: "DEX save or Prone.", it: "TS DES o Prono." },
              save: "DEX",
              condition: "prone",
            },
          ],
        },
      ],
    };
    // Inactive → no option leaks.
    expect(evaluateGrants([wrapped]).cunningStrikeOptions).toHaveLength(0);
    // Active → the inner option merges into the same catalogue field.
    const agg = evaluateGrants([wrapped], new Set(["hypothetical-toggle"]));
    expect(agg.cunningStrikeOptions.map((o) => o.optionId)).toEqual(["trip"]);
  });
});
