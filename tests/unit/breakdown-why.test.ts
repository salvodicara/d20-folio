/**
 * The breakdown WHY layer — register → presenter.
 *
 * A breakdown row is a receipt: it says WHAT sums. The why layer adds the answer
 * to "why?" — a locale-free `BreakdownWhy` the engine attaches at the exact seam
 * that applied the rule, plus `fromDice` when a rule REPLACED a printed die.
 * This pins the two halves the render edge depends on:
 *
 *  1. the SEAMS report their winner's provenance (`effectiveWeaponDie`,
 *     `resolveWeaponAttackStat`) instead of a bare value, so no consumer
 *     re-derives which rule won;
 *  2. the PRESENTER (`localizeBreakdown` / `resolveWhy`) resolves every `LocText`
 *     — the rule lead-in and any `{ loc }` param — in BOTH locales, and leaves
 *     the prose `term` + scalar params structured for the edge's `t(...)`.
 *
 * BLIND SPOT: this file proves the register and the presenter, NOT the emission
 * DECISIONS (which rows earn a why on a real character) — those are derived from
 * the live fixtures in `content-pack/tests/unit/monk-weapon-dex.test.ts` and the
 * cross-fixture i18n-resolvability sweep in `value-breakdown.guard.test.ts` —
 * and NOT the rendered accordion, which is `breakdown-tip-why.test.tsx`.
 */
import { describe, expect, it } from "vitest";
import { effectiveWeaponDie, resolveWeaponAttackStat } from "@/lib/compute";
import { localizeBreakdown } from "@/lib/views/combat-action-view";
import { resolveWhy } from "@/lib/views/srd-i18n";
import { abilityPart, type RawBreakdownPart } from "@/lib/value-breakdown";
import { srdText, uiText } from "@/lib/loc-text";
import { localizeSrd } from "@/i18n/resolver";
import i18n from "@/i18n";

const SCORES = { STR: 8, DEX: 17, CON: 14, INT: 10, WIS: 16, CHA: 8 };
/** No deferred `classSpecific:<key>` in play — a fixed die needs no resolver. */
const noDeferred = () => undefined;

describe("effectiveWeaponDie — reports the winner, not just the die", () => {
  it("an upgrade that BEATS the printed die returns the substitution + its source", () => {
    // A Dagger prints 1d4; the Monk's d6 Martial Arts die replaces it.
    expect(
      effectiveWeaponDie(
        "1d4",
        true,
        [
          {
            weaponScope: "monk-melee",
            dieUpgrade: "d6",
            sourceId: "monk-martial-arts",
          },
        ],
        noDeferred
      )
    ).toEqual({ die: "1d6", replaced: "1d4", sourceId: "monk-martial-arts" });
  });

  it("an upgrade that does NOT beat the printed die reports no substitution", () => {
    // A Shortsword prints 1d6; a d6 Martial Arts die is not larger, so nothing
    // was replaced and the row must stay a plain receipt line (rule 19).
    expect(
      effectiveWeaponDie(
        "1d6",
        true,
        [{ weaponScope: "monk-melee", dieUpgrade: "d6", sourceId: "monk-martial-arts" }],
        noDeferred
      )
    ).toEqual({ die: "1d6" });
  });

  it("a non-Monk weapon is never touched by a monk-melee upgrade", () => {
    expect(
      effectiveWeaponDie(
        "2d6",
        false,
        [{ weaponScope: "monk-melee", dieUpgrade: "d12", sourceId: "monk-martial-arts" }],
        noDeferred
      )
    ).toEqual({ die: "2d6" });
  });
});

describe("resolveWeaponAttackStat — reports WHY the ability won", () => {
  const stat = (
    properties: string[],
    abilities: Parameters<typeof resolveWeaponAttackStat>[0]["weaponAttackAbilities"],
    isMonkMelee = false
  ) =>
    resolveWeaponAttackStat({
      weaponType: "melee",
      properties,
      scores: SCORES,
      weaponAttackAbilities: abilities,
      isMonkMelee,
    });

  it("a plain STR weapon reports the default — nothing to explain", () => {
    expect(stat(["Heavy"], [])).toEqual({ ability: "STR", reason: "default" });
  });

  it("a Finesse weapon reports the best-of choice even when it lands on DEX", () => {
    expect(stat(["Finesse"], [])).toEqual({ ability: "DEX", reason: "finesse" });
  });

  it("a monk-scoped swap reports `monk-swap` + the displaced ability + its source", () => {
    expect(
      stat(
        [],
        [
          {
            ability: "DEX",
            magicOnly: false,
            weaponScope: "monk-melee",
            sourceId: "monk-martial-arts",
          },
        ],
        true
      )
    ).toEqual({
      ability: "DEX",
      reason: "monk-swap",
      displaced: "STR",
      sourceId: "monk-martial-arts",
    });
  });

  it("any OTHER feature swap reports the generic `swap` (its own prose)", () => {
    expect(
      stat([], [{ ability: "WIS", magicOnly: false, sourceId: "some-feature" }])
    ).toEqual({
      ability: "WIS",
      reason: "swap",
      displaced: "STR",
      sourceId: "some-feature",
    });
  });
});

