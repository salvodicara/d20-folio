/**
 * damage-intake — the RA-05 defense math + the RA-03 0-HP rule predicates.
 *
 * SRD 5.2.1 is the spec:
 *  - "Resistance … damage of that type is halved against you (round down)."
 *  - "Vulnerability … damage of that type is doubled."
 *  - Immunity → no damage of that type.
 *  - Order of application: all other modifiers (the flat reductions) FIRST,
 *    then Resistance, then Vulnerability.
 *  - No stacking: multiple instances of Resistance to one instance of damage
 *    count as one (a type resistance + a source resistance halve ONCE).
 *  - "Death Saving Throws — Damage at 0 Hit Points": one failure, two on a
 *    crit, instant death when the damage ≥ the HP maximum.
 *  - "Instant Death — Massive Damage": dead when the remainder past 0 ≥ max.
 */

import { describe, it, expect } from "vitest";
import {
  NO_DEFENSES,
  defendedDamageTypes,
  deathSaveFailuresFromDamage,
  isInstantDeathAtZero,
  isMassiveDamageDeath,
  resolveDamageIntake,
  resolveDamagePart,
  type DamageDefenses,
} from "@/lib/damage-intake";
import type { DamageType } from "@/data/types";

/** Build a defenses bag from shorthand. */
function defenses(d: {
  resist?: DamageType[];
  immune?: DamageType[];
  vuln?: DamageType[];
  sources?: Array<"spell">;
  flat?: Array<{ types: DamageType[]; amount: number }>;
}): DamageDefenses {
  return {
    resistances: new Set(d.resist ?? []),
    immunities: new Set(d.immune ?? []),
    vulnerabilities: new Set(d.vuln ?? []),
    sourceResistances: new Set(d.sources ?? []),
    flatReductions: (d.flat ?? []).map((f) => ({
      damageTypes: f.types,
      amount: f.amount,
    })),
  };
}

describe("resolveDamagePart — RAW order of application", () => {
  it("an untyped part passes verbatim (the override-first fast path)", () => {
    const p = resolveDamagePart(
      { amount: 12 },
      defenses({ resist: ["slashing"], immune: ["poison"] })
    );
    expect(p.net).toBe(12);
    expect(p.resisted).toBe(false);
  });

  it("a typed part with no matching defense passes verbatim", () => {
    const p = resolveDamagePart(
      { amount: 12, type: "fire" },
      defenses({ resist: ["cold"] })
    );
    expect(p.net).toBe(12);
  });

  it("resistance halves, rounding DOWN (7 → 3)", () => {
    const p = resolveDamagePart(
      { amount: 7, type: "slashing" },
      defenses({ resist: ["slashing"] })
    );
    expect(p).toMatchObject({ resisted: true, net: 3 });
  });

  it("immunity zeroes the part outright", () => {
    const p = resolveDamagePart(
      { amount: 12, type: "poison" },
      defenses({ immune: ["poison"], resist: ["poison"] })
    );
    expect(p).toMatchObject({ immune: true, net: 0 });
  });

  it("vulnerability doubles", () => {
    const p = resolveDamagePart(
      { amount: 9, type: "fire" },
      defenses({ vuln: ["fire"] })
    );
    expect(p).toMatchObject({ doubled: true, net: 18 });
  });

  it("flat reduction applies BEFORE resistance (12 − 3 = 9 → 4), per the order rule", () => {
    const p = resolveDamagePart(
      { amount: 12, type: "slashing" },
      defenses({
        resist: ["slashing"],
        flat: [{ types: ["slashing", "bludgeoning"], amount: 3 }],
      })
    );
    expect(p).toMatchObject({ flatReduction: 3, resisted: true, net: 4 });
  });

  it("flat reduction never drives a part negative", () => {
    const p = resolveDamagePart(
      { amount: 2, type: "piercing" },
      defenses({ flat: [{ types: ["piercing"], amount: 5 }] })
    );
    expect(p).toMatchObject({ flatReduction: 2, net: 0 });
  });

  it("a source resistance (Abjurer 'spell') halves like a type resistance", () => {
    const p = resolveDamagePart(
      { amount: 11, type: "fire", source: "spell" },
      defenses({ sources: ["spell"] })
    );
    expect(p).toMatchObject({ resisted: true, net: 5 });
  });

  it("NO STACKING — a type resistance + a source resistance halve ONCE", () => {
    const p = resolveDamagePart(
      { amount: 12, type: "fire", source: "spell" },
      defenses({ resist: ["fire"], sources: ["spell"] })
    );
    expect(p.net).toBe(6);
  });

  it("resistance then vulnerability on one type: halve (floor) then double (7 → 3 → 6)", () => {
    const p = resolveDamagePart(
      { amount: 7, type: "fire" },
      defenses({ resist: ["fire"], vuln: ["fire"] })
    );
    expect(p).toMatchObject({ resisted: true, doubled: true, net: 6 });
  });
});

describe("resolveDamageIntake — multi-part hits", () => {
  it("totals the per-part nets (Flame Tongue: 8 slashing resisted + 7 fire)", () => {
    const r = resolveDamageIntake(
      [
        { amount: 8, type: "slashing" },
        { amount: 7, type: "fire" },
      ],
      defenses({ resist: ["slashing"] })
    );
    expect(r.rawTotal).toBe(15);
    expect(r.netTotal).toBe(11); // 4 + 7
    expect(r.parts).toHaveLength(2);
  });

  it("drops zero/negative parts", () => {
    const r = resolveDamageIntake(
      [{ amount: 0 }, { amount: -3 }, { amount: 5 }],
      NO_DEFENSES
    );
    expect(r.parts).toHaveLength(1);
    expect(r.netTotal).toBe(5);
  });
});

describe("defense-surface helpers", () => {
  it("defendedDamageTypes = the union of type-keyed defenses, sorted", () => {
    expect(
      defendedDamageTypes(
        defenses({
          resist: ["slashing"],
          immune: ["poison"],
          vuln: ["fire"],
          flat: [{ types: ["bludgeoning", "slashing"], amount: 3 }],
        })
      )
    ).toEqual(["bludgeoning", "fire", "poison", "slashing"]);
  });
});

describe("0-HP predicates — SRD 'Death Saving Throws' + 'Instant Death'", () => {
  it("damage at 0 = one failure; a Critical Hit = two", () => {
    expect(deathSaveFailuresFromDamage(false)).toBe(1);
    expect(deathSaveFailuresFromDamage(true)).toBe(2);
  });

  it("instant death at 0 when the damage EQUALS or exceeds the max (boundary)", () => {
    expect(isInstantDeathAtZero(43, 44)).toBe(false);
    expect(isInstantDeathAtZero(44, 44)).toBe(true);
    expect(isInstantDeathAtZero(45, 44)).toBe(true);
  });

  it("massive damage on the drop: remainder past temp + current ≥ max (boundary)", () => {
    // current 8, temp 2, max 44 → remainder = dmg − 10.
    expect(isMassiveDamageDeath(53, 8, 2, 44)).toBe(false); // remainder 43
    expect(isMassiveDamageDeath(54, 8, 2, 44)).toBe(true); // remainder 44
  });
});
