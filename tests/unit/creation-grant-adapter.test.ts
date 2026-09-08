import { describe, expect, it } from "vitest";
import { normalizeCreationGrants } from "@/lib/character-creation/grant-adapter";

describe("typed creation grant normalization", () => {
  it("uses canonical tool and language IDs for fixed typed catalogue names", () => {
    const result = normalizeCreationGrants(
      [
        { type: "tool-proficiency", tool: "Thieves' Tools" },
        { type: "language", language: "Thieves' Cant" },
      ],
      { prefix: "feature", level: 1 }
    );
    expect(result.benefits).toEqual([
      { kind: "proficiency", category: "tool", id: "thieves-tools" },
      { kind: "proficiency", category: "language", id: "thieves-cant" },
    ]);
  });
  it("resolves level-one proficiency-bonus uses while preserving the original scaling source", () => {
    const result = normalizeCreationGrants(
      [
        {
          type: "free-cast-spell",
          spellId: "speak-with-animals",
          chargesPerRest: 1,
          chargesFormula: "PB",
          rest: "long",
        },
      ],
      { prefix: "gift", level: 1, casting: { kind: "fixed", ability: "WIS" } }
    );
    expect(result.benefits).toEqual([
      {
        kind: "spell",
        id: "speak-with-animals",
        ability: "wisdom",
        policy: "free-cast",
        uses: 2,
        rest: "long",
      },
    ]);
  });
  it("preserves nested branch dependencies instead of promoting grandchildren", () => {
    const result = normalizeCreationGrants(
      [
        {
          type: "choice-grant-bundle",
          bundleKey: "lineage",
          options: [
            {
              id: "forest",
              grants: [
                {
                  type: "choice-grant-bundle",
                  bundleKey: "gift",
                  options: [{ id: "sight", grants: [{ type: "darkvision", range: 60 }] }],
                },
              ],
            },
            { id: "stone", grants: [{ type: "hp-per-level", amount: 1 }] },
          ],
        },
      ],
      { prefix: "trait", level: 1 }
    );
    expect(result.choices).toHaveLength(2);
    expect(result.choices[1]?.parent).toEqual({
      choiceId: result.choices[0]?.id,
      optionId: "forest",
    });
    expect(result.benefits).toEqual([]);
    expect(result.choices[1]?.options[0]?.benefits).toEqual([
      { kind: "sense", sense: "darkvision", meters: 18.288 },
    ]);
  });
  it("uses one declared casting ability for multiple spell permissions", () => {
    const result = normalizeCreationGrants(
      [
        {
          type: "choice-cantrip",
          amount: 2,
          classSpellList: "wizard",
          spellAbilityChoice: ["INT", "WIS", "CHA"],
        },
        {
          type: "choice-spell",
          amount: 1,
          maxLevel: 1,
          classSpellList: "wizard",
          spellAbilityChoice: ["INT", "WIS", "CHA"],
          freeCastSource: { sourceId: "gift", rest: "long", usesPerRest: 1 },
        },
      ],
      {
        prefix: "gift",
        level: 1,
        casting: { kind: "choice", id: "casting", abilities: ["INT", "WIS", "CHA"] },
      }
    );
    expect(
      result.choices.filter((c) =>
        c.options.some((o) => o.benefits.some((b) => b.kind === "casting-ability"))
      )
    ).toHaveLength(1);
    const spellChoices = result.choices.filter((c) => c.pool?.query.kind === "spell");
    expect(
      spellChoices.map((c) =>
        c.selectedGrant?.kind === "spell" ? c.selectedGrant.ability : null
      )
    ).toEqual([{ choice: "casting" }, { choice: "casting" }]);
    expect(result.benefits.some((b) => b.kind === "spellcasting")).toBe(false);
    expect(spellChoices[1]?.selectedGrant).toMatchObject({
      entitlements: [
        { policy: "prepared" },
        { policy: "free-cast", uses: 1, rest: "long" },
      ],
    });
  });
  it("keeps inferred casting choices under their own branch and ability domain", () => {
    const result = normalizeCreationGrants(
      [
        {
          type: "choice-grant-bundle",
          bundleKey: "gift",
          options: [
            {
              id: "mind",
              grants: [
                { type: "choice-cantrip", amount: 1, spellAbilityChoice: ["INT", "WIS"] },
              ],
            },
            {
              id: "voice",
              grants: [
                { type: "choice-cantrip", amount: 1, spellAbilityChoice: ["CHA"] },
              ],
            },
          ],
        },
      ],
      { prefix: "source", level: 1 }
    );
    const casting = result.choices.filter((c) =>
      c.options.some((o) => o.benefits.some((b) => b.kind === "casting-ability"))
    );
    expect(casting).toHaveLength(2);
    expect(casting.map((c) => c.parent?.optionId)).toEqual(["mind", "voice"]);
    expect(casting.map((c) => c.options.map((o) => o.id))).toEqual([
      ["intelligence", "wisdom"],
      ["charisma"],
    ]);
  });
  it("retains later and conditional mechanics without applying their creation facts", () => {
    const result = normalizeCreationGrants(
      [
        { type: "always-prepared-spell", spellId: "misty-step", minLevel: 3 },
        { type: "speed", amount: 10, round1: true },
        { type: "hp-per-level", amount: 2 },
        { type: "choice-expertise", amount: 2 },
      ],
      { prefix: "feature", level: 1 }
    );
    expect(result.benefits).toEqual([{ kind: "hp-per-level", amount: 2 }]);
    expect(result.choices[0]).toMatchObject({
      phase: "dependent",
      pool: { query: { kind: "proficiency", proficientOnly: true } },
      selectedGrant: { kind: "expertise", category: "skill" },
    });
    expect(result.deferred.map((d) => d.grant.type)).toEqual([
      "always-prepared-spell",
      "speed",
    ]);
  });
});