describe("resolveWhy — the presenter resolves every LocText, in both locales", () => {
  for (const locale of ["en", "it"] as const) {
    it(`resolves the rule lead-in and { loc } params (${locale})`, () => {
      const line = resolveWhy(
        {
          term: "breakdown.why.dieUpgrade",
          params: {
            die: "1d6",
            printed: "1d4",
            level: 3,
            cls: { loc: srdText("class", "monk", "name") },
          },
          rule: { loc: srdText("class-feature", "monk-martial-arts", "name") },
        },
        locale
      );
      expect(line).toEqual({
        // The prose key + its SCALAR params stay structured — the edge runs t().
        term: "breakdown.why.dieUpgrade",
        params: {
          die: "1d6",
          printed: "1d4",
          level: 3,
          cls: localizeSrd("class", "monk", "name", locale),
        },
        rule: localizeSrd("class-feature", "monk-martial-arts", "name", locale),
      });
    });
  }

  it("resolves a `ui` chrome ref param (the damage-type word a rider names)", () => {
    const en = resolveWhy(
      {
        term: "breakdown.why.rider",
        params: { type: { loc: uiText("srd.damage_necrotic") } },
      },
      "en"
    );
    const it_ = resolveWhy(
      {
        term: "breakdown.why.rider",
        params: { type: { loc: uiText("srd.damage_necrotic") } },
      },
      "it"
    );
    expect(en.params?.type).toBe("Necrotic");
    expect(it_.params?.type).toBe("Necrotico");
  });

  it("omits `rule` and `params` entirely when the why carries none", () => {
    expect(resolveWhy({ term: "breakdown.why.monkAbilitySwap" }, "en")).toEqual({
      term: "breakdown.why.monkAbilitySwap",
    });
  });
});

describe("localizeBreakdown — threads why + fromDice onto the display line", () => {
  const parts: RawBreakdownPart[] = [
    {
      label: { loc: srdText("equipment", "dagger", "name") },
      dice: "1d6",
      fromDice: "1d4",
      why: {
        term: "breakdown.why.dieUpgrade",
        params: { die: "1d6", printed: "1d4", level: 3 },
        rule: { loc: srdText("class-feature", "monk-martial-arts", "name") },
      },
    },
    abilityPart("DEX", 3, undefined, { term: "breakdown.why.finesse" }),
    // The control: a plain row must stay EXACTLY as it was — no why, no fromValue.
    abilityPart("STR", 1),
  ];

  for (const locale of ["en", "it"] as const) {
    it(`carries the substitution + explanation, and leaves plain rows plain (${locale})`, () => {
      const [die, dex, str] = localizeBreakdown(parts, locale);
      expect(die).toMatchObject({
        kind: "loc",
        value: "1d6",
        fromValue: "1d4",
        label: localizeSrd("equipment", "dagger", "name", locale),
      });
      expect(die?.why?.rule).toBe(
        localizeSrd("class-feature", "monk-martial-arts", "name", locale)
      );
      expect(dex?.why?.term).toBe("breakdown.why.finesse");
      expect(str?.why).toBeUndefined();
      expect(str).not.toHaveProperty("fromValue");
    });
  }
});

describe("every breakdown.why.* prose key exists in BOTH shards", () => {
  // DERIVED from the EN shard (never a list maintained beside this test): each
  // key must resolve to real prose in both locales — a missing IT key would throw
  // at render on the very tap the feature exists for.
  const keys = Object.keys(
    (
      i18n.getResourceBundle("en", "common") as {
        breakdown: { why: Record<string, string> };
      }
    ).breakdown.why
  ).map((k) => `breakdown.why.${k}`);

  it("derives a non-empty key set", () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  for (const locale of ["en", "it"] as const) {
    it(`resolves every key in ${locale}`, () => {
      for (const key of keys) {
        const value = i18n.getFixedT(locale)(key);
        expect(value, key).not.toBe(key);
        expect(value.length, key).toBeGreaterThan(0);
      }
    });
  }
});
