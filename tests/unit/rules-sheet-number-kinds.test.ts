/**
 * The passive sheet-number Grant kinds compile to Rules (ADR-0010, M1, #1431): an
 * ability-check bonus, a skill's alternative ability and an Unarmed Strike's
 * alternative damage type. Their readers take the folded rules, not a bespoke list.
 */
import { describe, expect, it } from "vitest";

import { effectiveSkillAbility, resolveAbilityCheckBonus } from "@/lib/compute";
import type { Grant } from "@/lib/grant-schema";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { compileGrant, ruleFlagIds } from "@/lib/rules";

const SCORES = { STR: 16, DEX: 12, CON: 10, INT: 10, WIS: 14, CHA: 8 } as const;

const source = (id: string, grants: Grant[], key?: string): GrantSource => ({
  id,
  ...(key ? { ref: { kind: "spell" as const, key } } : {}),
  grants,
});

const checkBonus = (sources: GrantSource[], skill: string, ability: "DEX" | "WIS") =>
  resolveAbilityCheckBonus(evaluateGrants(sources).values, skill, ability, {
    ...SCORES,
  });

describe("ability-check-bonus", () => {
  it("compiles a flat bonus, its own floor folded in, onto the check it names", () => {
    expect(
      compileGrant({ type: "ability-check-bonus", appliesTo: "stealth", value: 10 })
    ).toEqual([{ op: "add", target: "check:stealth", value: 10 }]);
    expect(
      compileGrant({
        type: "ability-check-bonus",
        appliesTo: "all-checks",
        value: -2,
        min: 1,
      })
    ).toEqual([{ op: "add", target: "check:all-checks", value: 1 }]);
  });

  it("compiles an ability-modifier bonus to an ability term with its floor", () => {
    expect(
      compileGrant({
        type: "ability-check-bonus",
        appliesTo: "INT-checks",
        ability: "WIS",
        min: 1,
      })
    ).toEqual([
      { op: "add", target: "check:INT-checks", value: { ability: "WIS", min: 1 } },
    ]);
    // "modifier" with no ability adds nothing (as the bespoke reader did).
    expect(compileGrant({ type: "ability-check-bonus", appliesTo: "stealth" })).toEqual(
      []
    );
  });

  it("adds the skill's, the ability's and the all-checks bonuses for one check", () => {
    const sources = [
      source("a", [{ type: "ability-check-bonus", appliesTo: "stealth", value: 10 }]),
      source("b", [{ type: "ability-check-bonus", appliesTo: "all-checks", value: 1 }]),
      source("c", [
        { type: "ability-check-bonus", appliesTo: "DEX-checks", ability: "WIS", min: 1 },
      ]),
      source("d", [{ type: "ability-check-bonus", appliesTo: "arcana", value: 5 }]),
    ];
    // 10 (stealth) + 1 (all) + max(WIS +2, 1) (DEX checks); arcana is another check.
    expect(checkBonus(sources, "stealth", "DEX")).toBe(13);
    expect(checkBonus(sources, "insight", "WIS")).toBe(1);
  });

  it("keeps today's stacking: the same effect from two sources still adds", () => {
    const pass = (caster: string) =>
      source(
        `${caster}:pass-without-trace`,
        [{ type: "ability-check-bonus", appliesTo: "stealth", value: 10 }],
        "pass-without-trace"
      );
    expect(checkBonus([pass("a"), pass("b")], "stealth", "DEX")).toBe(20);
  });
});

describe("skill-ability-option", () => {
  it("compiles to one flag per skill", () => {
    expect(
      compileGrant({
        type: "skill-ability-option",
        skills: ["stealth", "athletics"],
        ability: "WIS",
      })
    ).toEqual([
      { op: "flag", target: "skill:ability-option:stealth@WIS" },
      { op: "flag", target: "skill:ability-option:athletics@WIS" },
    ]);
  });

  it("lets the skill use the better of its own and the offered abilities", () => {
    const values = evaluateGrants([
      source("a", [
        { type: "skill-ability-option", skills: ["stealth"], ability: "WIS" },
      ]),
      source("b", [
        { type: "skill-ability-option", skills: ["stealth"], ability: "STR" },
      ]),
    ]).values;
    expect(effectiveSkillAbility("stealth", "DEX", values, { ...SCORES })).toBe("STR");
    expect(effectiveSkillAbility("arcana", "INT", values, { ...SCORES })).toBe("INT");
    // A tie keeps the skill's own ability.
    expect(
      effectiveSkillAbility("stealth", "DEX", values, { ...SCORES, STR: 12, WIS: 12 })
    ).toBe("DEX");
  });
});

describe("unarmed-strike-damage-type-option", () => {
  it("compiles to a flag per damage type, deduped in grant order", () => {
    expect(
      compileGrant({ type: "unarmed-strike-damage-type-option", toType: "force" })
    ).toEqual([{ op: "flag", target: "unarmed:damage-type:force" }]);
    const option = (toType: "force" | "piercing") =>
      source(toType, [{ type: "unarmed-strike-damage-type-option", toType }]);
    const values = evaluateGrants([
      option("piercing"),
      option("force"),
      option("piercing"),
    ]).values;
    expect(ruleFlagIds(values, "unarmed:damage-type:")).toEqual(["piercing", "force"]);
  });
});
